# ChargeGuard

ChargeGuard auto connects and disconnects a laptop charger through a WiZ smart plug:

- `80%` or above: disconnect charger
- `20%` or below: connect charger
- between those values: keep the charger as it is, so charging continues up to `80%`, and after disconnecting it stays off until `20%`

It uses Node.js built-ins only and the local WiZ UDP API.

## Safety And Privacy

- [Privacy](PRIVACY.md): ChargeGuard runs locally and does not collect analytics.
- [Disclaimer](DISCLAIMER.md): ChargeGuard is provided as-is and depends on your OS, network, and smart plug.
- [License](LICENSE): MIT.

## Quick Start

Download the bundle for your OS:

- [Download for Windows](https://github.com/JRDspace/ChargeGuard/releases/latest/download/ChargeGuard-1.0.0-windows.zip)
- [Download for Linux](https://github.com/JRDspace/ChargeGuard/releases/latest/download/ChargeGuard-1.0.0-linux.tar.gz)
- [Download for macOS](https://github.com/JRDspace/ChargeGuard/releases/latest/download/ChargeGuard-1.0.0-macos.tar.gz)

Windows:

```text
1. Click Download for Windows
2. Optional: right-click the zip > Properties > Unblock > OK
3. Extract the zip
4. Run ChargeGuard.cmd
5. If Windows says "Unknown Publisher", click Run
6. Choose browser UI, install, uninstall, status, or command menu from there
```

Windows note: ChargeGuard is not code-signed yet, so Windows may show an "Unknown Publisher" warning for `ChargeGuard.cmd`. This is expected for unsigned software. Click `Run` if you trust this release. Removing that warning completely requires a paid code-signing certificate and signed installer.

After installing automatic mode, ChargeGuard creates Start Menu and Desktop shortcuts with a ChargeGuard icon. The raw `ChargeGuard.cmd` file still uses the default Windows command-script icon because Windows does not allow custom icons on `.cmd` files.

Linux:

```text
1. Click Download for Linux
2. Extract it
3. Run ./install.sh
4. Run ./chargeguard-ui for the browser UI, or ./chargeguard for the menu
```

macOS:

```text
1. Click Download for macOS
2. Extract it
3. Run ./install.sh
4. Run ./chargeguard-ui for the browser UI, or ./chargeguard for the menu
```

First setup:

```text
1. Choose Setup / change config
2. Enter the WiZ plug IP from the WiZ app or router
3. Install automatic mode
```

The app menu:

```text
1. Setup / change config
2. Status / metrics
3. Install automatic mode
4. Disable automatic mode
5. Start monitoring now
6. Manual mode: turn on the charger
7. Manual mode: turn off the charger
8. Open browser UI
9. What exactly happens?
10. Exit
```

The browser UI has the same actions: setup, status, install/disable automatic mode, start monitoring, manual charger on/off, and explanation.

## Release Bundles

Build platform bundles:

```bash
npm run package
```

Outputs go to `dist/`:

- Windows: unzip and run `ChargeGuard.cmd`.
- Linux: extract, run `./chargeguard-ui`, `./chargeguard`, or `./install.sh`.
- macOS: extract, run `./chargeguard-ui`, `./chargeguard`, or `./install.sh`.

These bundles still require Node.js 18+ on the target machine.

## Developer Setup

Use this only when running from source:

```bash
npm start
npm run ui
npm test
npm run package
```

## What Happens

- ChargeGuard checks battery and plug state every 60 seconds by default.
- At 80% or above, it disconnects the charger.
- At 20% or below, it connects the charger.
- Windows automatic mode starts after login and restarts the daemon if it crashes.
- Windows sleep tries to disconnect the charger; wake runs one immediate check.
- Logs are written to `%LOCALAPPDATA%\ChargeGuard\chargeguard.log` on Windows.

## Windows

From the project folder:

```powershell
npm start
```

Use the menu to install or disable automatic mode.

Uninstall:

```powershell
.\scripts\uninstall-windows.ps1
```

## Linux

```bash
cp .env.example .env
nano .env
bash scripts/install-linux.sh
```

This creates a user `systemd` service.

Uninstall:

```bash
bash scripts/uninstall-linux.sh
```

## macOS

```bash
cp .env.example .env
nano .env
bash scripts/install-macos.sh
```

This creates a LaunchAgent.

Uninstall:

```bash
bash scripts/uninstall-macos.sh
```

