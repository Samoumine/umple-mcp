# umple-mcp

This repo is temporary: it will move to [umple/umple-mcp](https://github.com/umple/umple-mcp) once that repo is created in the Umple organization.

An MCP (Model Context Protocol) server for [Umple](https://www.umple.org).
It lets AI tools such as Claude Code, Cursor and VS Code use Umple directly.

Status: early setup. For now the server only has a temporary `ping` tool;
the Umple tools come next. Progress is tracked in
[umple/umple#2275](https://github.com/umple/umple/issues/2275).

## Requirements
- Node.js 20 or later
- Java (used by the Umple tools, coming soon)
- No Graphviz needed

## Install and build
    npm install
    npm run build

## Try it
- `npm run smoke`: starts the server, lists its tools and calls them once
- `npm run inspect`: opens the server in MCP Inspector (open the printed link in a browser)

## License
MIT, see [LICENSE.md](LICENSE.md).
