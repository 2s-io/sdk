import { spawn } from 'node:child_process';
import fs from 'node:fs';

const CLI = process.env.MCP_CLI_PATH || '/tmp/mcp-audit/node_modules/@2sio/mcp/dist/cli.js';

const env = { ...process.env };
const child = spawn('node', [CLI], { env, stdio: ['pipe', 'pipe', 'pipe'] });

let buf = '';
const pending = new Map();

child.stdout.on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch (e) {
      console.error('non-json stdout:', line);
    }
  }
});

let stderrBuf = '';
child.stderr.on('data', (d) => { stderrBuf += d.toString(); });

function send(id, method, params) {
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`timeout waiting for id=${id} method=${method}`));
      }
    }, 60000);
  });
}

async function main() {
  await new Promise((r) => setTimeout(r, 600));
  const init = await send(1, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'audit', version: '0.0.1' },
  });
  console.log('=== initialize serverInfo ===');
  console.log(JSON.stringify(init.result?.serverInfo, null, 2));

  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  const list = await send(2, 'tools/list', {});
  const tools = list.result?.tools ?? [];
  console.log('=== tools/list count =', tools.length);
  fs.writeFileSync('/tmp/mcp-audit/tools.json', JSON.stringify(tools, null, 2));
  console.log('Names:', tools.map((t) => t.name).sort().join(', '));

  console.log('=== calling wikipedia.summary { title: "Photosynthesis" } ===');
  const call = await send(3, 'tools/call', {
    name: 'wikipedia.summary',
    arguments: { title: 'Photosynthesis' },
  });
  const text = JSON.stringify(call.result, null, 2);
  console.log(text.slice(0, 3000));

  console.log('=== server stderr (first 2000 chars) ===');
  console.log(stderrBuf.slice(0, 2000));
  child.kill();
  process.exit(0);
}

main().catch((e) => {
  console.error('DRIVER ERROR:', e.message);
  console.error('--- stderr from server ---');
  console.error(stderrBuf);
  child.kill();
  process.exit(1);
});
