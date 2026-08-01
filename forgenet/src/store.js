'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const emptyState = () => ({ version: 1, nextHost: 2, enrollmentTokens: [], devices: [] });
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

class Store {
  constructor(file) {
    this.file = file;
    this.state = this.load();
  }

  load() {
    if (!fs.existsSync(this.file)) return emptyState();
    const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    if (parsed.version !== 1 || !Array.isArray(parsed.devices)) throw new Error('Unsupported ForgeNet state file.');
    return parsed;
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.state, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, this.file);
  }

  createEnrollmentToken({ ttlMinutes = 30, uses = 1 }) {
    const token = `fnet_enroll_${crypto.randomBytes(24).toString('base64url')}`;
    const record = {
      id: crypto.randomUUID(), tokenHash: hash(token), usesRemaining: uses,
      expiresAt: new Date(Date.now() + ttlMinutes * 60000).toISOString(), createdAt: new Date().toISOString()
    };
    this.state.enrollmentTokens.push(record);
    this.save();
    return { token, expiresAt: record.expiresAt, uses: record.usesRemaining };
  }

  enroll({ token, name, publicKey, endpoint }) {
    const record = this.state.enrollmentTokens.find(item =>
      item.tokenHash === hash(token) && item.usesRemaining > 0 && Date.parse(item.expiresAt) > Date.now());
    if (!record) throw new Error('Enrollment token is invalid, expired, or already used.');
    if (this.state.devices.some(device => device.publicKey === publicKey && !device.revokedAt)) {
      throw new Error('This WireGuard public key is already enrolled.');
    }
    if (this.state.nextHost > 254) throw new Error('The default ForgeNet address pool is full.');
    const secret = `fnet_device_${crypto.randomBytes(32).toString('base64url')}`;
    const now = new Date().toISOString();
    const device = {
      id: crypto.randomUUID(), name, publicKey, ip: `10.77.0.${this.state.nextHost++}`,
      endpoint: endpoint || null, secretHash: hash(secret), createdAt: now, lastSeenAt: now, revokedAt: null
    };
    record.usesRemaining -= 1;
    this.state.devices.push(device);
    this.save();
    return { device: this.publicDevice(device), secret };
  }

  authenticateDevice(id, secret) {
    const device = this.state.devices.find(item => item.id === id && !item.revokedAt);
    if (!device || !safeEqual(device.secretHash, hash(secret))) return null;
    return device;
  }

  heartbeat(device, endpoint) {
    device.lastSeenAt = new Date().toISOString();
    if (endpoint) device.endpoint = endpoint;
    this.save();
    return {
      network: { cidr: '10.77.0.0/24', dnsSuffix: 'forgenet.internal' },
      device: this.publicDevice(device),
      peers: this.state.devices
        .filter(peer => !peer.revokedAt && peer.id !== device.id)
        .map(peer => this.publicDevice(peer))
    };
  }

  listDevices() { return this.state.devices.map(device => this.publicDevice(device)); }

  revoke(id) {
    const device = this.state.devices.find(item => item.id === id && !item.revokedAt);
    if (!device) return false;
    device.revokedAt = new Date().toISOString();
    this.save();
    return true;
  }

  publicDevice(device) {
    const { secretHash, ...safe } = device;
    return safe;
  }
}

function safeEqual(left, right) {
  const a = Buffer.from(left || '');
  const b = Buffer.from(right || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { Store, hash, safeEqual };
