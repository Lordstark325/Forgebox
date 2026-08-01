# ForgeNet

ForgeNet is a self-hosted WireGuard coordination plane. It is the beginning of an independent Tailscale-like product: you own device enrollment, private address allocation, peer discovery, revocation, configuration, and server data.

ForgeNet does **not** invent VPN cryptography. It uses the official WireGuard client for encrypted transport.

## What v0.1 includes

- one-time, expiring enrollment tokens
- device credentials stored only as SHA-256 hashes on the server
- WireGuard public-key registration
- automatic `10.77.0.0/24` private address allocation
- authenticated device heartbeats and peer discovery
- endpoint updates for roaming devices
- immediate device revocation
- atomic JSON persistence
- Windows enrollment and configuration scripts
- WireGuard tunnel-service installation
- API and persistence tests
- native Windows desktop enrollment and tunnel synchronization app
- native Android enrollment and WireGuard configuration app

## Desktop and Android applications

Prebuilt clients are distributed next to the source package:

- `ForgeNet-Windows-0.1.exe` enrolls the PC and installs the synchronized configuration through the official WireGuard for Windows service.
- `ForgeNet-Android-0.1.1.apk` enrolls the phone and generates a configuration to share/import into the official WireGuard Android application. Version 0.1.1 adds density-aware spacing, screen rotation, safe-area padding, keyboard resizing, scrolling, and mobile-sized touch targets.

Both clients need the ForgeNet coordination server to be reachable. Android requires a valid HTTPS server. ForgeNet uses the official WireGuard software for the actual VPN tunnel; the applications do not replace its audited encryption engine.

## Important limitations

This is a coordination-plane MVP, not yet a full Tailscale replacement.

- Direct peers need reachable UDP endpoints.
- Automatic NAT discovery, UDP hole punching, STUN, and DERP-like relays are not implemented.
- The coordination API must be placed behind production TLS before it is exposed outside a trusted machine.
- Access-control policies, private DNS, key expiry, mobile clients, and automatic background synchronization are future work.
- Windows scripts require the official WireGuard client (`wg.exe` and `wireguard.exe`).

## Start the control server

Requires Node.js 20 or newer.

```powershell
.\start-server.ps1
```

The first run generates `data/admin-token.txt`. Protect this file; it controls the network.

For local development the server listens on `127.0.0.1:8787`. For a remote server, place ForgeNet behind an HTTPS reverse proxy and set:

```powershell
$env:FORGENET_HOST = '127.0.0.1'
$env:FORGENET_PORT = '8787'
.\start-server.ps1
```

Do not bind the current HTTP server directly to the public internet.

## Enroll a Windows device

Create a short-lived enrollment token on the server:

```powershell
.\admin\create-enrollment-token.ps1
```

On the device, after installing WireGuard for Windows:

```powershell
.\agent\enroll-windows.ps1 `
  -Server 'https://network.example.com' `
  -Token 'fnet_enroll_...' `
  -Endpoint 'device-public-name.example.com:51820'
```

Fetch peers and create the WireGuard configuration:

```powershell
.\agent\sync-windows.ps1 -InstallTunnelService
```

Run `sync-windows.ps1` again after adding or revoking devices. A later release will provide a persistent background agent.

## API

| Method | Route | Authentication | Purpose |
|---|---|---|---|
| `GET` | `/health` | none | Health check |
| `POST` | `/v1/enrollment-tokens` | admin bearer token | Create enrollment token |
| `POST` | `/v1/devices/enroll` | enrollment token in body | Enroll device |
| `POST` | `/v1/devices/heartbeat` | device bearer token + ID header | Update endpoint and fetch peers |
| `GET` | `/v1/devices` | admin bearer token | List devices |
| `DELETE` | `/v1/devices/:id` | admin bearer token | Revoke device |

## Security model

- WireGuard private keys never leave their devices.
- Enrollment tokens expire and have limited uses.
- Device secrets are returned once and stored as hashes server-side.
- Revoked devices cannot authenticate to the coordination API.
- Server responses never include credential hashes.
- State writes use temporary-file replacement.
- The API rejects malformed names, keys, endpoints, limits, and oversized bodies.

The server still needs TLS, backups, operating-system hardening, rate limiting, audit logs, and external security review before production use.

## Roadmap

1. Production HTTPS deployment and database storage
2. Persistent signed Windows agent
3. STUN-based endpoint discovery and UDP hole punching
4. ForgeRelay for peers that cannot connect directly
5. Access-control policies and groups
6. ForgeDNS private names
7. Key rotation and device approval workflows
8. macOS, Linux, Android, and iOS clients
9. ForgeBox integration as an optional app publisher

## Validation

```powershell
npm run check
npm test
```

## License

Apache-2.0. WireGuard components retain their own licenses.
