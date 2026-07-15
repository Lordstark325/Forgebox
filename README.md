# ForgeBox

ForgeBox is a Windows-first, Docker-compatible container manager that you control. Version 0.1 is a dependency-free local dashboard with container listing, start, stop, removal, and log viewing.

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

## Independence roadmap

1. **Current MVP:** engine-neutral dashboard and safe command adapter.
2. **Windows backend:** dedicated WSL2 distribution containing Moby Engine, BuildKit, and Compose.
3. **Desktop shell:** package the UI with WebView2/Tauri and add a tray icon and automatic engine startup.
4. **Docker compatibility:** expose the Docker API through a named pipe so IDEs and existing apps connect transparently.
5. **Production features:** image management, Compose projects, volumes, networks, resource controls, updates, signing, and backups.

## Security choices

- The server binds only to `127.0.0.1`.
- API routes map to a fixed allowlist of engine commands.
- Container identifiers are strictly validated.
- Commands never pass through a shell.

## License

Apache-2.0. Third-party engine components retain their respective licenses.
