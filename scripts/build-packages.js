const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const pkg = require(path.join(root, "package.json"));
const dist = path.join(root, "dist");
const buildRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chargeguard-package-"));
const app = `ChargeGuard-${pkg.version}`;

const files = [
  "COPYRIGHT",
  "DISCLAIMER.md",
  "LICENSE",
  "package.json",
  "PRIVACY.md",
  "README.md",
  ".env.example",
  "src/battery.js",
  "src/env.js",
  "src/index.js",
  "src/policy.js",
  "src/wiz.js",
  "scripts/chargeguard-off.js",
  "scripts/install-windows.cmd",
  "scripts/uninstall-windows.cmd",
  "scripts/run-hidden.vbs",
  "scripts/install-linux.sh",
  "scripts/uninstall-linux.sh",
  "scripts/install-macos.sh",
  "scripts/uninstall-macos.sh"
];

function rm(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function copyFile(rel, targetRoot) {
  const from = path.join(root, rel);
  const to = path.join(targetRoot, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function write(rel, text, targetRoot) {
  const to = path.join(targetRoot, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, text);
}

function writeWindowsIcon(targetRoot) {
  const size = 32;
  const pixels = Buffer.alloc(size * size * 4);
  const set = (x, y, r, g, b, a = 255) => {
    const i = ((size - 1 - y) * size + x) * 4;
    pixels[i] = b; pixels[i + 1] = g; pixels[i + 2] = r; pixels[i + 3] = a;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const edge = x < 3 || y < 3 || x > 28 || y > 28;
      set(x, y, edge ? 16 : 22, edge ? 42 : 63, edge ? 67 : 93);
    }
  }
  for (let y = 12; y <= 20; y += 1) for (let x = 7; x <= 23; x += 1) set(x, y, 255, 255, 255);
  for (let y = 14; y <= 18; y += 1) for (let x = 24; x <= 27; x += 1) set(x, y, 255, 255, 255);
  for (let y = 14; y <= 18; y += 1) for (let x = 10; x <= 20; x += 1) set(x, y, 47, 158, 116);
  const andMask = Buffer.alloc(size * 4);
  const dib = Buffer.alloc(40);
  dib.writeUInt32LE(40, 0);
  dib.writeInt32LE(size, 4);
  dib.writeInt32LE(size * 2, 8);
  dib.writeUInt16LE(1, 12);
  dib.writeUInt16LE(32, 14);
  dib.writeUInt32LE(0, 16);
  dib.writeUInt32LE(pixels.length + andMask.length, 20);
  const image = Buffer.concat([dib, pixels, andMask]);
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header[6] = size;
  header[7] = size;
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(image.length, 14);
  header.writeUInt32LE(header.length, 18);
  const to = path.join(targetRoot, "assets", "chargeguard.ico");
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, Buffer.concat([header, image]));
}

function stage(platform) {
  const target = path.join(buildRoot, `${app}-${platform}`);
  rm(target);
  fs.mkdirSync(target, { recursive: true });
  for (const file of files) {
    if (platform !== "windows" && (file.endsWith(".cmd") || file.endsWith(".ps1") || file.endsWith(".vbs"))) continue;
    if (platform === "windows" && file.endsWith(".sh")) continue;
    copyFile(file, target);
  }

  if (platform === "windows") {
    writeWindowsIcon(target);
    write("ChargeGuard.cmd", [
      "@echo off",
      "setlocal",
      "title ChargeGuard",
      ":menu",
      "cls",
      "echo ChargeGuard",
      "echo Automatic laptop charging control for WiZ smart plugs.",
      "echo.",
      "echo 1. Open browser UI",
      "echo 2. Open command menu",
      "echo 3. Install automatic mode",
      "echo 4. Disable automatic mode",
      "echo 5. Status",
      "echo 6. Exit",
      "echo.",
      "choice /c 123456 /n /m \"Choose: \"",
      "if errorlevel 6 exit /b 0",
      "if errorlevel 5 node \"%~dp0src\\index.js\" --status & pause & goto menu",
      "if errorlevel 4 call \"%~dp0scripts\\uninstall-windows.cmd\" & pause & goto menu",
      "if errorlevel 3 call \"%~dp0scripts\\install-windows.cmd\" & pause & goto menu",
      "if errorlevel 2 node \"%~dp0src\\index.js\" & goto menu",
      "if errorlevel 1 node \"%~dp0src\\index.js\" --ui & goto menu"
    ].join("\r\n") + "\r\n", target);
    write("README-WINDOWS.txt", [
      "ChargeGuard for Windows",
      "",
      "Open:",
      "1. Run ChargeGuard.cmd.",
      "2. Choose Open browser UI, Install automatic mode, Disable automatic mode, Status, or command menu.",
      "3. If Windows says the publisher is unknown, click Run.",
      "",
      "Icon:",
      "After Install automatic mode, ChargeGuard creates Start Menu and Desktop shortcuts with an icon.",
      "",
      "Why the warning appears:",
      "ChargeGuard is not code-signed yet. Windows shows this warning for downloaded command scripts from unknown publishers.",
      "",
      "Optional: avoid the warning before extracting:",
      "1. Right-click the downloaded zip.",
      "2. Click Properties.",
      "3. Tick Unblock.",
      "4. Click OK.",
      "5. Extract the zip again.",
      "",
      "Uninstall:",
      "- Run ChargeGuard.cmd and choose Disable automatic mode."
    ].join("\r\n") + "\r\n", target);
  } else {
    write("chargeguard", "#!/usr/bin/env sh\nDIR=$(CDPATH= cd -- \"$(dirname -- \"$0\")\" && pwd)\nnode \"$DIR/src/index.js\" \"$@\"\n", target);
    write("chargeguard-ui", "#!/usr/bin/env sh\nDIR=$(CDPATH= cd -- \"$(dirname -- \"$0\")\" && pwd)\nnode \"$DIR/src/index.js\" --ui\n", target);
    write("install.sh", `#!/usr/bin/env sh\nDIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\n${platform === "linux" ? "sh \"$DIR/scripts/install-linux.sh\"" : "sh \"$DIR/scripts/install-macos.sh\""}\n`, target);
    write("uninstall.sh", `#!/usr/bin/env sh\nDIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\n${platform === "linux" ? "sh \"$DIR/scripts/uninstall-linux.sh\"" : "sh \"$DIR/scripts/uninstall-macos.sh\""}\n`, target);
    fs.chmodSync(path.join(target, "chargeguard"), 0o755);
    fs.chmodSync(path.join(target, "chargeguard-ui"), 0o755);
    fs.chmodSync(path.join(target, "install.sh"), 0o755);
    fs.chmodSync(path.join(target, "uninstall.sh"), 0o755);
  }
  return target;
}

function archive(platform, dir) {
  if (platform === "windows" && os.platform() === "win32") {
    const zip = path.join(dist, `${path.basename(dir)}.zip`);
    fs.rmSync(zip, { force: true });
    execFileSync("powershell", ["-NoProfile", "-Command", `Compress-Archive -Path '${dir}\\*' -DestinationPath '${zip}' -Force`], { stdio: "inherit" });
    return zip;
  }
  const name = `${path.basename(dir)}.tar.gz`;
  const tgz = path.join(dist, name);
  fs.rmSync(tgz, { force: true });
  // GNU tar treats "D:\..." as a remote host, so keep every tar path
  // relative and copy the result into dist afterwards.
  execFileSync("tar", ["-czf", name, path.basename(dir)], { cwd: path.dirname(dir), stdio: "inherit" });
  fs.copyFileSync(path.join(path.dirname(dir), name), tgz);
  return tgz;
}

fs.mkdirSync(dist, { recursive: true });
for (const platform of ["windows", "linux", "macos"]) {
  const dir = stage(platform);
  const output = archive(platform, dir);
  console.log(output);
}
rm(buildRoot);
