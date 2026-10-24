// Smoke test: starts the server, lists its tools, and calls ping twice
// (once with a valid input, once with a missing input that must be rejected).
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
const client = new Client({ name: 't', version: '1' });
await client.connect(new StdioClientTransport({ command: 'node', args: ['build/index.js'] }));
const { tools } = await client.listTools();
console.log(JSON.stringify(tools, null, 1));
console.log(JSON.stringify(await client.callTool({ name: 'ping', arguments: { message: 'hello' } })));
console.log(JSON.stringify(await client.callTool({ name: 'ping', arguments: {} })));
await client.close();
