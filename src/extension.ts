import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CopilotItem {
	name: string;
	filePath: string;
	displayPath: string;
	description?: string;
	model?: string;
	source: 'workspace' | 'user';
}

interface CopilotData {
	agents: CopilotItem[];
	instructions: CopilotItem[];
	prompts: CopilotItem[];
	skills: CopilotItem[];
	hooks: CopilotItem[];
	mcpServers: CopilotItem[];
	scannedAt: Date;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function getNonce(): string {
	let text = '';
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return text;
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function safeReadFile(filePath: string): string {
	try { return fs.readFileSync(filePath, 'utf8'); } catch { return ''; }
}

function parseYamlFrontmatter(content: string): Record<string, string> {
	const result: Record<string, string> = {};
	if (!content.startsWith('---')) { return result; }
	const end = content.indexOf('\n---', 3);
	if (end === -1) { return result; }
	for (const line of content.slice(3, end).trim().split('\n')) {
		const colon = line.indexOf(':');
		if (colon > 0) {
			const key = line.slice(0, colon).trim();
			const val = line.slice(colon + 1).trim().replace(/^['"]|['"]$/g, '');
			if (val) { result[key] = val; }
		}
	}
	return result;
}

// ── Scanner ───────────────────────────────────────────────────────────────────

async function scanCopilotFiles(): Promise<CopilotData> {
	const data: CopilotData = {
		agents: [], instructions: [], prompts: [],
		skills: [], hooks: [], mcpServers: [],
		scannedAt: new Date(),
	};

	for (const folder of vscode.workspace.workspaceFolders ?? []) {
		const root = folder.uri.fsPath;

		// ── Custom Agents (.github/agents/, .claude/agents/) ──────────────────
		const agentPathsSeen = new Set<string>();
		for (const glob of ['.github/agents/*.md', '.github/agents/*.agent.md', '.claude/agents/*.md']) {
			const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, glob), null, 200);
			for (const f of files) {
				if (agentPathsSeen.has(f.fsPath)) { continue; }
				agentPathsSeen.add(f.fsPath);
				const fm = parseYamlFrontmatter(safeReadFile(f.fsPath));
				const base = path.basename(f.fsPath).replace(/\.agent\.md$|\.md$/, '');
				data.agents.push({
					name: fm.name || base,
					filePath: f.fsPath,
					displayPath: path.relative(root, f.fsPath).replace(/\\/g, '/'),
					description: fm.description,
					model: fm.model,
					source: 'workspace',
				});
			}
		}

		// ── Custom Instructions ────────────────────────────────────────────────
		const instrSeen = new Set<string>();

		// All *.instructions.md files anywhere in the workspace (covers root-level,
		// .github/instructions/, .vscode/, sub-folders, etc.)
		const allInstrFiles = await vscode.workspace.findFiles(
			new vscode.RelativePattern(folder, '**/*.instructions.md'),
			'{**/node_modules/**,**/.git/**}',
			500
		);
		for (const f of allInstrFiles) {
			instrSeen.add(f.fsPath);
			const fm = parseYamlFrontmatter(safeReadFile(f.fsPath));
			const base = path.basename(f.fsPath).replace(/\.instructions\.md$/, '');
			data.instructions.push({
				name: fm.name || base,
				filePath: f.fsPath,
				displayPath: path.relative(root, f.fsPath).replace(/\\/g, '/'),
				description: fm.applyTo ? `applyTo: ${fm.applyTo}` : fm.description,
				source: 'workspace',
			});
		}

		// .github/copilot-instructions.md (plain .md, not caught by the glob above)
		const mainInstr = path.join(root, '.github', 'copilot-instructions.md');
		if (fs.existsSync(mainInstr) && !instrSeen.has(mainInstr)) {
			data.instructions.push({
				name: 'copilot-instructions.md',
				filePath: mainInstr,
				displayPath: '.github/copilot-instructions.md',
				description: 'Repository-wide instructions',
				source: 'workspace',
			});
		}

		const agentsMd = path.join(root, 'AGENTS.md');
		if (fs.existsSync(agentsMd)) {
			data.instructions.push({
				name: 'AGENTS.md', filePath: agentsMd, displayPath: 'AGENTS.md',
				description: 'Root agents instructions file', source: 'workspace',
			});
		}

		// ── Prompt Files (.github/prompts/) ──────────────────────────────────
		const promptFiles = await vscode.workspace.findFiles(
			new vscode.RelativePattern(folder, '.github/prompts/*.prompt.md'), null, 200
		);
		for (const f of promptFiles) {
			const fm = parseYamlFrontmatter(safeReadFile(f.fsPath));
			const base = path.basename(f.fsPath).replace('.prompt.md', '');
			data.prompts.push({
				name: fm.name || base,
				filePath: f.fsPath,
				displayPath: path.relative(root, f.fsPath).replace(/\\/g, '/'),
				description: fm.description,
				model: fm.model,
				source: 'workspace',
			});
		}

		// ── Agent Skills (.github/skills/) ────────────────────────────────────
		const skillFiles = await vscode.workspace.findFiles(
			new vscode.RelativePattern(folder, '.github/skills/*/SKILL.md'), null, 200
		);
		for (const f of skillFiles) {
			const fm = parseYamlFrontmatter(safeReadFile(f.fsPath));
			const skillName = path.basename(path.dirname(f.fsPath));
			data.skills.push({
				name: fm.name || skillName,
				filePath: f.fsPath,
				displayPath: path.relative(root, f.fsPath).replace(/\\/g, '/'),
				description: fm.description,
				source: 'workspace',
			});
		}

		// ── Hooks (.github/hooks/) ────────────────────────────────────────────
		const hookFiles = await vscode.workspace.findFiles(
			new vscode.RelativePattern(folder, '.github/hooks/*.json'), null, 200
		);
		for (const f of hookFiles) {
			data.hooks.push({
				name: path.basename(f.fsPath, '.json'),
				filePath: f.fsPath,
				displayPath: path.relative(root, f.fsPath).replace(/\\/g, '/'),
				source: 'workspace',
			});
		}

		// ── MCP Servers (mcp.json / .vscode/mcp.json) ─────────────────────────
		for (const mcpPath of [path.join(root, '.vscode', 'mcp.json'), path.join(root, 'mcp.json')]) {
			if (!fs.existsSync(mcpPath)) { continue; }
			try {
				const json = JSON.parse(safeReadFile(mcpPath));
				const servers: Record<string, unknown> = json.servers ?? json.mcpServers ?? {};
				for (const [name, cfg] of Object.entries(servers)) {
						const c = cfg as Record<string, unknown> | undefined;
					data.mcpServers.push({
						name,
						filePath: mcpPath,
						displayPath: path.relative(root, mcpPath).replace(/\\/g, '/'),
						description: (c?.description ?? c?.command) as string | undefined,
						source: 'workspace',
					});
				}
			} catch { /* invalid JSON */ }
		}
	}

	// ── User-level: ~/.copilot/ ───────────────────────────────────────────────
	const userCopilot = path.join(os.homedir(), '.copilot');

	const userAgentsDir = path.join(userCopilot, 'agents');
	if (fs.existsSync(userAgentsDir)) {
		try {
			for (const file of fs.readdirSync(userAgentsDir).filter(f => f.endsWith('.md'))) {
				const fp = path.join(userAgentsDir, file);
				const fm = parseYamlFrontmatter(safeReadFile(fp));
				const base = file.replace(/\.agent\.md$|\.md$/, '');
				data.agents.push({
					name: fm.name || base, filePath: fp,
					displayPath: `~/.copilot/agents/${file}`,
					description: fm.description, model: fm.model, source: 'user',
				});
			}
		} catch { /* ignore */ }
	}

	const userSkillsDir = path.join(userCopilot, 'skills');
	if (fs.existsSync(userSkillsDir)) {
		try {
			for (const skillDir of fs.readdirSync(userSkillsDir)) {
				const skillMd = path.join(userSkillsDir, skillDir, 'SKILL.md');
				if (!fs.existsSync(skillMd)) { continue; }
				const fm = parseYamlFrontmatter(safeReadFile(skillMd));
				data.skills.push({
					name: fm.name || skillDir, filePath: skillMd,
					displayPath: `~/.copilot/skills/${skillDir}/SKILL.md`,
					description: fm.description, source: 'user',
				});
			}
		} catch { /* ignore */ }
	}

	return data;
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────

const ICONS = {
	agent:       `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm0 1a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM1.5 14v-.5C1.5 11.02 4.46 9 8 9s6.5 2.02 6.5 4.5V14h-13zm1.03-1h11.94C14.1 11.6 11.27 10 8 10s-6.1 1.6-5.47 3z"/></svg>`,
	instruction: `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M3 2h10l1 1v10l-1 1H3l-1-1V3l1-1zm0 1v10h10V3H3zm2 2h6v1H5V5zm0 2h6v1H5V7zm0 2h4v1H5V9z"/></svg>`,
	prompt:      `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M14.5 2h-13L0 3.5v8L1.5 13H4v2.5l4-2.5h6.5l1.5-1.5v-8L14.5 2zm0 9.5H7.8L4 14v-2.5H1.5v-8h13v8zM5 6.5h6v1H5v-1zm0 2h4v1H5v-1z"/></svg>`,
	skill:       `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1l1.76 5.4H15l-4.58 3.33 1.76 5.4L8 12.4l-4.18 2.73 1.76-5.4L1.01 6.4H6.24L8 1zm0 2.24L6.6 7.4H2.54l3.46 2.52-1.32 4.06L8 11.46l3.32 2.52-1.32-4.06L13.46 7.4H9.4L8 3.24z"/></svg>`,
	hook:        `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M7.5 1A3 3 0 0 0 4.5 4v2H3v1h1.5v6.5A1.5 1.5 0 0 0 6 15h4a1.5 1.5 0 0 0 1.5-1.5V7H13V6h-1.5V4A3 3 0 0 0 8.5 1h-1zm0 1h1A2 2 0 0 1 10.5 4v2h-5V4A2 2 0 0 1 7.5 2zm-2 5h5v6.5a.5.5 0 0 1-.5.5H6a.5.5 0 0 1-.5-.5V7z"/></svg>`,
	mcp:         `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M5 1a2 2 0 0 0-2 2v3l-2 1.5V15h14V7.5L13 6V3a2 2 0 0 0-2-2H5zm0 1h6a1 1 0 0 1 1 1v3.5l.44.33L14 8.17V14H2V8.17l1.56-1.34L4 6.5V3a1 1 0 0 1 1-1zm2 7v2h2V9H7z"/></svg>`,
	file:        `<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M4 1h6.5L13 3.5V15H3V1h1zm1 1v12h7V4.5H9V2H5zm5-.29V3.5h.79L10 1.71z"/></svg>`,
	chevron:     `<svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="M2 1l4 3-4 3" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
	refresh:     `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M13.5 2.5A6.5 6.5 0 0 0 2.5 8H1l2.5 3L6 8H4.5a4.5 4.5 0 1 1 1.32 3.18l-.71.71A5.5 5.5 0 1 0 13.5 2.5z"/></svg>`,
};

// ── HTML Builder ──────────────────────────────────────────────────────────────

function buildItemHtml(item: CopilotItem): string {
	const srcBadge = item.source === 'user'
		? `<span class="badge-user">user</span>` : '';
	const desc = item.description
		? `<div class="item-desc">${escapeHtml(item.description)}</div>` : '';
	const modelBadge = item.model
		? `<span class="badge-model">${escapeHtml(item.model)}</span>` : '';
	return `<div class="item" data-path="${escapeHtml(item.filePath)}">
		<span class="item-file-icon">${ICONS.file}</span>
		<div class="item-body">
			<div class="item-name">${escapeHtml(item.name)}${modelBadge}</div>
			${desc}
			<div class="item-path">${escapeHtml(item.displayPath)}</div>
		</div>
		${srcBadge}
	</div>`;
}

interface SectionDef {
	id: string; label: string; icon: string;
	items: CopilotItem[]; emptyText: string;
}

function buildDashboardHtml(data: CopilotData): string {
	const nonce = getNonce();
	const time = data.scannedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	const hasWorkspace = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;

	const sections: SectionDef[] = [
		{ id: 'agents',       label: 'Custom Agents',       icon: ICONS.agent,       items: data.agents,       emptyText: 'No agents found (.github/agents/ · .claude/agents/)' },
		{ id: 'instructions', label: 'Custom Instructions', icon: ICONS.instruction, items: data.instructions, emptyText: 'No instruction files (*.instructions.md · .github/copilot-instructions.md · AGENTS.md)' },
		{ id: 'prompts',      label: 'Prompt Files',        icon: ICONS.prompt,      items: data.prompts,      emptyText: 'No prompt files found (.github/prompts/)' },
		{ id: 'skills',       label: 'Agent Skills',        icon: ICONS.skill,       items: data.skills,       emptyText: 'No skills found (.github/skills/)' },
		{ id: 'hooks',        label: 'Hooks',               icon: ICONS.hook,        items: data.hooks,        emptyText: 'No hooks found (.github/hooks/)' },
		{ id: 'mcp',          label: 'MCP Servers',         icon: ICONS.mcp,         items: data.mcpServers,   emptyText: 'No MCP servers configured (mcp.json · .vscode/mcp.json)' },
	];

	const statsHtml = `<div class="stats-grid">${
		sections.map(s => `<div class="stat-card" data-goto="${s.id}">
			<span class="stat-icon">${s.icon}</span>
			<div class="stat-number${s.items.length > 0 ? ' active' : ''}">${s.items.length}</div>
			<div class="stat-label">${s.label.split(' ')[0]}</div>
		</div>`).join('')
	}</div>`;

	const sectionsHtml = sections.map(s => {
		const open = s.items.length > 0;
		const body = s.items.length > 0
			? s.items.map(buildItemHtml).join('')
			: `<div class="empty-state">${escapeHtml(s.emptyText)}</div>`;
		return `<div class="section">
			<div class="section-header" data-section="${s.id}">
				<span class="chevron${open ? ' open' : ''}">${ICONS.chevron}</span>
				<span class="section-icon">${s.icon}</span>
				<span class="section-title">${s.label}</span>
				<span class="section-count${s.items.length === 0 ? ' zero' : ''}">${s.items.length}</span>
			</div>
			<div id="s-${s.id}" class="section-body${open ? ' open' : ''}">${body}</div>
		</div>`;
	}).join('');

	const mainContent = hasWorkspace
		? statsHtml + sectionsHtml
		: `<div class="no-workspace">
			<div class="nw-icon">${ICONS.agent}</div>
			<p>Open a workspace folder to see your Copilot configuration.</p>
		  </div>`;

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:12px;color:var(--vscode-foreground);background:transparent;line-height:1.4}

/* ── Stats Grid ──────────────────────────────── */
.stats-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:8px;border-bottom:1px solid var(--vscode-widget-border,rgba(128,128,128,.2))}
.stat-card{display:flex;flex-direction:column;align-items:center;padding:7px 3px 5px;border-radius:5px;cursor:pointer;background:var(--vscode-editor-inactiveSelectionBackground,rgba(128,128,128,.08));border:1px solid transparent;gap:3px;user-select:none;transition:background .1s,border-color .1s}
.stat-card:hover{background:var(--vscode-list-hoverBackground);border-color:var(--vscode-focusBorder,rgba(128,128,128,.35))}
.stat-icon{opacity:.7;display:flex;align-items:center}
.stat-number{font-size:17px;font-weight:700;line-height:1;color:var(--vscode-descriptionForeground)}
.stat-number.active{color:var(--vscode-textLink-foreground)}
.stat-label{font-size:9px;text-transform:uppercase;letter-spacing:.4px;color:var(--vscode-descriptionForeground)}

/* ── Sections ────────────────────────────────── */
.section{border-bottom:1px solid var(--vscode-widget-border,rgba(128,128,128,.12))}
.section-header{display:flex;align-items:center;padding:5px 8px;cursor:pointer;user-select:none;gap:5px}
.section-header:hover{background:var(--vscode-list-hoverBackground)}
.chevron{display:flex;align-items:center;flex-shrink:0;color:var(--vscode-descriptionForeground);transition:transform .15s ease}
.chevron.open{transform:rotate(90deg)}
.section-icon{display:flex;align-items:center;flex-shrink:0;opacity:.8}
.section-title{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;flex:1}
.section-count{font-size:10px;font-weight:600;min-width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;padding:0 4px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground)}
.section-count.zero{background:var(--vscode-editor-inactiveSelectionBackground,rgba(128,128,128,.2));color:var(--vscode-descriptionForeground)}
.section-body{display:none}
.section-body.open{display:block}

/* ── Items ───────────────────────────────────── */
.item{display:flex;align-items:flex-start;padding:3px 8px 3px 22px;cursor:pointer;gap:5px}
.item:hover{background:var(--vscode-list-hoverBackground)}
.item-file-icon{display:flex;align-items:flex-start;flex-shrink:0;padding-top:1px;opacity:.55}
.item-body{flex:1;min-width:0}
.item-name{font-size:12px;color:var(--vscode-foreground);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.item-desc{font-size:10.5px;color:var(--vscode-descriptionForeground);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}
.item-path{font-size:10px;color:var(--vscode-descriptionForeground);opacity:.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.badge-user{font-size:9px;padding:1px 5px;border-radius:3px;flex-shrink:0;align-self:flex-start;margin-top:2px;background:var(--vscode-statusBarItem-remoteBackground,#16825d);color:var(--vscode-statusBarItem-remoteForeground,#fff)}
.badge-model{display:inline-block;font-size:9px;font-weight:500;padding:0 5px;margin-left:5px;border-radius:3px;vertical-align:middle;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);opacity:.85;white-space:nowrap}
.empty-state{padding:4px 8px 6px 22px;font-size:11px;font-style:italic;color:var(--vscode-descriptionForeground);opacity:.75}

/* ── No Workspace ────────────────────────────── */
.no-workspace{display:flex;flex-direction:column;align-items:center;padding:32px 20px 20px;color:var(--vscode-descriptionForeground);gap:12px;text-align:center}
.nw-icon{opacity:.35;transform:scale(2.8)}

/* ── Footer ──────────────────────────────────── */
.footer{padding:5px 8px;font-size:10px;color:var(--vscode-descriptionForeground);opacity:.6;border-top:1px solid var(--vscode-widget-border,rgba(128,128,128,.12));text-align:center}
.footer a{color:var(--vscode-textLink-foreground);text-decoration:none;opacity:1}
.footer a:hover{text-decoration:underline}
</style>
</head>
<body>
${mainContent}
<div class="footer">Scanned at ${time} · click any file to open it<br><a href="https://awesome-copilot.github.com/" data-href="https://awesome-copilot.github.com/">✨ awesome-copilot.github.com</a></div>
<script nonce="${nonce}">
(function(){
	const vsc=acquireVsCodeApi();
	document.querySelectorAll('.section-header').forEach(h=>{
		h.addEventListener('click',()=>{
			const b=document.getElementById('s-'+h.dataset.section);
			const c=h.querySelector('.chevron');
			if(b)b.classList.toggle('open');
			if(c)c.classList.toggle('open');
		});
	});
	document.querySelectorAll('.stat-card[data-goto]').forEach(card=>{
		card.addEventListener('click',()=>{
			const id=card.dataset.goto;
			const b=document.getElementById('s-'+id);
			const h=document.querySelector('.section-header[data-section="'+id+'"]');
			if(b){b.classList.add('open');if(h){h.querySelector('.chevron')?.classList.add('open');h.scrollIntoView({behavior:'smooth',block:'nearest'});}}
		});
	});
	document.querySelectorAll('.item[data-path]').forEach(item=>{
		item.addEventListener('click',()=>vsc.postMessage({type:'openFile',path:item.dataset.path}));
	});
	document.querySelectorAll('a[data-href]').forEach(a=>{
		a.addEventListener('click',e=>{e.preventDefault();vsc.postMessage({type:'openUrl',url:a.dataset.href});});
	});
})();
</script>
</body>
</html>`;
}

// ── Webview Provider ──────────────────────────────────────────────────────────

class CopilotDashboardProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'copilotDashboard.view';
	private _view?: vscode.WebviewView;

	constructor(private readonly _extensionUri: vscode.Uri) {}

	resolveWebviewView(webviewView: vscode.WebviewView) {
		this._view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri],
		};
		webviewView.webview.onDidReceiveMessage(async (msg: { type: string; path?: string; url?: string }) => {
			if (msg.type === 'openFile' && msg.path) {
				try {
					const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(msg.path));
					await vscode.window.showTextDocument(doc);
				} catch {
					vscode.window.showErrorMessage(`Could not open file: ${msg.path}`);
				}
			} else if (msg.type === 'openUrl' && msg.url) {
				vscode.env.openExternal(vscode.Uri.parse(msg.url));
			}
		});
		this.refresh();
	}

	public async refresh() {
		if (!this._view) { return; }
		this._view.webview.html = loadingHtml();
		const data = await scanCopilotFiles();
		if (this._view) {
			this._view.webview.html = buildDashboardHtml(data);
		}
	}
}

function loadingHtml(): string {
	return `<!DOCTYPE html><html><body style="font-family:var(--vscode-font-family);color:var(--vscode-descriptionForeground);padding:24px 16px;text-align:center;opacity:.7">Scanning Copilot files…</body></html>`;
}

// ── Activate ──────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
	const provider = new CopilotDashboardProvider(context.extensionUri);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(CopilotDashboardProvider.viewType, provider),
		vscode.commands.registerCommand('copilotDashboard.refresh', () => provider.refresh()),
		vscode.workspace.onDidChangeWorkspaceFolders(() => provider.refresh()),
	);
}

export function deactivate() {}
