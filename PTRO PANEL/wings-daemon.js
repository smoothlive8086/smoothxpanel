/**
 * SMOOTH x HOST - Wings Node Daemon Agent
 * Runs on remote VPS nodes to connect, report telemetry, and execute container actions
 */

const http = require('http');
const https = require('https');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Parse CLI flags or configuration file
const args = process.argv.slice(2);
function getArg(flag, fallback) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return fallback;
}

const configPaths = [
  '/etc/pterodactyl/config.yml',
  path.join(__dirname, 'config.yml'),
  path.join(process.cwd(), 'config.yml')
];

let panelUrl = getArg('--panel-url', 'http://localhost:3000');
let nodeId = getArg('--node-id', `node-${os.hostname().toLowerCase().replace(/[^a-z0-9]/g, '')}`);
let token = getArg('--token', 'smooth_wings_secret_token');
let daemonPort = Number(getArg('--port', 8080));

for (const p of configPaths) {
  if (fs.existsSync(p)) {
    try {
      const raw = fs.readFileSync(p, 'utf-8');
      const uMatch = raw.match(/uuid:\s*([^\r\n]+)/);
      const rMatch = raw.match(/remote:\s*([^\r\n]+)/);
      const tMatch = raw.match(/token:\s*([^\r\n]+)/);
      const pMatch = raw.match(/port:\s*([0-9]+)/);
      if (uMatch) nodeId = uMatch[1].trim();
      if (rMatch) panelUrl = rMatch[1].trim();
      if (tMatch) token = tMatch[1].trim();
      if (pMatch) daemonPort = Number(pMatch[1]);
      console.log(`[Wings Daemon] Loaded configuration from ${p}`);
      break;
    } catch (e) {}
  }
}

console.log(`====================================================`);
console.log(`   🦅 SMOOTH x HOST - WINGS NODE DAEMON AGENT       `);
console.log(`   Node ID       : ${nodeId}                       `);
console.log(`   Panel URL     : ${panelUrl}                     `);
console.log(`   Local Port    : ${daemonPort}                   `);
console.log(`   Host Platform : ${os.type()} ${os.release()}    `);
console.log(`====================================================`);

// Function to collect real host telemetry
function getSystemMetrics() {
  const cpus = os.cpus();
  const totalMem = Math.round(os.totalmem() / 1024 / 1024);
  const freeMem = Math.round(os.freemem() / 1024 / 1024);
  const usedMem = totalMem - freeMem;

  return {
    nodeId,
    token,
    status: 'online',
    memoryTotal: totalMem,
    memoryAllocated: usedMem,
    cpuCores: cpus.length,
    cpuModel: cpus[0] ? cpus[0].model : 'Generic CPU',
    loadAvg: os.loadavg(),
    uptime: Math.round(os.uptime()),
    platform: `${os.type()} ${os.arch()}`,
    hostname: os.hostname(),
    timestamp: Date.now()
  };
}

// Check Docker status
let dockerAvailable = false;
let runningContainersCount = 0;

function checkDocker() {
  exec('docker ps -q', (err, stdout) => {
    if (!err) {
      dockerAvailable = true;
      runningContainersCount = stdout.trim() ? stdout.trim().split('\n').length : 0;
    } else {
      dockerAvailable = false;
      runningContainersCount = 0;
    }
  });
}
checkDocker();
setInterval(checkDocker, 10000);

// Heartbeat sender
function sendHeartbeat() {
  const metrics = getSystemMetrics();
  metrics.docker = {
    available: dockerAvailable,
    runningContainers: runningContainersCount
  };

  const payload = JSON.stringify(metrics);

  try {
    const parsed = new URL(`${panelUrl}/api/wings/heartbeat`);
    const isHttps = parsed.protocol === 'https:';
    const client = isHttps ? https : http;

    const req = client.request({
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 3000
    }, (res) => {
      if (res.statusCode === 200) {
        // Heartbeat successful
      } else {
        console.warn(`[Wings] Panel heartbeat returned HTTP ${res.statusCode}`);
      }
    });

    req.on('error', (err) => {
      // console.warn(`[Wings] Heartbeat failed to reach ${panelUrl}: ${err.message}`);
    });

    req.write(payload);
    req.end();
  } catch (err) {
    console.error(`[Wings] Heartbeat dispatch error: ${err.message}`);
  }
}

// Initial registration
function registerNode() {
  const metrics = getSystemMetrics();
  const payload = JSON.stringify({
    id: nodeId,
    name: `${os.hostname()} (Wings VPS)`,
    location: 'Remote Cloud VPS',
    fqdn: os.hostname(),
    daemonPort,
    sftpPort: 2022,
    memoryTotal: metrics.memoryTotal,
    diskTotal: 1024000,
    status: 'online',
    wingsVersion: 'v1.11.12 (Wings Engine)'
  });

  try {
    const parsed = new URL(`${panelUrl}/api/wings/register`);
    const isHttps = parsed.protocol === 'https:';
    const client = isHttps ? https : http;

    const req = client.request({
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      if (res.statusCode === 200 || res.statusCode === 201) {
        console.log(`[Wings] Successfully linked node [${nodeId}] with Panel at ${panelUrl}`);
      }
    });

    req.on('error', () => {});
    req.write(payload);
    req.end();
  } catch (e) {}
}

registerNode();
setInterval(sendHeartbeat, 3000);
sendHeartbeat();
