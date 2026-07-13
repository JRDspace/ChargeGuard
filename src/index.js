require("./env").loadEnv();
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const querystring = require("querystring");
const readline = require("readline/promises");
const { execFile, spawn } = require("child_process");
const { stdin: input, stdout: output } = require("process");
const { getBattery } = require("./battery");
const { nextPlugState } = require("./policy");
const { discoverPlug, getPlug, setPlug } = require("./wiz");

const ENV_FILE = path.join(__dirname, "..", ".env");
const DATA_DIR = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "ChargeGuard") : path.join(os.tmpdir(), "ChargeGuard");
const LOG_FILE = path.join(DATA_DIR, "chargeguard.log");
const LOCK_FILE = path.join(DATA_DIR, "chargeguard.lock");
const DEFAULTS = {
  WIZ_PLUG_IP: "",
  WIZ_PLUG_PORT: "38899",
  WIZ_TIMEOUT_MS: "2000",
  CHARGEGUARD_HIGH: "80",
  CHARGEGUARD_LOW: "20",
  CHARGEGUARD_POLL_SECONDS: "60"
};

let low = Number(process.env.CHARGEGUARD_LOW || DEFAULTS.CHARGEGUARD_LOW);
let high = Number(process.env.CHARGEGUARD_HIGH || DEFAULTS.CHARGEGUARD_HIGH);
let pollMs = Math.max(Number(process.env.CHARGEGUARD_POLL_SECONDS || DEFAULTS.CHARGEGUARD_POLL_SECONDS), 5) * 1000;
let plugOn = true;
const metrics = { started: Date.now(), checks: 0, switches: 0, lastBattery: null, lastError: "" };

