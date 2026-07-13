const fs = require("fs");
const path = require("path");

function loadEnv(file = path.join(__dirname, "..", ".env")) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
    if (match) process.env[match[1]] = match[2].trim();
  }
}

module.exports = { loadEnv };
