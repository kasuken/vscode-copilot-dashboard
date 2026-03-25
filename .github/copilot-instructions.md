---
applyTo: "**"
---
# Copilot Instructions for Copilot Dashboard

## Purpose

Copilot Dashboard is a VS Code extension that provides a lightweight dashboard for discovering and opening GitHub Copilot customization files in a workspace and selected user-level folders.

The extension is focused on:
- discovery
- grouping
- navigation
- lightweight metadata display

It is not focused on:
- editing files
- generating files
- validating schemas
- syncing remote resources
- adding heavy frameworks or unnecessary abstractions

## Product boundaries

When suggesting or implementing changes, preserve these product boundaries unless explicitly asked to change them.

Do:
- scan known Copilot customization file locations
- show results grouped by customization type
- display useful metadata when available
- open files directly from the dashboard
- keep the UI fast and simple
- prefer minimal, maintainable implementation

Do not:
- add AI generation features
- add file editing flows in the dashboard
- add background services unless clearly needed
- add telemetry unless explicitly requested
- add settings unless they solve a real user problem
- introduce unnecessary dependencies

## Technical stack

- Language: TypeScript
- Platform: VS Code Extension API
- UI: webview generated from `src/extension.ts`
- Linting: ESLint
- Testing: `@vscode/test-cli`, `@vscode/test-electron`

Keep the stack simple. Avoid new libraries unless they remove significant complexity.

## Architecture guidance

Prefer a small and explicit structure.

Suggested responsibilities:
- scanning logic separated from rendering logic
- file discovery rules centralized in one place
- metadata extraction isolated in small pure functions
- webview HTML generation isolated from extension activation and command registration

If the project grows, prefer splitting into files like:
- `src/extension.ts`
- `src/scanner.ts`
- `src/models.ts`
- `src/webview.ts`
- `src/parsers.ts`

Do not introduce classes unless they clearly improve clarity. Prefer small functions and plain types.

## File scanning rules

Support these workspace locations:

- Agents:
  - `.github/agents/*.md`
  - `.github/agents/*.agent.md`
  - `.claude/agents/*.md`
- Instructions:
  - `**/*.instructions.md`
  - `.github/copilot-instructions.md`
  - `AGENTS.md`
- Prompts:
  - `.github/prompts/*.prompt.md`
- Skills:
  - `.github/skills/*/SKILL.md`
- Hooks:
  - `.github/hooks/*.json`
- MCP servers:
  - `mcp.json`
  - `.vscode/mcp.json`

Support these user-level locations:
- Agents:
  - `~/.copilot/agents/*.md`
- Skills:
  - `~/.copilot/skills/*/SKILL.md`

When changing scan behavior:
- preserve existing supported locations unless explicitly removing one
- avoid duplicate results
- normalize paths consistently
- fail gracefully when folders do not exist
- do not block the UI with expensive synchronous work

## UX guidance

The dashboard should feel fast and practical.

Prefer:
- compact layout
- clear counts
- collapsible groups
- direct open actions
- minimal visual noise
- stable ordering of sections and items

Avoid:
- decorative UI
- excessive animations
- dense walls of text
- hidden actions
- unnecessary modal prompts

When adding new UI:
- keep it consistent with VS Code
- prefer accessibility and clarity over cleverness
- ensure empty states are useful

## Webview rules

Treat the webview as a simple view layer.

- Escape dynamic content safely before rendering HTML
- Do not inject raw untrusted file content into HTML
- Keep scripts minimal
- Prefer message passing over complex client-side logic
- Avoid external network dependencies
- Respect VS Code theme variables when possible

## Code style

- Prefer explicit names over short names
- Prefer pure functions where possible
- Keep functions focused and small
- Avoid deep nesting
- Use TypeScript types/interfaces for dashboard items and scan results
- Handle `undefined` and missing metadata explicitly
- Avoid clever abstractions

Naming:
- use names aligned with the domain, such as `DashboardItem`, `ScanResult`, `CustomizationType`, `scanWorkspaceFiles`, `extractAgentMetadata`
- avoid generic names like `data`, `helper`, `manager`, `util` unless the scope is very clear

## Performance guidance

This extension should stay lightweight.

- Avoid repeated filesystem scans when a single pass can work
- Avoid unnecessary parsing of file contents
- Only extract metadata that is actually displayed or needed
- Prefer async APIs where appropriate
- Keep activation lightweight

## Testing guidance

When changing behavior, add or update tests where practical.

Focus tests on:
- scan path detection
- duplicate prevention
- metadata extraction
- grouping behavior
- empty state behavior
- edge cases for missing files or malformed content

Do not add brittle tests for raw HTML formatting unless the behavior truly depends on it.

## Change strategy

When implementing a change:
1. preserve existing behavior unless the task explicitly changes it
2. make the smallest reasonable change first
3. explain trade-offs if the change introduces complexity
4. update README when user-visible behavior changes
5. avoid unrelated refactors

## Output expectations for Copilot

When generating code for this repo:
- return production-ready TypeScript
- keep diffs focused
- avoid placeholder comments
- do not invent unsupported features
- do not add dependencies without justification
- mention assumptions clearly when requirements are ambiguous