function writeLog(line) {
  // Never throw: the daemon, wake task, and UI can log concurrently, and a
  // logging failure must not take down charging control.
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 1024 * 1024) {
      try { fs.unlinkSync(`${LOG_FILE}.1`); } catch (_err) {}
      try { fs.renameSync(LOG_FILE, `${LOG_FILE}.1`); } catch (_err) {}
    }
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${line}\n`);
  } catch (_err) {}
}

function log(message) {
  console.log(message);
  writeLog(message);
}

function error(message) {
  console.error(message);
  writeLog(`ERROR ${message}`);
}

function reloadSettings() {
  low = Number(process.env.CHARGEGUARD_LOW || DEFAULTS.CHARGEGUARD_LOW);
  high = Number(process.env.CHARGEGUARD_HIGH || DEFAULTS.CHARGEGUARD_HIGH);
  pollMs = Math.max(Number(process.env.CHARGEGUARD_POLL_SECONDS || DEFAULTS.CHARGEGUARD_POLL_SECONDS), 5) * 1000;
}

function uptime() {
  const seconds = Math.round((Date.now() - metrics.started) / 1000);
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function explainBehavior() {
  console.log(explanationLines().join("\n"));
}

function explanationLines() {
  return [
    "",
    "What exactly happens?",
    `- ChargeGuard checks the battery every ${pollMs / 1000} seconds.`,
    `- At ${high}% or above, it disconnects the charger by turning the WiZ plug off.`,
    `- At ${low}% or below, it connects the charger by turning the WiZ plug on.`,
    `- Between ${low}% and ${high}%, it keeps the charger as-is: charging continues up to ${high}%, and after disconnecting it stays off until ${low}%.`,
    "- Automatic mode starts this in the background after Windows login.",
    "- Manual mode only sends one command; automatic mode is what keeps watching.",
    "- On Windows sleep, it tries to disconnect the charger; on wake, it checks once immediately.",
    `- Logs are written to ${LOG_FILE}.`,
    "- Disable automatic mode stops future background starts; it does not delete your settings.",
    ""
  ];
}

function printSetupSteps() {
  console.log([
    "ChargeGuard needs your WiZ smart plug IP before it can run.",
    "",
    "Steps:",
    "1. Open the WiZ app or your router device list.",
    "2. Find the smart plug IP address, usually like 192.168.1.23.",
    "3. Run `npm start` in this folder and choose Setup.",
    "4. Enter that IP and save.",
    "",
    "Manual fallback:",
    "Copy `.env.example` to `.env`, then set WIZ_PLUG_IP=192.168.x.x."
  ].join("\n"));
}

function envText(values) {
  return Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n") + "\n";
}

function validateSettings(values) {
  const ip = String(values.WIZ_PLUG_IP || "").trim();
  const lowValue = Number(values.CHARGEGUARD_LOW);
  const highValue = Number(values.CHARGEGUARD_HIGH);
  const seconds = Number(values.CHARGEGUARD_POLL_SECONDS);
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip) || ip.split(".").some((part) => Number(part) > 255)) throw new Error("WiZ plug IP must look like 192.168.0.47.");
  if (!Number.isFinite(lowValue) || !Number.isFinite(highValue)) throw new Error("Battery limits must be numbers.");
  if (lowValue < 5 || highValue > 100 || lowValue >= highValue || highValue - lowValue < 10) throw new Error("Use battery limits like 20 and 80: low must be at least 10 below high.");
  if (!Number.isFinite(seconds) || seconds < 5) throw new Error("Check interval must be 5 seconds or more.");
}

function takeLock() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(LOCK_FILE)) {
    const pid = Number(fs.readFileSync(LOCK_FILE, "utf8"));
    try {
      if (Number.isFinite(pid)) process.kill(pid, 0);
      throw new Error("ChargeGuard is already running.");
    } catch (err) {
      if (err.message === "ChargeGuard is already running.") throw err;
      fs.unlinkSync(LOCK_FILE);
    }
  }
  try {
    const fd = fs.openSync(LOCK_FILE, "wx");
    fs.writeFileSync(fd, String(process.pid));
    process.on("exit", () => { try { fs.unlinkSync(LOCK_FILE); } catch (_err) {} });
  } catch (_err) {
    throw new Error("ChargeGuard is already running.");
  }
}

function run(file, args) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { cwd: path.join(__dirname, ".."), windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(new Error(String(stderr || stdout || err.message).trim()));
      else resolve(String(stdout || stderr || "").trim());
    });
  });
}

function platformScript(action) {
  const root = path.join(__dirname, "..");
  if (os.platform() === "win32") return ["cmd", ["/c", path.join(root, "scripts", `${action}-windows.cmd`)]];
  if (os.platform() === "darwin") return ["bash", [path.join(root, "scripts", `${action}-macos.sh`)]];
  if (os.platform() === "linux") return ["bash", [path.join(root, "scripts", `${action}-linux.sh`)]];
  throw new Error(`Automatic mode is not supported on ${os.platform()}`);
}

async function setAutomaticMode(enabled) {
  if (enabled && !process.env.WIZ_PLUG_IP) throw new Error("Run Setup first so automatic mode has a plug IP.");
  const [file, args] = platformScript(enabled ? "install" : "uninstall");
  const out = await run(file, args);
  const message = out || (enabled ? "Automatic mode installed." : "Automatic mode disabled.");
  console.log(message);
  return message;
}

async function automaticStatus() {
  if (os.platform() === "win32") {
    const startupCmd = path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "ChargeGuard.cmd");
    if (fs.existsSync(startupCmd)) return "installed (Startup folder)";
    const out = await run("schtasks", ["/Query", "/TN", "ChargeGuard", "/FO", "LIST"]).catch(() => "");
    return out ? "installed (Scheduled Task)" : "not installed";
  }
  if (os.platform() === "linux") {
    const out = await run("systemctl", ["--user", "is-enabled", "chargeguard.service"]).catch(() => "");
    return out === "enabled" ? "installed (enabled)" : "not installed";
  }
  if (os.platform() === "darwin") {
    return fs.existsSync(path.join(process.env.HOME || "", "Library", "LaunchAgents", "com.chargeguard.daemon.plist")) ? "installed" : "not installed";
  }
  return "unsupported";
}

async function setupWizard(rl, offerAuto = true) {
  console.log([
    "",
    "Setup",
    "This is a one-time setup. Press Enter to keep the value shown in brackets.",
    ""
  ].join("\n"));
  const current = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) current[key] = process.env[key] || DEFAULTS[key];

  console.log("WiZ plug IP: open the WiZ app or your router device list and find the smart plug IP, usually like 192.168.0.47.");
  const ip = (await rl.question(`WiZ plug IP${current.WIZ_PLUG_IP ? ` [${current.WIZ_PLUG_IP}]` : ""}: `)).trim() || current.WIZ_PLUG_IP;
  if (!ip) {
    console.log("Skipped: plug IP is required before ChargeGuard can run.");
    return false;
  }

  current.WIZ_PLUG_IP = ip;
  console.log("Low battery limit: when battery is at or below this percent, ChargeGuard turns the charger on.");
  current.CHARGEGUARD_LOW = (await rl.question(`Turn charger on at % [${current.CHARGEGUARD_LOW}]: `)).trim() || current.CHARGEGUARD_LOW;
  console.log("High battery limit: when battery is at or above this percent, ChargeGuard turns the charger off.");
  current.CHARGEGUARD_HIGH = (await rl.question(`Turn charger off at % [${current.CHARGEGUARD_HIGH}]: `)).trim() || current.CHARGEGUARD_HIGH;
  console.log("Check interval: how often ChargeGuard checks battery and plug state. 60 seconds is fine.");
  current.CHARGEGUARD_POLL_SECONDS = (await rl.question(`Check every seconds [${current.CHARGEGUARD_POLL_SECONDS}]: `)).trim() || current.CHARGEGUARD_POLL_SECONDS;

  validateSettings(current);
  fs.writeFileSync(ENV_FILE, envText(current));
  Object.assign(process.env, current);
  reloadSettings();
  console.log(`Saved ${ENV_FILE}`);
  if (offerAuto) {
    const install = (await rl.question("Install automatic mode now? y/N: ")).trim().toLowerCase();
    if (install === "y" || install === "yes") await setAutomaticMode(true);
  }
  return true;
}

async function showStatus() {
  const status = await statusData();
  console.log([
    "",
    `Plug IP: ${status.plugIp}`,
    `Plug state: ${status.plug}`,
    `Automatic mode: ${status.auto}`,
    `Battery: ${status.battery}`,
    `Policy: ${status.policy}`,
    `Metrics: ${status.metrics}`,
    `Last error: ${status.lastError}`,
    ""
  ].join("\n"));
}

async function statusData() {
  const battery = await getBattery();
  const auto = await automaticStatus();
  let plug = "not checked";
  if (process.env.WIZ_PLUG_IP) {
    try {
      plug = await getPlug() ? "on" : "off";
    } catch (err) {
      plug = `error: ${err.message}`;
      metrics.lastError = err.message;
    }
  }
  return {
    plugIp: process.env.WIZ_PLUG_IP || "not set",
    plug,
    auto,
    battery: battery ? `${battery.percent}% ${battery.state || ""}`.trim() : "not found",
    policy: `connect <= ${low}%, disconnect >= ${high}%, check every ${pollMs / 1000}s`,
    metrics: `checks=${metrics.checks}, switches=${metrics.switches}, uptime=${uptime()}`,
    lastError: metrics.lastError || "none"
  };
}

async function turnOffAndExit(code = 0) {
  log("ChargeGuard stopped");
  process.exit(code);
}

let ticking = false;

async function tick() {
  // A slow tick (UDP retries + battery query) can outlast the poll interval;
  // never run two at once or they send conflicting plug commands.
  if (ticking) return;
  ticking = true;
  try {
    const battery = await getBattery();
    if (!battery) throw new Error("No laptop battery found");
    const current = await getPlug();
    metrics.checks += 1;
    metrics.lastBattery = battery;
    const next = nextPlugState(battery.percent, current, low, high);
    if (next !== current) {
      plugOn = await setPlug(next);
      metrics.switches += 1;
    } else {
      plugOn = current;
    }
    metrics.lastError = "";
    if (plugOn && battery.charging === false) error("charger is connected but Windows says the laptop is not charging; check cable/socket");
    log(`battery=${battery.percent}% state=${battery.state || "unknown"} charger=${plugOn ? "on" : "off"} checks=${metrics.checks} switches=${metrics.switches} uptime=${uptime()}`);
  } finally {
    ticking = false;
  }
}

async function runMenuAction(action) {
  try {
    await action();
  } catch (err) {
    metrics.lastError = err.message;
    error(err.message);
  }
}

async function startDaemon() {
  if (!process.env.WIZ_PLUG_IP) {
    printSetupSteps();
    process.exit(1);
  }
  takeLock();
  validateSettings(process.env);
  // The first check often runs right after login, before WiFi is up; a
  // transient failure must not kill the daemon.
  await tick().catch((err) => {
    metrics.lastError = err.message;
    error(err.message);
  });
  setInterval(() => tick().catch((err) => {
    metrics.lastError = err.message;
    error(err.message);
  }), pollMs);
}

async function runOnce() {
  validateSettings(process.env);
  await tick();
}

function startBackgroundDaemon() {
  const child = spawn(process.execPath, [path.join(__dirname, "index.js"), "--daemon"], {
    cwd: path.join(__dirname, ".."),
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
}

function openBrowser(url) {
  if (os.platform() === "win32") spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  else if (os.platform() === "darwin") spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
  else spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => resolve(querystring.parse(body)));
    req.on("error", (err) => reject(err));
  });
}

function isLoopbackHost(value) {
  const host = String(value || "").toLowerCase().replace(/:\d+$/, "");
  return host === "127.0.0.1" || host === "localhost" || host === "[::1]";
}

// Reject requests that did not come from this machine's own browser tab:
// a Host header pointing elsewhere means DNS rebinding, and a non-loopback
// Origin on a POST means a cross-site form on a website we do not control.
function isTrustedRequest(req) {
  if (!isLoopbackHost(req.headers.host)) return false;
  if (req.method === "POST" && req.headers.origin) {
    try {
      return isLoopbackHost(new URL(req.headers.origin).host);
    } catch (_err) {
      return false;
    }
  }
  return true;
}

function page(status, message = "") {
  const current = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) current[key] = process.env[key] || DEFAULTS[key];
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ChargeGuard</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>
*{box-sizing:border-box}body{font-family:Segoe UI,Arial,sans-serif;margin:0;background:#f4f6f8;color:#1f2933}
header{background:#102a43;color:white;border-bottom:4px solid #2f9e74}main{max-width:1040px;margin:0 auto;padding:24px}
.top{max-width:1040px;margin:0 auto;padding:26px 24px}h1{margin:0;font-size:30px;font-weight:650}.sub{margin:6px 0 0;color:#d9e2ec}
h2{margin:0 0 14px;font-size:18px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}
.card{background:white;border:1px solid #d9e2ec;border-radius:8px;padding:16px;margin:14px 0;box-shadow:0 1px 2px rgba(16,42,67,.06)}footer{max-width:1040px;margin:0 auto;padding:0 24px 24px;color:#627d98;font-size:13px}
.label{font-size:12px;text-transform:uppercase;color:#627d98;font-weight:650}.value{font-size:18px;margin-top:5px;word-break:break-word}
button,input,select{font:inherit;padding:10px 12px;border-radius:6px;border:1px solid #bcccdc}input,select{width:100%;background:#fff}
button{background:#1f7a5c;color:white;border:0;cursor:pointer;margin:4px 4px 4px 0;font-weight:600}.danger{background:#b42318}.quiet{background:#52606d}.secondary{background:#2f80ed}
form.inline{display:inline}.row{display:grid;grid-template-columns:240px 1fr;gap:12px;align-items:center;margin:10px 0}small{color:#627d98}
pre{white-space:pre-wrap;background:#f0f4f8;padding:12px;border-radius:6px;margin:0}.msg{background:#e6fffa;border:1px solid #8eeddd;padding:10px;border-radius:6px}
@media(max-width:640px){.row{grid-template-columns:1fr}main,.top{padding:18px}}
</style></head><body>
<header><div class="top"><h1>ChargeGuard</h1><p class="sub">Automatic laptop charging control for WiZ smart plugs.</p></div></header><main>
${message ? `<div class="msg">${escapeHtml(message).replace(/\n/g, "<br>")}</div>` : ""}
<section class="grid">
${["plugIp","plug","auto","battery","policy","metrics","lastError"].map((key) => `<div class="card"><div class="label">${key}</div><div class="value" data-status="${key}">${escapeHtml(status[key])}</div></div>`).join("")}
</section>
<section class="card"><h2>Setup</h2>
<form method="post" action="/setup">
${inputRow("WiZ plug IP", "WIZ_PLUG_IP", current.WIZ_PLUG_IP, "Find it in the WiZ app or router device list, or use Auto-detect.")}
${inputRow("Connect charger at %", "CHARGEGUARD_LOW", current.CHARGEGUARD_LOW, "Default 20 for battery life.")}
${inputRow("Disconnect charger at %", "CHARGEGUARD_HIGH", current.CHARGEGUARD_HIGH, "Default 80 for battery life.")}
${inputRow("Check every seconds", "CHARGEGUARD_POLL_SECONDS", current.CHARGEGUARD_POLL_SECONDS, "Default 60.")}
<button>Save setup</button></form><form class="inline" method="post" action="/detect"><button class="secondary">Auto-detect WiZ plug</button></form></section>
<section class="card"><h2>Actions</h2>
${button("/install","Install automatic mode")}
${button("/disable","Disable automatic mode","quiet")}
${button("/monitor","Start monitoring now")}
${button("/manual-on","Manual mode: turn on charger")}
${button("/manual-off","Manual mode: turn off charger","danger")}
${button("/detect","Auto-detect WiZ plug","secondary")}
</section>
<section class="card"><h2>What exactly happens?</h2><pre>${escapeHtml(explanationLines().filter(Boolean).slice(1).join("\n"))}</pre></section>
</main><footer>ChargeGuard by Janaki Rajesh D. | <a href="https://janakirajesh.com">janakirajesh.com</a> | <a href="https://github.com/JRDspace">github.com/JRDspace</a> | <a href="mailto:janakirajeshduvvuri@outlook.com">janakirajeshduvvuri@outlook.com</a></footer>
<script>
async function refreshStatus(){
  try{
    const res=await fetch('/api/status',{cache:'no-store'});
    const data=await res.json();
    for(const [key,value] of Object.entries(data)){
      const el=document.querySelector('[data-status="'+key+'"]');
      if(el) el.textContent=value;
    }
  }catch(err){
    const el=document.querySelector('[data-status="lastError"]');
    if(el) el.textContent='UI refresh failed: '+err.message;
  }
}
setInterval(refreshStatus,5000);
refreshStatus();
</script></body></html>`;
}

