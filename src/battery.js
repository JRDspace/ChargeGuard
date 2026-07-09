const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const WINDOWS_CHARGING_CODES = [2, 6, 7, 8, 9];

function exec(file, args) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: 8000, windowsHide: true }, (err, stdout) => {
      resolve(err ? "" : String(stdout || ""));
    });
  });
}

function readLinuxBattery() {
  const root = "/sys/class/power_supply";
  for (const name of fs.existsSync(root) ? fs.readdirSync(root) : []) {
    const dir = path.join(root, name);
    try {
      if (fs.readFileSync(path.join(dir, "type"), "utf8").trim() !== "Battery") continue;
      const percent = Number(fs.readFileSync(path.join(dir, "capacity"), "utf8").trim());
      const state = fs.readFileSync(path.join(dir, "status"), "utf8").trim();
      return Number.isFinite(percent) ? { percent, state } : null;
    } catch (_err) {}
  }
  return null;
}

async function readWindowsBattery() {
  const out = await exec("powershell", [
    "-NoProfile", "-NonInteractive", "-Command",
    "Get-CimInstance Win32_Battery | Select EstimatedChargeRemaining,BatteryStatus | ConvertTo-Json -Compress"
  ]);
  try {
    const value = JSON.parse(out.trim());
    const battery = Array.isArray(value) ? value[0] : value;
    const percent = Number(battery?.EstimatedChargeRemaining);
    const code = Number(battery?.BatteryStatus);
    if (Number.isFinite(percent)) {
      return { percent, state: Number.isFinite(code) ? `status ${code}` : "", charging: WINDOWS_CHARGING_CODES.includes(code) };
    }
  } catch (_err) {}
  return null;
}

async function readMacBattery() {
  const out = await exec("pmset", ["-g", "batt"]);
  const match = out.match(/(\d+)%;\s*([a-z ]+?)[;\n]/i);
  return match ? { percent: Number(match[1]), state: match[2].trim() } : null;
}

async function getBattery() {
  if (os.platform() === "win32") return readWindowsBattery();
  if (os.platform() === "darwin") return readMacBattery();
  if (os.platform() === "linux") return readLinuxBattery();
  return null;
}

module.exports = { getBattery };
