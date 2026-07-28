'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const tailscale = require('./tailscale');

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
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 16384) {
        req.destroy();
        reject(new Error('Request body is too large.'));
      }
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error('Request body must be valid JSON.')); }
    });
    req.on('error', reject);
  });
}

function port(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535.`);
  }
  return parsed;
}

function servePath(value) {
  const parsed = String(value || '/');
  if (!/^\/(?:[A-Za-z0-9._~-]+\/?)*$/.test(parsed) || parsed.length > 128) {
    throw new Error('Path must start with / and contain only URL-safe path characters.');
  }
  return parsed.length > 1 ? parsed.replace(/\/$/, '') : '/';
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

  if (req.method === 'GET' && url.pathname === '/api/tailscale/status') {
    try { return send(res, 200, await tailscale.status()); }
    catch (error) { return send(res, 200, { online: false, state: 'Unavailable', error: error.message }); }
  }

  if (req.method === 'GET' && url.pathname === '/api/tailscale/serve') {
    try { return send(res, 200, await tailscale.serveStatus()); }
    catch (error) { return send(res, 503, { error: error.message }); }
  }

  if (req.method === 'POST' && url.pathname === '/api/tailscale/serve') {
    try {
      const body = await readJson(req);
      const result = await tailscale.share({
        localPort: port(body.localPort, 'Local port'),
        httpsPort: port(body.httpsPort || 443, 'HTTPS port'),
        path: servePath(body.path)
      });
      return send(res, 200, { ok: true, ...result });
    } catch (error) { return send(res, 400, { error: error.message }); }
  }

  const unshareMatch = url.pathname.match(/^\/api\/tailscale\/serve\/(\d+)$/);
  if (req.method === 'DELETE' && unshareMatch) {
    try {
      const result = await tailscale.unshare({
        httpsPort: port(unshareMatch[1], 'HTTPS port'),
        path: servePath(url.searchParams.get('path') || '/')
      });
      return send(res, 200, { ok: true, ...result });
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
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8'
  };
  send(res, 200, fs.readFileSync(file), types[path.extname(file)] || 'application/octet-stream');
});

server.listen(PORT, HOST, () => console.log(`ForgeBox is running at http://${HOST}:${PORT}`));
