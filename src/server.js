'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const HOST = '127.0.0.1';
const PORT = Number(process.env.FORGEBOX_PORT || 4782);
const PUBLIC = path.join(__dirname, '..', 'public');
const bundledAdapter = path.join(__dirname, '..', 'engine', 'forgebox-engine.ps1');
const configuredEngine = process.env.FORGEBOX_ENGINE;
const ENGINE = configuredEngine || (process.platform === 'win32' ? 'powershell.exe' : 'docker');
const ENGINE_PREFIX = configuredEngine ? [] : (process.platform === 'win32'
  ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', bundledAdapter, '--'] : []);
const ENGINE_LABEL = configuredEngine || (process.platform === 'win32' ? 'ForgeBox/WSL2' : 'docker');
const MAX_OUTPUT = 1024 * 1024;

function runEngine(args, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const child = spawn(ENGINE, [...ENGINE_PREFIX, ...args], { windowsHide: true, shell: false });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), timeout);
    child.stdout.on('data', chunk => { if (stdout.length < MAX_OUTPUT) stdout += chunk; });
    child.stderr.on('data', chunk => { if (stderr.length < MAX_OUTPUT) stderr += chunk; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `Engine exited with code ${code}`));
    });
  });
}

function send(res, status, data, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
}

async function api(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/status') {
    try {
      const version = (await runEngine(['version', '--format', '{{.Server.Version}}'])).trim();
      return send(res, 200, { online: true, engine: ENGINE_LABEL, version });
    } catch (error) {
      return send(res, 200, { online: false, engine: ENGINE_LABEL, error: error.message });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/containers') {
    try {
      const raw = await runEngine(['ps', '-a', '--format', '{{json .}}']);
      const containers = raw.trim() ? raw.trim().split(/\r?\n/).map(JSON.parse) : [];
      return send(res, 200, { containers });
    } catch (error) { return send(res, 503, { error: error.message }); }
  }

  const actionMatch = url.pathname.match(/^\/api\/containers\/([a-zA-Z0-9_.-]+)\/(start|stop|restart|remove)$/);
  if (req.method === 'POST' && actionMatch) {
    const [, id, action] = actionMatch;
    const command = action === 'remove' ? ['rm', '-f', id] : [action, id];
    try {
      await runEngine(command, 60000);
      return send(res, 200, { ok: true });
    } catch (error) { return send(res, 400, { error: error.message }); }
  }

  const logsMatch = url.pathname.match(/^\/api\/containers\/([a-zA-Z0-9_.-]+)\/logs$/);
  if (req.method === 'GET' && logsMatch) {
    try {
      const logs = await runEngine(['logs', '--tail', '250', logsMatch[1]]);
      return send(res, 200, { logs });
    } catch (error) { return send(res, 400, { error: error.message }); }
  }
  return send(res, 404, { error: 'Not found' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  if (url.pathname.startsWith('/api/')) return api(req, res, url);
  const requested = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const file = path.resolve(PUBLIC, requested);
  if (!file.startsWith(path.resolve(PUBLIC)) || !fs.existsSync(file)) return send(res, 404, 'Not found', 'text/plain');
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
  send(res, 200, fs.readFileSync(file), types[path.extname(file)] || 'application/octet-stream');
});

server.listen(PORT, HOST, () => console.log(`ForgeBox is running at http://${HOST}:${PORT}`));
