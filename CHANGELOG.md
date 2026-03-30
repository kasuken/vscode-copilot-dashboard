# Change Log

## [0.0.3] - 2026-03-30

### Fixed

- Fixed TypeScript build errors by adding `node` and `mocha` type declarations to `tsconfig.json`.
- Renamed section labels from "Custom Agents" / "Custom Instructions" to "Agents" / "Instructions" for consistency.

### Added

- Added dashboard screenshot to `media/screenshot.png`.
- Added screenshot to the README for a visual overview of the extension.
- Added `changelog` prompt file to `.github/prompts/`.

## [0.0.2] - 2026-03-25

### Fixed

- Corrected `author` field to `publisher` in `package.json`.

## [0.0.1] - 2026-03-25

### Added

- Initial release of the Copilot Dashboard extension.
- Activity Bar view with a dedicated webview-backed dashboard.
- Scans workspace for Copilot customization files: agents, instructions, prompts, skills, hooks, and MCP servers.
- Scans user-level directories (`~/.copilot/agents/`, `~/.copilot/skills/`) for agents and skills.
- Groups results by customization type with item counts.
- Displays item descriptions and model metadata when available.
- Opens any file directly from the dashboard with a single click.
- Refresh command in the view title to rescan the workspace.
- Stats grid at the top summarizing counts per category.
- Collapsible sections per customization type.

