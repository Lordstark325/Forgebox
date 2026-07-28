'use strict';

const { spawn } = require('node:child_process');

const TAILSCALE = process.env.FORGEBOX_TAILSCALE || 'tailscale';
const MAX_OUTPUT = 1024 * 1024;

function run(args, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const child = spawn(TAILSCALE, args, { windowsHide: true, shell: false });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), timeout);
    child.stdout.on('data', chunk => { if (stdout.length < MAX_OUTPUT) stdout += chunk; });
    child.stderr.on('data', chunk => { if (stderr.length < MAX_OUTPUT) stderr += chunk; });
    child.on('error', error => {
      clearTimeout(timer);
      reject(new Error(error.code === 'ENOENT'
        ? 'Tailscale is not installed or is not available on PATH.'
        : error.message));
    });
    child.on('close', code => {
      clearTimeout(timer);
      code === 0
        ? resolve(stdout)
        : reject(new Error(stderr.trim() || `Tailscale exited with code ${code}`));
    });
  });
}

function parseJson(output, fallback = {}) {
  const text = output.trim();
  return text ? JSON.parse(text) : fallback;
}

async function status() {
  const data = parseJson(await run(['status', '--json']));
  const self = data.Self || {};
  return {
    online: data.BackendState === 'Running' && self.Online !== false,
    state: data.BackendState || 'Unknown',
    dnsName: String(self.DNSName || '').replace(/\.$/, ''),
    hostName: self.HostName || '',
    ips: self.TailscaleIPs || [],
    tailnet: data.CurrentTailnet?.Name || ''
  };
}

async function serveStatus() {
  const config = parseJson(await run(['serve', 'status', '--json']), {});
  return { config };
}

async function share({ localPort, httpsPort, path }) {
  const args = ['serve', '--bg', '--yes', `--https=${httpsPort}`];
  if (path !== '/') args.push(`--set-path=${path}`);
  args.push(`http://127.0.0.1:${localPort}`);
  await run(args, 60000);
  return serveStatus();
}

async function unshare({ httpsPort, path }) {
  const args = ['serve', `--https=${httpsPort}`];
  if (path !== '/') args.push(`--set-path=${path}`);
  args.push('off');
  await run(args, 60000);
  return serveStatus();
}

module.exports = { status, serveStatus, share, unshare };