function favicon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#102a43"/><path d="M18 24h25a7 7 0 0 1 0 14H18z" fill="#fff"/><path d="M45 28h5v6h-5z" fill="#fff"/><rect x="22" y="28" width="16" height="6" rx="3" fill="#2f9e74"/></svg>`;
}

function inputRow(label, name, value, help) {
  return `<div class="row"><label>${label}<br><small>${help}</small></label><input name="${name}" value="${escapeHtml(value)}"></div>`;
}

function button(action, label, cls = "") {
  return `<form class="inline" method="post" action="${action}"><button class="${cls}">${label}</button></form>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function startUi() {
  const port = Number(process.env.CHARGEGUARD_UI_PORT || 8787);
  let message = "";
  if (!process.env.WIZ_PLUG_IP) {
    const ip = await discoverPlug();
    if (ip) {
      process.env.WIZ_PLUG_IP = ip;
      const next = { ...DEFAULTS, ...process.env, WIZ_PLUG_IP: ip };
      fs.writeFileSync(ENV_FILE, envText(Object.fromEntries(Object.keys(DEFAULTS).map((key) => [key, next[key] || DEFAULTS[key]]))));
      message = `Detected WiZ plug: ${ip}`;
    }
  }
  const server = http.createServer(async (req, res) => {
    try {
      if (!isTrustedRequest(req)) {
        res.writeHead(403, { "content-type": "text/plain" });
        return res.end("Forbidden: ChargeGuard UI only accepts local requests.");
      }
      const url = new URL(req.url, "http://127.0.0.1");
      if (req.method === "GET" && url.pathname === "/favicon.svg") {
        res.writeHead(200, { "content-type": "image/svg+xml" });
        return res.end(favicon());
      }
      if (req.method === "GET" && url.pathname === "/api/status") {
        const status = await statusData();
        res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        return res.end(JSON.stringify(status));
      }
      if (url.pathname !== "/" && url.pathname !== "/status" && url.pathname !== "/favicon.svg" && url.pathname !== "/api/status") {
        const body = req.method === "POST" ? await readBody(req) : {};
        if (url.pathname === "/setup") {
          if (req.method !== "POST") throw new Error("Use the setup form to save settings.");
          const updates = {};
          for (const key of Object.keys(DEFAULTS)) {
            if (body[key] !== undefined) updates[key] = String(body[key]).trim();
          }
          const next = { ...process.env, ...updates };
          validateSettings(next);
          fs.writeFileSync(ENV_FILE, envText(Object.fromEntries(Object.keys(DEFAULTS).map((key) => [key, next[key] || DEFAULTS[key]]))));
          Object.assign(process.env, updates);
          reloadSettings();
          message = "Setup saved.";
        } else if (url.pathname === "/install") {
          const out = await setAutomaticMode(true);
          message = `${out || "Automatic mode installed."}\n\nChargeGuard also ran an immediate battery check. If battery is already at or above ${high}%, the charger should disconnect now.`;
        }
        else if (url.pathname === "/disable") {
          const out = await setAutomaticMode(false);
          message = out || "Automatic mode disabled. Future background starts are off.";
        }
        else if (url.pathname === "/detect") {
          const ip = await discoverPlug();
          if (!ip) throw new Error("No WiZ plug found on this network.");
          process.env.WIZ_PLUG_IP = ip;
          const next = { ...DEFAULTS, ...process.env, WIZ_PLUG_IP: ip };
          fs.writeFileSync(ENV_FILE, envText(Object.fromEntries(Object.keys(DEFAULTS).map((key) => [key, next[key] || DEFAULTS[key]]))));
          message = `Detected WiZ plug: ${ip}`;
        }
        else if (url.pathname === "/monitor") {
          startBackgroundDaemon();
          message = `Background monitoring started. ChargeGuard checks every ${pollMs / 1000} seconds and acts at ${low}%/${high}%.`;
        }
        else if (url.pathname === "/manual-on") await setPlug(true).then(() => { message = "Manual command sent: charger connected. Automatic mode rules are unchanged."; });
        else if (url.pathname === "/manual-off") await setPlug(false).then(() => { message = "Manual command sent: charger disconnected. Automatic mode rules are unchanged."; });
        else throw new Error(`Unknown action: ${url.pathname}`);
        res.writeHead(303, { Location: "/" });
        return res.end();
      }
      const status = await statusData();
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(page(status, message));
      message = "";
    } catch (err) {
      metrics.lastError = err.message;
      const status = await statusData().catch(() => ({
        plugIp: process.env.WIZ_PLUG_IP || "not set",
        plug: "not checked",
        auto: "unknown",
        battery: "unknown",
        policy: `connect <= ${low}%, disconnect >= ${high}%`,
        metrics: `checks=${metrics.checks}, switches=${metrics.switches}, uptime=${uptime()}`,
        lastError: err.message
      }));
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(page(status, err.message));
    }
  });
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE" && port !== 0) {
      server.listen(0, "127.0.0.1");
      return;
    }
    error(err.message);
  });
  server.listen(port, "127.0.0.1", () => {
    const actualPort = server.address().port;
    const url = `http://127.0.0.1:${actualPort}`;
    console.log(`ChargeGuard UI: ${url}`);
    openBrowser(url);
  });
}

