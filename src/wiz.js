const dgram = require("dgram");

const WIZ_PORT = Number(process.env.WIZ_PLUG_PORT || 38899);
const WIZ_TIMEOUT_MS = Math.max(Number(process.env.WIZ_TIMEOUT_MS || 2000), 500);
const WIZ_RETRIES = Math.max(Number(process.env.WIZ_RETRIES || 3), 1);
let discoveredIp = "";
let discoveredForIp = "";

function send(ip, payload) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket("udp4");
    let done = false;
    const finish = (err, result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { socket.close(); } catch (_err) {}
      err ? reject(err) : resolve(result);
    };
    const timer = setTimeout(() => finish(new Error(`WiZ plug at ${ip} did not respond`)), WIZ_TIMEOUT_MS);
    socket.once("message", (message) => {
      try {
        finish(null, JSON.parse(message.toString()));
      } catch (_err) {
        finish(new Error("WiZ plug sent unreadable JSON"));
      }
    });
    socket.once("error", finish);
    socket.send(Buffer.from(JSON.stringify(payload)), WIZ_PORT, ip, (err) => {
      if (err) finish(err);
    });
  });
}

async function sendWithRetry(ip, payload) {
  let last;
  for (let attempt = 0; attempt < WIZ_RETRIES; attempt += 1) {
    try {
      return await send(ip, payload);
    } catch (err) {
      last = err;
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
  throw last;
}

function discoverPlug() {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    const timer = setTimeout(() => finish(""), 1800);
    let done = false;
    const finish = (ip) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { socket.close(); } catch (_err) {}
      resolve(ip);
    };
    socket.on("message", (message, remote) => {
      try {
        const result = JSON.parse(message.toString())?.result || {};
        if (String(result.moduleName || "").toUpperCase().includes("SOCKET")) finish(remote.address);
      } catch (_err) {}
    });
    socket.on("error", () => finish(""));
    socket.bind(() => {
      try {
        socket.setBroadcast(true);
        const probe = Buffer.from(JSON.stringify({ method: "getSystemConfig", params: {} }));
        socket.send(probe, WIZ_PORT, "255.255.255.255", () => {});
        setTimeout(() => socket.send(probe, WIZ_PORT, "255.255.255.255", () => {}), 500);
      } catch (_err) {
        finish("");
      }
    });
  });
}

function plugIp() {
  const envIp = (process.env.WIZ_PLUG_IP || "").trim();
  // A rediscovered IP only stands in for the configured IP it replaced;
  // when the user configures a new IP, the cache is stale.
  if (discoveredIp && discoveredForIp !== envIp) {
    discoveredIp = "";
    discoveredForIp = "";
  }
  const ip = discoveredIp || envIp;
  if (!ip) throw new Error([
    "WiZ plug IP is not configured.",
    "Run `npm start`, choose Setup, then enter the plug IP from the WiZ app or your router.",
    "Or create `.env` from `.env.example` and set WIZ_PLUG_IP=192.168.x.x."
  ].join("\n"));
  return ip;
}

async function command(payload) {
  try {
    return await sendWithRetry(plugIp(), payload);
  } catch (err) {
    const ip = await discoverPlug();
    if (!ip) throw err;
    discoveredIp = ip;
    discoveredForIp = (process.env.WIZ_PLUG_IP || "").trim();
    return sendWithRetry(ip, payload);
  }
}

async function setPlug(on) {
  const response = await command({ method: "setPilot", params: { state: Boolean(on) } });
  if (!response?.result?.success) throw new Error("WiZ plug rejected the command");
  return Boolean(on);
}

async function getPlug() {
  const response = await command({ method: "getPilot", params: {} });
  const state = response?.result?.state;
  if (typeof state !== "boolean") throw new Error("WiZ plug state could not be read");
  return state;
}

async function togglePlug() {
  const current = await getPlug();
  return setPlug(!current);
}

module.exports = { discoverPlug, getPlug, setPlug, togglePlug };
