#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { registerValidateTool } from "./tools/validate.js";

// Create the MCP server. The name and version are what AI tools see.
const server = new McpServer({
  name: "umple-mcp",
  version: "0.1.0",
});

// umple_validate: checks Umple code and returns its errors and warnings.
registerValidateTool(server);

// Start the server over stdio: the AI tool starts this program and talks to it
// through stdin/stdout. Never use console.log here, it would break the messages.
// console.error is safe because it writes to stderr.
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("umple-mcp server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
