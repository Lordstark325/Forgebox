'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { _test } = require('../src/tailscale');

test('builds a private root HTTPS proxy command', () => {
  assert.deepEqual(_test.buildShareArgs({
    localPort: 3000,
    httpsPort: 443,
    path: '/'
  }), [
    'serve',
    '--bg',
    '--yes',
    '--https=443',
    'http://127.0.0.1:3000'
  ]);
});

test('builds a path-scoped private proxy command', () => {
  assert.deepEqual(_test.buildShareArgs({
    localPort: 8080,
    httpsPort: 8443,
    path: '/api'
  }), [
    'serve',
    '--bg',
    '--yes',
    '--https=8443',
    '--set-path=/api',
    'http://127.0.0.1:8080'
  ]);
});

test('builds a matching disable command', () => {
  assert.deepEqual(_test.buildUnshareArgs({
    httpsPort: 8443,
    path: '/api'
  }), [
    'serve',
    '--https=8443',
    '--set-path=/api',
    'off'
  ]);
});

test('parses JSON status and supports empty output', () => {
  assert.deepEqual(_test.parseJson('{"BackendState":"Running"}'), { BackendState: 'Running' });
  assert.deepEqual(_test.parseJson('', {}), {});
});
