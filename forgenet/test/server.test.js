'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../src/store');
const { createServer } = require('../src/server');

async function fixture() {
  const store = new Store(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'forgenet-api-')), 'state.json'));
  const server = createServer({ store, adminToken:'a'.repeat(48) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, base:`http://127.0.0.1:${server.address().port}` };
}

test('health endpoint works and admin endpoints reject anonymous callers', async t => {
  const { server, base } = await fixture(); t.after(() => server.close());
  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal((await fetch(`${base}/v1/devices`)).status, 401);
});

test('admin creates a one-time enrollment token', async t => {
  const { server, base } = await fixture(); t.after(() => server.close());
  const response = await fetch(`${base}/v1/enrollment-tokens`, { method:'POST', headers:{authorization:`Bearer ${'a'.repeat(48)}`,'content-type':'application/json'}, body:'{}' });
  const result = await response.json();
  assert.equal(response.status, 201);
  assert.match(result.token, /^fnet_enroll_/);
});
