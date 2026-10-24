# umple-mcp

This repo is temporary: it will move to [umple/umple-mcp](https://github.com/umple/umple-mcp) once that repo is created in the Umple organization.

An MCP (Model Context Protocol) server for [Umple](https://www.umple.org).
It lets AI tools such as Claude Code, Cursor and VS Code use Umple directly.

Status: early. The first tool, `umple_validate`, is ready; more tools come next.
Progress is tracked in [umple/umple#2275](https://github.com/umple/umple/issues/2275).

## Tools
- `umple_validate`: checks Umple code and returns its errors and warnings (file, line, message, link to the Umple manual).

## Requirements
- Node.js 20 or later
- Java 17 or later, on the PATH
- `umplesync.jar` (from an Umple build, e.g. `~/umple/dist/umplesync.jar`), with its path in the `UMPLESYNC_JAR` environment variable
- No Graphviz needed

AI tools start the server with only a few environment variables, so pass `UMPLESYNC_JAR` explicitly when you add the server, e.g. in Claude Code:

    claude mcp add umple-mcp -e UMPLESYNC_JAR=$HOME/umple/dist/umplesync.jar -- node /path/to/umple-mcp/build/index.js

## Install and build
    npm install
    npm run build

## Try it
- `npm test`: runs the tests (the tests that need Java are skipped when `UMPLESYNC_JAR` isn't set)
- `npm run smoke`: starts the server, lists its tools and calls `umple_validate` once
- `npm run inspect`: opens the server in MCP Inspector (open the printed link in a browser)

## License
MIT, see [LICENSE.md](LICENSE.md).