async function menu() {
  const rl = readline.createInterface({ input, output });
  try {
    console.log([
      "",
      "ChargeGuard",
      "Automatic laptop charging control for WiZ smart plugs.",
      ""
    ].join("\n"));
    if (!process.env.WIZ_PLUG_IP) await runMenuAction(() => setupWizard(rl));
    while (true) {
      console.log([
        "",
        "ChargeGuard",
        `Auto connect <= ${low}% | Auto disconnect >= ${high}%`,
        "1. Setup / change config",
        "2. Status / metrics",
        "3. Install automatic mode",
        "4. Disable automatic mode",
        "5. Start monitoring now",
        "6. Manual mode: turn on the charger",
        "7. Manual mode: turn off the charger",
        "8. Open browser UI",
        "9. What exactly happens?",
        "10. Exit"
      ].join("\n"));
      const choice = (await rl.question("Choose: ")).trim();
      if (choice === "1") await runMenuAction(() => setupWizard(rl));
      else if (choice === "2") await showStatus();
      else if (choice === "3") await runMenuAction(() => setAutomaticMode(true));
      else if (choice === "4") await runMenuAction(() => setAutomaticMode(false));
      else if (choice === "5") return startDaemon();
      else if (choice === "6") await runMenuAction(() => setPlug(true).then((on) => {
        plugOn = on;
        console.log("Charger connected.");
      }));
      else if (choice === "7") await runMenuAction(() => setPlug(false).then((on) => {
        plugOn = on;
        console.log("Charger disconnected.");
      }));
      else if (choice === "8") return startUi();
      else if (choice === "9") explainBehavior();
      else if (choice === "10") process.exit(0);
    }
  } finally {
    rl.close();
  }
}

process.on("SIGINT", () => turnOffAndExit(0));
process.on("SIGTERM", () => turnOffAndExit(0));
process.on("uncaughtException", (err) => {
  error(err.stack || err.message);
  turnOffAndExit(1);
});

const boot = process.argv.includes("--status") ? showStatus() : process.argv.includes("--ui") ? startUi() : process.argv.includes("--once") ? runOnce() : process.argv.includes("--daemon") || !process.stdin.isTTY ? startDaemon() : menu();
boot.catch((err) => {
    error(err.message);
    process.exit(1);
  });
