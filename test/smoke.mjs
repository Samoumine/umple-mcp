// Smoke test: starts the server, lists its tools, and calls umple_validate on bad.ump
// (class Course is missing, so it must report error 5 on line 3).
// The SDK only passes a few safe environment variables to the server, so UMPLESYNC_JAR is passed explicitly.
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
const env = process.env.UMPLESYNC_JAR ? { UMPLESYNC_JAR: process.env.UMPLESYNC_JAR } : {};
const client = new Client({ name: 't', version: '1' });
await client.connect(new StdioClientTransport({ command: 'node', args: ['build/index.js'], env }));
const { tools } = await client.listTools();
console.log(JSON.stringify(tools, null, 1));
const bad = 'class Student {\n  name;\n  * -- * Course;\n}\n';
console.log(JSON.stringify(await client.callTool({ name: 'umple_validate', arguments: { files: [{ name: 'bad.ump', content: bad }] } }), null, 1));
await client.close();
