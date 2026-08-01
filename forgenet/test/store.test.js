'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../src/store');

const key = character => Buffer.alloc(32, character).toString('base64');
const makeStore = () => new Store(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'forgenet-')), 'state.json'));

test('enrolls devices, allocates addresses, and discovers peers', () => {
  const store = makeStore();
  const firstToken = store.createEnrollmentToken({ ttlMinutes: 10, uses: 1 });
  const first = store.enroll({ token:firstToken.token, name:'alpha', publicKey:key(1), endpoint:'alpha.example:51820' });
  const secondToken = store.createEnrollmentToken({ ttlMinutes: 10, uses: 1 });
  const second = store.enroll({ token:secondToken.token, name:'beta', publicKey:key(2), endpoint:'beta.example:51820' });
  assert.equal(first.device.ip, '10.77.0.2');
  assert.equal(second.device.ip, '10.77.0.3');
  const authenticated = store.authenticateDevice(first.device.id, first.secret);
  assert.equal(store.heartbeat(authenticated).peers[0].name, 'beta');
});

test('enrollment tokens cannot be reused', () => {
  const store = makeStore();
  const enrollment = store.createEnrollmentToken({ ttlMinutes: 10, uses: 1 });
  store.enroll({ token:enrollment.token, name:'alpha', publicKey:key(3) });
  assert.throws(() => store.enroll({ token:enrollment.token, name:'beta', publicKey:key(4) }), /invalid, expired, or already used/);
});

test('revocation immediately rejects device authentication', () => {
  const store = makeStore();
  const enrollment = store.createEnrollmentToken({ ttlMinutes: 10, uses: 1 });
  const enrolled = store.enroll({ token:enrollment.token, name:'alpha', publicKey:key(5) });
  assert.equal(store.revoke(enrolled.device.id), true);
  assert.equal(store.authenticateDevice(enrolled.device.id, enrolled.secret), null);
});
