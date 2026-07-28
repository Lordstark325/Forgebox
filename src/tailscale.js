'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function resolveBinary() {
  if (process.env.FORGEBOX_TAILSCALE) return process.env.FORGEBOX_TAILSCALE;
  if (process.platform === 'win32') {
    const candidates = [
      process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Tailscale', 'tailscale.exe'),
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Tailscale', 'tailscale.exe')
    ].filter(Boolean);
    const installed = candidates.find(candidate => fs.existsSync(candidate));
    if (installed) return installed;
  }
  return 'tailscale';
}

const TAILSCALE = resolveBinary();
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

function buildShareArgs({ localPort, httpsPort, path: servePath }) {
  const args = ['serve', '--bg', '--yes', `--https=${httpsPort}`];
  if (servePath !== '/') args.push(`--set-path=${servePath}`);
  args.push(`http://127.0.0.1:${localPort}`);
  return args;
}

function buildUnshareArgs({ httpsPort, path: servePath }) {
  const args = ['serve', `--https=${httpsPort}`];
  if (servePath !== '/') args.push(`--set-path=${servePath}`);
  args.push('off');
  return args;
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

async function share(options) {
  await run(buildShareArgs(options), 60000);
  return serveStatus();
}

async function unshare(options) {
  await run(buildUnshareArgs(options), 60000);
  return serveStatus();
}

module.exports = {
  status,
  serveStatus,
  share,
  unshare,
  _test: { buildShareArgs, buildUnshareArgs, parseJson }
};
