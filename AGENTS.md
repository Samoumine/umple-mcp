# umple-mcp

MCP (Model Context Protocol) server for Umple, so AI tools (Claude Code, Cursor, VS Code…) can use Umple directly. Issue: umple/umple#2275 (https://github.com/umple/umple/issues/2275)

## Commands
- `npm install`: install dependencies
- `npm run build`: compile `src/` to `build/`
- `npm run smoke`: build, then start the server and call its tools once
- `npm run inspect`: build, then open the server in MCP Inspector

## Rules
- Never write to stdout in the server (no `console.log`): stdout carries the MCP messages. Use `console.error`.
- Call `umplesync.jar` directly, never `compiler.php`.
- Refer to the issue as `umple/umple#2275`, never plain `#2275` (that would link to this repo's own issues).

## Commits
Same format as umple/umple: `type(scope): summary`, e.g. `feat(validate): add umple_validate tool`
Every commit says "Part of umple/umple#2275". Only the last PR says "Fixes umple/umple#2275".
