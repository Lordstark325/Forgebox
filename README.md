# ForgeBox

ForgeBox is a Windows-first, Docker-compatible container manager and private Tailscale application server that you control. Version 0.2 provides a dependency-free dashboard for containers, logs, and private tailnet hosting.

## Run it

Requires Node.js 20+. On Windows, ForgeBox uses its own dedicated WSL2 engine by default.

Install that engine once from PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\engine\install-engine.ps1
```

The installer downloads an official Ubuntu 24.04 LTS root filesystem, verifies its SHA-256 checksum, imports it as a dedicated `ForgeBox` WSL2 distribution, and installs Ubuntu's open-source Moby/Docker Engine, BuildKit, and Compose packages. It does not install or depend on Docker Desktop.

```powershell
npm start
```

Open <http://127.0.0.1:4782>.

On Linux, ForgeBox uses the `docker` CLI by default. Point it at another compatible CLI without changing the application:

```powershell
$env:FORGEBOX_ENGINE = 'podman'
npm start
```

## Tailscale backend and server

ForgeBox can publish a containerized app privately to your tailnet through [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve). It does not enable public Tailscale Funnel access.

Prerequisites:

1. Install Tailscale on the Windows host.
2. Sign in to your tailnet.
3. Enable HTTPS for the tailnet when Tailscale prompts for consent.
4. Publish the app's container port to `127.0.0.1` on the host.
5. In **Tailscale hosting**, enter the local port, HTTPS port, and optional path.

ForgeBox runs the equivalent of:

```powershell
tailscale serve --bg --yes --https=443 http://127.0.0.1:3000
```

The `--bg` configuration persists and resumes after Tailscale or the device restarts. Tailnet access-control rules continue to govern who may reach the app. Tailscale Serve terminates HTTPS and forwards authenticated identity headers to HTTP backends.

To use a nonstandard Tailscale CLI path:

```powershell
$env:FORGEBOX_TAILSCALE = 'C:\Program Files\Tailscale\tailscale.exe'
npm start
```

## Independence roadmap

1. **Current MVP:** engine-neutral dashboard and safe command adapter.
2. **Windows backend:** dedicated WSL2 distribution containing Moby Engine, BuildKit, and Compose.
3. **Private hosting:** Tailscale status, HTTPS Serve configuration, and tailnet app publishing.
4. **Desktop shell:** package the UI with WebView2/Tauri and add a tray icon and automatic engine startup.
5. **Production features:** image management, Compose projects, volumes, networks, resource controls, updates, signing, backups, and Tailscale Services.

## Security choices

- The ForgeBox control server binds only to `127.0.0.1`.
- API routes map to fixed allowlists of container and Tailscale commands.
- Container identifiers, ports, and URL paths are strictly validated.
- Commands never pass through a shell.
- Tailscale sharing is private-only; Funnel is not exposed by the API.
- Tailnet access rules determine who can reach hosted apps.

## License

Apache-2.0. Third-party engine and Tailscale components retain their respective licenses.
