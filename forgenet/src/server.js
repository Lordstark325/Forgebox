'use strict';

const http = require('node:http');
const path = require('node:path');
const { Store, safeEqual, hash } = require('./store');

const MAX_BODY = 16384;

function json(res, status, value) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff'
  });
  res.end(JSON.stringify(value));
}

function body(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > MAX_BODY) reject(new Error('Request body is too large.'));
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { reject(new Error('Request body must be valid JSON.')); }
    });
    req.on('error', reject);
  });
}

function bearer(req) {
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

function validName(value) {
  const name = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/.test(name)) throw new Error('Device name is invalid.');
  return name;
}

function validPublicKey(value) {
  const key = String(value || '');
  if (!/^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/.test(key)) throw new Error('WireGuard public key is invalid.');
  return key;
}

function validEndpoint(value, optional = true) {
  if (!value && optional) return null;
  const endpoint = String(value || '');
  if (endpoint.length > 255 || !/^(?:\[[0-9a-fA-F:]+\]|[A-Za-z0-9.-]+):[1-9][0-9]{0,4}$/.test(endpoint)) {
    throw new Error('Endpoint must be a hostname or IP followed by a UDP port.');
  }
  const port = Number(endpoint.slice(endpoint.lastIndexOf(':') + 1));
  if (port > 65535) throw new Error('Endpoint port is invalid.');
  return endpoint;
}

function createServer({ store, adminToken }) {
  if (!adminToken || adminToken.length < 32) throw new Error('FORGENET_ADMIN_TOKEN must contain at least 32 characters.');
  const adminHash = hash(adminToken);
  const isAdmin = req => safeEqual(hash(bearer(req)), adminHash);

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true, service: 'forgenet', version: '0.1.0' });

      if (req.method === 'POST' && url.pathname === '/v1/enrollment-tokens') {
        if (!isAdmin(req)) return json(res, 401, { error: 'Admin authentication required.' });
        const input = await body(req);
        const ttlMinutes = Number(input.ttlMinutes || 30);
        const uses = Number(input.uses || 1);
        if (!Number.isInteger(ttlMinutes) || ttlMinutes < 1 || ttlMinutes > 1440) throw new Error('TTL must be 1–1440 minutes.');
        if (!Number.isInteger(uses) || uses < 1 || uses > 100) throw new Error('Uses must be 1–100.');
        return json(res, 201, store.createEnrollmentToken({ ttlMinutes, uses }));
      }

      if (req.method === 'POST' && url.pathname === '/v1/devices/enroll') {
        const input = await body(req);
        const result = store.enroll({
          token: String(input.token || ''), name: validName(input.name),
          publicKey: validPublicKey(input.publicKey), endpoint: validEndpoint(input.endpoint)
        });
        return json(res, 201, result);
      }

      if (req.method === 'POST' && url.pathname === '/v1/devices/heartbeat') {
        const input = await body(req);
        const device = store.authenticateDevice(String(req.headers['x-forgenet-device'] || ''), bearer(req));
        if (!device) return json(res, 401, { error: 'Device authentication required.' });
        return json(res, 200, store.heartbeat(device, validEndpoint(input.endpoint)));
      }

      if (req.method === 'GET' && url.pathname === '/v1/devices') {
        if (!isAdmin(req)) return json(res, 401, { error: 'Admin authentication required.' });
        return json(res, 200, { devices: store.listDevices() });
      }

      const revoke = url.pathname.match(/^\/v1\/devices\/([0-9a-f-]+)$/);
      if (req.method === 'DELETE' && revoke) {
        if (!isAdmin(req)) return json(res, 401, { error: 'Admin authentication required.' });
        return store.revoke(revoke[1]) ? json(res, 200, { ok: true }) : json(res, 404, { error: 'Device not found.' });
      }

      return json(res, 404, { error: 'Not found.' });
    } catch (error) {
      return json(res, 400, { error: error.message });
    }
  });
}

if (require.main === module) {
  const host = process.env.FORGENET_HOST || '127.0.0.1';
  const port = Number(process.env.FORGENET_PORT || 8787);
  const file = process.env.FORGENET_DATA || path.join(__dirname, '..', 'data', 'state.json');
  const server = createServer({ store: new Store(file), adminToken: process.env.FORGENET_ADMIN_TOKEN });
  server.listen(port, host, () => console.log(`ForgeNet control server listening on http://${host}:${port}`));
}

module.exports = { createServer, validName, validPublicKey, validEndpoint };
