const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const IS_VERCEL = !!(process.env.VERCEL || process.env.NOW_REGION);

const app = express();
const server = http.createServer(app);

// Conditionally load WebSocket only in non-serverless environments
let wss = null;
let subscribers = new Map(); // ws -> Set(serverId)

if (!IS_VERCEL) {
  try {
    const WebSocket = require('ws');
    wss = new WebSocket.Server({ server, path: '/ws' });

    wss.on('connection', (ws) => {
      subscribers.set(ws, new Set());

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          if (data.type === 'subscribe') {
            const subs = subscribers.get(ws);
            if (subs) {
              subs.add(data.serverId);
              const logs = serverLogs[data.serverId] || [];
              ws.send(JSON.stringify({
                type: 'log_backlog',
                serverId: data.serverId,
                logs
              }));
              const target = servers.find(s => s.id === data.serverId);
              if (target) {
                ws.send(JSON.stringify({
                  type: 'status',
                  serverId: target.id,
                  status: target.status,
                  isSuspended: target.isSuspended || false,
                  uptime: target.uptime
                }));
                ws.send(JSON.stringify({
                  type: 'stats',
                  serverId: target.id,
                  stats: target.stats
                }));
              }
            }
          } else if (data.type === 'unsubscribe') {
            const subs = subscribers.get(ws);
            if (subs) subs.delete(data.serverId);
          }
        } catch (e) {
          console.error('WS Error:', e);
        }
      });

      ws.on('close', () => {
        subscribers.delete(ws);
      });
    });
  } catch (err) {
    console.warn('WebSocket init skipped:', err.message);
  }
}

const PORT = process.env.PORT || 3000;
const BUNDLED_DATA_DIR = path.join(__dirname, 'data');
const DATA_DIR = IS_VERCEL ? path.join('/tmp', 'smooth_host_data') : BUNDLED_DATA_DIR;
const SERVERS_DIR = path.join(DATA_DIR, 'servers_files');

// Ensure directories safely without crashing on read-only environments
try {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SERVERS_DIR)) fs.mkdirSync(SERVERS_DIR, { recursive: true });

  // On Vercel, copy initial data files from BUNDLED_DATA_DIR to /tmp if not yet present
  if (IS_VERCEL && fs.existsSync(BUNDLED_DATA_DIR)) {
    ['locations.json', 'nodes.json', 'eggs.json', 'servers.json', 'users.json', 'allocations.json', 'api_keys.json', 'activity.json'].forEach(file => {
      const src = path.join(BUNDLED_DATA_DIR, file);
      const dest = path.join(DATA_DIR, file);
      if (!fs.existsSync(dest) && fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
      }
    });
  }
} catch (e) {
  console.warn('Filesystem write notice:', e.message);
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Serve 1-click VPS installation script
app.get('/install.sh', (req, res) => {
  const scriptPath = path.join(__dirname, 'install.sh');
  if (fs.existsSync(scriptPath)) {
    res.setHeader('Content-Type', 'text/x-shellscript');
    return res.sendFile(scriptPath);
  }
  res.status(404).send('#!/bin/bash\necho "Installer script not found"');
});

// Default Datasets Fallbacks
const DEFAULT_LOCATIONS = [
  {
    id: 'loc-local',
    short: 'local',
    long: 'Local VPS / Datacenter',
    description: 'Primary Local Host Infrastructure',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'loc-us-east',
    short: 'us-east',
    long: 'North America / Virginia (US East)',
    description: 'US East Core Edge Datacenter',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'loc-eu-central',
    short: 'eu-central',
    long: 'Europe / Frankfurt (Germany)',
    description: 'Frankfurt Central European Edge',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
];

const DEFAULT_NODES = [
  {
    id: 'node-local',
    name: 'Local VPS Node (Core)',
    locationId: 'loc-local',
    location: 'Local VPS / Datacenter',
    fqdn: '127.0.0.1',
    scheme: 'http',
    daemonPort: 8080,
    sftpPort: 2022,
    memoryTotal: 32768,
    memoryAllocated: 4096,
    memoryOverallocate: 0,
    diskTotal: 1024000,
    diskAllocated: 15360,
    diskOverallocate: 0,
    status: 'online',
    ping: 1,
    wingsVersion: 'v1.11.12 (Wings Engine)',
    token: 'ptld_local_host_wings_secret',
    lastHeartbeat: new Date().toISOString()
  },
  {
    id: 'node-us-east',
    name: 'US-East-01 (Virginia Core)',
    location: 'North America / US East',
    fqdn: 'us-east-01.smoothhost.cloud',
    scheme: 'https',
    daemonPort: 8080,
    sftpPort: 2022,
    memoryTotal: 65536,
    memoryAllocated: 24576,
    memoryOverallocate: 0,
    diskTotal: 2048000,
    diskAllocated: 450000,
    diskOverallocate: 0,
    status: 'online',
    ping: 18,
    wingsVersion: 'v1.11.12 (Wings Engine)'
  },
  {
    id: 'node-eu-central',
    name: 'EU-Central-01 (Frankfurt Edge)',
    location: 'Europe / Germany',
    fqdn: 'eu-central-01.smoothhost.cloud',
    scheme: 'https',
    daemonPort: 8080,
    sftpPort: 2022,
    memoryTotal: 131072,
    memoryAllocated: 49152,
    memoryOverallocate: 0,
    diskTotal: 4096000,
    diskAllocated: 1120000,
    diskOverallocate: 0,
    status: 'online',
    ping: 28,
    wingsVersion: 'v1.11.12 (Wings Engine)'
  },
  {
    id: 'node-ap-south',
    name: 'AP-South-01 (Singapore Turbo)',
    location: 'Asia Pacific / Singapore',
    fqdn: 'ap-south-01.smoothhost.cloud',
    scheme: 'https',
    daemonPort: 8080,
    sftpPort: 2022,
    memoryTotal: 65536,
    memoryAllocated: 16384,
    memoryOverallocate: 0,
    diskTotal: 2048000,
    diskAllocated: 320000,
    diskOverallocate: 0,
    status: 'online',
    ping: 52,
    wingsVersion: 'v1.11.12 (Wings Engine)'
  }
];

// Helper to read/write JSON files safely
function loadJSON(filename, defaultData) {
  try {
    const filePath = path.join(DATA_DIR, filename);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }
    // Also check bundled data dir if on Vercel
    const bundledPath = path.join(BUNDLED_DATA_DIR, filename);
    if (fs.existsSync(bundledPath)) {
      const content = fs.readFileSync(bundledPath, 'utf-8');
      return JSON.parse(content);
    }
    saveJSON(filename, defaultData);
  } catch (err) {}
  return JSON.parse(JSON.stringify(defaultData));
}

function saveJSON(filename, data) {
  try {
    const filePath = path.join(DATA_DIR, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {}
}

// In-memory runtime data loaded from JSON
let locations = loadJSON('locations.json', DEFAULT_LOCATIONS);
let nodes = loadJSON('nodes.json', DEFAULT_NODES);
let eggs = loadJSON('eggs.json', []);
let servers = loadJSON('servers.json', []);
let users = loadJSON('users.json', []);
let allocations = loadJSON('allocations.json', []);
let apiKeys = loadJSON('api_keys.json', { client: [], application: [] });
let activityLogs = loadJSON('activity.json', []);

// Virtual in-memory file system for servers
const virtualFiles = {
  's-9b4f21': {
    '/eula.txt': '# By changing the setting below to TRUE you agree to the Minecraft EULA.\neula=true\n',
    '/server.properties': `# Minecraft server properties - SMOOTH x HOST\nserver-port=25565\nmotd=\\u00A7b\\u00A7lSMOOTH x HOST \\u00A77| \\u00A7aHigh Performance Paper Server\nmax-players=100\nonline-mode=true\ndifficulty=hard\ngamemode=survival\npvp=true\nview-distance=10\nlevel-name=world\n`,
    '/paper-global.yml': `# SMOOTH x HOST Paper Global Optimization Config\nproxies:\n  velocity:\n    enabled: false\ntimings:\n  enabled: true\n`,
    '/ops.json': '[\n  {\n    "uuid": "4566e5f4-c083-4a1f-84e3-d730a6921234",\n    "name": "SmoothAdmin",\n    "level": 4\n  }\n]',
    '/plugins/EssentialsX.jar': '[Binary JAR file placeholder - EssentialsX v2.20.1]',
    '/plugins/LuckPerms.jar': '[Binary JAR file placeholder - LuckPerms v5.4.102]',
    '/logs/latest.log': `[INFO] Server listening on *:25565\n[INFO] [EssentialsX] Enabled v2.20.1\n[INFO] [LuckPerms] Connected to MySQL storage\n[INFO] Done! For help, type "help"`
  },
  's-6c1a89': {
    '/package.json': JSON.stringify({ name: 'aether-bot', version: '2.4.0', main: 'index.js' }, null, 2),
    '/index.js': `// SMOOTH x HOST - Discord Bot\nconsole.log('[SMOOTH x HOST] Bot online and monitoring 42 guilds.');`,
    '/.env': 'DISCORD_TOKEN=MTE5OTk4ODg3NzY2NTU0NDMzMg.Gz...\nPORT=8080\n'
  },
  's-4d8e33': {
    '/server.cfg': `hostname "SMOOTH x HOST | 2x Vanilla Rust"\nserver.port 28015\nserver.maxplayers 150\nserver.saveinterval 300\n`,
    '/README.txt': 'Rust Dedicated Server instance running on Wings engine.'
  }
};

// Initialize server demo files on disk if writable
function initializeServerFiles(serverId, eggId) {
  try {
    const sDir = path.join(SERVERS_DIR, serverId);
    if (!fs.existsSync(sDir)) fs.mkdirSync(sDir, { recursive: true });

    if (eggId === 'minecraft-paper') {
      fs.mkdirSync(path.join(sDir, 'plugins'), { recursive: true });
      fs.mkdirSync(path.join(sDir, 'logs'), { recursive: true });
      fs.writeFileSync(path.join(sDir, 'eula.txt'), 'eula=true\n');
      fs.writeFileSync(path.join(sDir, 'server.properties'), 'server-port=25565\nmotd=SMOOTH x HOST Server\n');
    }
  } catch (e) {}
}

servers.forEach(s => initializeServerFiles(s.id, s.eggId));

// Real-Time Log Buffers per server
const serverLogs = {};
servers.forEach(s => {
  serverLogs[s.id] = [
    `\x1b[36m[Wings Daemon]\x1b[0m Container configuration validated. Starting Wings runtime for container [${s.uuid}]`,
    `\x1b[32m[SMOOTH x HOST]\x1b[0m Allocating port ${s.allocation.ip}:${s.allocation.port}`,
    `\x1b[33m[Environment]\x1b[0m Server Memory limit: ${s.limits.memory}MB | CPU limit: ${s.limits.cpu}%`,
    `\x1b[32m[System]\x1b[0m Server instance is currently \x1b[1m${s.status.toUpperCase()}\x1b[0m`
  ];
  if (s.status === 'running') {
    serverLogs[s.id].push(`\x1b[32m[Server thread/INFO]\x1b[0m Server is listening on port ${s.allocation.port}. Ready for incoming connections!`);
  }
});

// Broadcast helper
function broadcastToServer(serverId, payload) {
  if (!wss) return;
  const jsonStr = JSON.stringify(payload);
  for (const [ws, serverIds] of subscribers.entries()) {
    if (serverIds.has(serverId) && ws.readyState === 1) { // 1 = OPEN
      ws.send(jsonStr);
    }
  }
}

function appendServerLog(serverId, line) {
  if (!serverLogs[serverId]) serverLogs[serverId] = [];
  serverLogs[serverId].push(line);
  if (serverLogs[serverId].length > 1000) serverLogs[serverId].shift();
  broadcastToServer(serverId, { type: 'console', serverId, line });
}

// Activity Logging helper
function logActivity({ event, user = 'admin@smoothhost.cloud', ip = '127.0.0.1', serverId = null, serverName = null, description = '' }) {
  const act = {
    id: `act-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
    user,
    ip,
    action: event,
    serverId,
    serverName,
    description
  };
  activityLogs.unshift(act);
  if (activityLogs.length > 500) activityLogs.pop();
  saveJSON('activity.json', activityLogs);
  return act;
}

// Background Simulation Engine (Wings Daemon Simulation - running locally)
if (!IS_VERCEL) {
  setInterval(() => {
    servers.forEach(srv => {
      if (srv.status === 'running' && !srv.isSuspended) {
        srv.uptime = (srv.uptime || 0) + 1;
        const cpuBase = srv.limits.cpu * 0.15;
        const cpuJitter = (Math.random() - 0.5) * 8;
        srv.stats.cpu = Math.max(1.2, Math.min(srv.limits.cpu, +(cpuBase + cpuJitter).toFixed(1)));

        const ramBase = srv.limits.memory * 0.65;
        const ramJitter = (Math.random() - 0.5) * 45;
        srv.stats.memory = Math.max(128, Math.min(srv.limits.memory - 50, Math.round(ramBase + ramJitter)));

        srv.stats.netRx = +(srv.stats.netRx + (Math.random() * 2.5)).toFixed(1);
        srv.stats.netTx = +(srv.stats.netTx + (Math.random() * 5.2)).toFixed(1);

        broadcastToServer(srv.id, {
          type: 'stats',
          serverId: srv.id,
          stats: srv.stats,
          uptime: srv.uptime
        });
      }
    });
  }, 1000);
}

// ======================== REST API ROUTES ======================== //

// System Overview
app.get('/api/system', (req, res) => {
  const totalServers = servers.length;
  const runningServers = servers.filter(s => s.status === 'running').length;
  const totalMem = servers.reduce((acc, s) => acc + s.limits.memory, 0);
  const usedMem = servers.reduce((acc, s) => acc + (s.status === 'running' ? s.stats.memory : 0), 0);
  const totalDisk = servers.reduce((acc, s) => acc + s.limits.disk, 0);

  res.json({
    brand: 'SMOOTH x HOST',
    version: '2.4.0 (Enterprise)',
    wingsVersion: 'v1.11.12',
    uptime: process.uptime(),
    isVercel: IS_VERCEL,
    stats: {
      totalServers,
      runningServers,
      totalMem,
      usedMem,
      totalDisk,
      locationsCount: locations.length,
      nodesCount: nodes.length,
      usersCount: users.length,
      allocationsCount: allocations.length
    }
  });
});

// Live Polling Route
app.get('/api/servers/:id/live', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  if (server.status === 'running' && !server.isSuspended) {
    server.uptime = (server.uptime || 0) + 1;
    const cpuBase = server.limits.cpu * 0.16;
    const cpuJitter = (Math.random() - 0.5) * 6;
    server.stats.cpu = Math.max(1.2, Math.min(server.limits.cpu, +(cpuBase + cpuJitter).toFixed(1)));

    const ramBase = server.limits.memory * 0.65;
    const ramJitter = (Math.random() - 0.5) * 35;
    server.stats.memory = Math.max(128, Math.min(server.limits.memory - 50, Math.round(ramBase + ramJitter)));

    server.stats.netRx = +(server.stats.netRx + (Math.random() * 2.1)).toFixed(1);
    server.stats.netTx = +(server.stats.netTx + (Math.random() * 4.3)).toFixed(1);
  }

  const logs = serverLogs[server.id] || [];
  res.json({
    serverId: server.id,
    status: server.status,
    isSuspended: server.isSuspended || false,
    uptime: server.uptime,
    stats: server.stats,
    logs: logs.slice(-70)
  });
});

// ======================== LOCATIONS API ======================== //

app.get('/api/locations', (req, res) => {
  const result = locations.map(loc => {
    const locNodes = nodes.filter(n => n.locationId === loc.id || n.location === loc.long || n.location === loc.short);
    const locServers = servers.filter(s => locNodes.some(n => n.id === s.nodeId));
    return {
      ...loc,
      nodeCount: locNodes.length,
      serverCount: locServers.length
    };
  });
  res.json(result);
});

app.post('/api/locations', (req, res) => {
  const { short, long, description } = req.body;
  if (!short || !long) {
    return res.status(400).json({ error: 'Short code and long name/description are required.' });
  }
  const cleanShort = short.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (locations.some(l => l.short.toLowerCase() === cleanShort)) {
    return res.status(400).json({ error: `Location short code "${cleanShort}" already exists.` });
  }

  const newLoc = {
    id: `loc-${Date.now().toString(36)}`,
    short: cleanShort,
    long: long.trim(),
    description: description ? description.trim() : '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  locations.push(newLoc);
  saveJSON('locations.json', locations);
  logActivity({ event: 'admin:location.create', description: `Created location ${newLoc.long} [${newLoc.short}]` });
  res.status(201).json(newLoc);
});

app.put('/api/locations/:id', (req, res) => {
  const loc = locations.find(l => l.id === req.params.id);
  if (!loc) return res.status(404).json({ error: 'Location not found' });
  const { short, long, description } = req.body;

  if (short) {
    const cleanShort = short.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (locations.some(l => l.id !== loc.id && l.short.toLowerCase() === cleanShort)) {
      return res.status(400).json({ error: `Location short code "${cleanShort}" is already taken.` });
    }
    loc.short = cleanShort;
  }
  if (long) {
    const oldLong = loc.long;
    loc.long = long.trim();
    // Update any nodes using this location
    nodes.forEach(n => {
      if (n.locationId === loc.id || n.location === oldLong) {
        n.location = loc.long;
      }
    });
    saveJSON('nodes.json', nodes);
  }
  if (description !== undefined) loc.description = description.trim();
  loc.updatedAt = new Date().toISOString();

  saveJSON('locations.json', locations);
  logActivity({ event: 'admin:location.update', description: `Updated location ${loc.long} [${loc.short}]` });
  res.json(loc);
});

app.delete('/api/locations/:id', (req, res) => {
  const loc = locations.find(l => l.id === req.params.id);
  if (!loc) return res.status(404).json({ error: 'Location not found' });

  const hasNodes = nodes.some(n => n.locationId === loc.id || n.location === loc.long || n.location === loc.short);
  if (hasNodes) {
    return res.status(400).json({ error: `Cannot delete location "${loc.long}" with active nodes assigned to it.` });
  }

  const idx = locations.findIndex(l => l.id === req.params.id);
  const [removed] = locations.splice(idx, 1);
  saveJSON('locations.json', locations);
  logActivity({ event: 'admin:location.delete', description: `Deleted location ${removed.long} [${removed.short}]` });
  res.json({ success: true, message: 'Location deleted successfully' });
});

// ======================== NODES API ======================== //

app.get('/api/nodes', (req, res) => {
  res.json(nodes);
});

app.post('/api/nodes', (req, res) => {
  const { name, location, locationId, fqdn, scheme, daemonPort, sftpPort, memoryTotal, diskTotal, memoryOverallocate, diskOverallocate } = req.body;
  if (!name || !fqdn) {
    return res.status(400).json({ error: 'Name and FQDN are required.' });
  }

  let matchedLoc = null;
  if (locationId) {
    matchedLoc = locations.find(l => l.id === locationId);
  } else if (location) {
    matchedLoc = locations.find(l => l.id === location || l.long.toLowerCase() === location.toLowerCase() || l.short.toLowerCase() === location.toLowerCase());
  }
  if (!matchedLoc) {
    matchedLoc = locations[0] || { id: 'loc-local', short: 'local', long: location || 'Local VPS / Datacenter' };
  }

  const id = `node-${Date.now().toString(36)}`;
  const newNode = {
    id,
    name,
    locationId: matchedLoc.id,
    location: matchedLoc.long,
    fqdn,
    scheme: scheme || 'http',
    daemonPort: Number(daemonPort) || 8080,
    sftpPort: Number(sftpPort) || 2022,
    memoryTotal: Number(memoryTotal) || 32768,
    memoryAllocated: 0,
    memoryOverallocate: Number(memoryOverallocate) || 0,
    diskTotal: Number(diskTotal) || 1024000,
    diskAllocated: 0,
    diskOverallocate: Number(diskOverallocate) || 0,
    status: 'online',
    ping: Math.floor(Math.random() * 10) + 2,
    wingsVersion: 'v1.11.12 (Wings Engine)',
    token: `ptld_${Math.random().toString(36).substring(2, 24)}`
  };
  nodes.push(newNode);
  saveJSON('nodes.json', nodes);

  // Auto-generate some default allocations for this node
  const cleanIp = (/^[0-9.]+$/.test(fqdn)) ? fqdn : '127.0.0.1';
  const basePort = 25565;
  for (let p = 0; p < 6; p++) {
    allocations.push({
      id: `alloc-${Date.now().toString(36)}-${p}`,
      nodeId: id,
      ip: cleanIp,
      port: basePort + p,
      assignedServerId: null,
      alias: `${fqdn}:${basePort + p}`,
      isPrimary: false,
      notes: p === 0 ? 'Primary Port' : 'Game Port'
    });
  }
  saveJSON('allocations.json', allocations);

  logActivity({ event: 'admin:node.create', description: `Created Wings node ${name} (${fqdn}) in ${matchedLoc.long}` });
  res.status(201).json(newNode);
});

app.put('/api/nodes/:id', (req, res) => {
  const node = nodes.find(n => n.id === req.params.id);
  if (!node) return res.status(404).json({ error: 'Node not found' });
  const { name, location, locationId, fqdn, scheme, daemonPort, sftpPort, memoryTotal, diskTotal, memoryOverallocate, diskOverallocate } = req.body;
  if (name) node.name = name;
  if (locationId) {
    const loc = locations.find(l => l.id === locationId);
    if (loc) {
      node.locationId = loc.id;
      node.location = loc.long;
    }
  } else if (location) {
    node.location = location;
  }
  if (fqdn) node.fqdn = fqdn;
  if (scheme) node.scheme = scheme;
  if (daemonPort) node.daemonPort = Number(daemonPort);
  if (sftpPort) node.sftpPort = Number(sftpPort);
  if (memoryTotal) node.memoryTotal = Number(memoryTotal);
  if (diskTotal) node.diskTotal = Number(diskTotal);
  if (memoryOverallocate !== undefined) node.memoryOverallocate = Number(memoryOverallocate);
  if (diskOverallocate !== undefined) node.diskOverallocate = Number(diskOverallocate);

  saveJSON('nodes.json', nodes);
  logActivity({ event: 'admin:node.update', description: `Updated configuration for node ${node.name}` });
  res.json(node);
});

app.delete('/api/nodes/:id', (req, res) => {
  const hasServers = servers.some(s => s.nodeId === req.params.id);
  if (hasServers) {
    return res.status(400).json({ error: 'Cannot delete node with active server instances attached.' });
  }
  const idx = nodes.findIndex(n => n.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Node not found' });
  const [removed] = nodes.splice(idx, 1);
  saveJSON('nodes.json', nodes);
  allocations = allocations.filter(a => a.nodeId !== req.params.id);
  saveJSON('allocations.json', allocations);
  logActivity({ event: 'admin:node.delete', description: `Deleted node ${removed.name}` });
  res.json({ success: true, message: 'Node deleted successfully' });
});

// Wings Daemon Config Generator
app.get('/api/nodes/:id/configuration', (req, res) => {
  const node = nodes.find(n => n.id === req.params.id);
  if (!node) return res.status(404).json({ error: 'Node not found' });

  const configYaml = `# Wings Configuration File - SMOOTH x HOST
debug: false
uuid: ${node.id}
token_id: ${Math.random().toString(36).substring(2, 18)}
token: ${node.token || 'ptld_' + Math.random().toString(36).substring(2, 24)}
api:
  host: 0.0.0.0
  port: ${node.daemonPort || 8080}
  ssl:
    enabled: ${node.scheme === 'https'}
    cert: /etc/letsencrypt/live/${node.fqdn}/fullchain.pem
    key: /etc/letsencrypt/live/${node.fqdn}/privkey.pem
  upload_limit: 100
system:
  root_directory: /var/lib/pterodactyl
  log_directory: /var/log/pterodactyl
  data: /var/lib/pterodactyl/volumes
  sftp:
    bind_port: ${node.sftpPort || 2022}
allowed_mounts: []
remote: ${req.protocol}://${req.get('host')}
`;
  res.json({ yaml: configYaml });
});

// Wings Auto-Deploy Command (Pterodactyl 1-Line VPS Connect)
app.get('/api/nodes/:id/deploy-command', (req, res) => {
  const node = nodes.find(n => n.id === req.params.id);
  if (!node) return res.status(404).json({ error: 'Node not found' });

  const hostUrl = `${req.protocol}://${req.get('host')}`;
  const nodeToken = node.token || `ptld_${Math.random().toString(36).substring(2, 24)}`;
  node.token = nodeToken;
  saveJSON('nodes.json', nodes);

  const oneLineCommand = `bash <(curl -sSL ${hostUrl}/install.sh) --wings`;
  const fullAutomatedCmd = `curl -sSL ${hostUrl}/install.sh | sudo bash -s -- --wings --panel-url ${hostUrl} --node-id ${node.id} --token ${nodeToken}`;

  res.json({
    nodeId: node.id,
    token: nodeToken,
    panelUrl: hostUrl,
    command: oneLineCommand,
    automatedCommand: fullAutomatedCmd
  });
});

// Wings Remote Node Heartbeat (Incoming telemetry from real connected VPS)
app.post('/api/wings/heartbeat', (req, res) => {
  const { nodeId, status, memoryTotal, memoryAllocated, uptime, platform, docker } = req.body;
  if (!nodeId) return res.status(400).json({ error: 'nodeId required' });

  let node = nodes.find(n => n.id === nodeId);
  if (!node) {
    const defaultLoc = locations[0] || { id: 'loc-local', short: 'local', long: 'Local VPS / Datacenter' };
    node = {
      id: nodeId,
      name: `${req.body.hostname || nodeId} (Connected VPS)`,
      locationId: defaultLoc.id,
      location: defaultLoc.long,
      fqdn: req.body.hostname || req.ip.replace('::ffff:', ''),
      scheme: 'http',
      daemonPort: 8080,
      sftpPort: 2022,
      memoryTotal: Number(memoryTotal) || 16384,
      memoryAllocated: Number(memoryAllocated) || 2048,
      diskTotal: 1024000,
      diskAllocated: 50000,
      status: 'online',
      ping: Math.floor(Math.random() * 5) + 1,
      wingsVersion: 'v1.11.12 (Wings Daemon)',
      lastHeartbeat: new Date().toISOString()
    };
    nodes.push(node);
  } else {
    node.status = status || 'online';
    if (memoryTotal) node.memoryTotal = Number(memoryTotal);
    if (memoryAllocated) node.memoryAllocated = Number(memoryAllocated);
    node.ping = Math.floor(Math.random() * 5) + 1;
    node.lastHeartbeat = new Date().toISOString();
  }

  saveJSON('nodes.json', nodes);
  res.json({ success: true, registered: true });
});

// Wings Node Registration Endpoint
app.post('/api/wings/register', (req, res) => {
  const { id, name, location, locationId, fqdn, memoryTotal, daemonPort, sftpPort } = req.body;
  if (!id) return res.status(400).json({ error: 'Node id required' });

  let existing = nodes.find(n => n.id === id);
  if (!existing) {
    const defaultLoc = locations.find(l => l.id === locationId) || locations[0] || { id: 'loc-local', short: 'local', long: location || 'Local VPS / Datacenter' };
    existing = {
      id,
      name: name || `VPS Node (${id})`,
      locationId: defaultLoc.id,
      location: defaultLoc.long,
      fqdn: fqdn || req.ip.replace('::ffff:', ''),
      scheme: 'http',
      daemonPort: Number(daemonPort) || 8080,
      sftpPort: Number(sftpPort) || 2022,
      memoryTotal: Number(memoryTotal) || 32768,
      memoryAllocated: 0,
      diskTotal: 1024000,
      diskAllocated: 0,
      status: 'online',
      ping: 5,
      wingsVersion: 'v1.11.12 (Wings Engine)',
      lastHeartbeat: new Date().toISOString()
    };
    nodes.push(existing);
    saveJSON('nodes.json', nodes);
  }
  res.json({ success: true, node: existing });
});

// ======================== HOST VPS AUTO-SETUP ======================== //

function configureHostNode(options = {}) {
  const os = require('os');

  let detectedIp = '127.0.0.1';
  try {
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const iface of ifaces[name]) {
        if (!iface.internal && iface.family === 'IPv4') {
          detectedIp = iface.address;
          break;
        }
      }
      if (detectedIp !== '127.0.0.1') break;
    }
  } catch (e) {}

  const ip = (options.ip || detectedIp).trim();
  const locName = (options.location || 'Local VPS / Datacenter').trim();
  const locCode = (options.locCode || 'local').trim().toLowerCase();
  const nodeName = (options.name || `Local VPS (${ip})`).trim();
  const ram = Number(options.ram) || Math.round(os.totalmem() / 1024 / 1024) || 16384;
  const disk = Number(options.disk) || 1024000;
  const daemonPort = Number(options.wingsPort) || 8080;
  const sftpPort = Number(options.sftpPort) || 2022;
  const panelPort = Number(options.panelPort) || PORT || 3000;

  // 1. Ensure/update Location in locations
  let loc = locations.find(l => l.short === locCode || l.id === 'loc-local');
  if (!loc) {
    loc = {
      id: 'loc-local',
      short: locCode,
      long: locName,
      description: 'Primary Host System Infrastructure',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    locations.unshift(loc);
  } else {
    loc.short = locCode;
    loc.long = locName;
    loc.updatedAt = new Date().toISOString();
  }
  saveJSON('locations.json', locations);

  // 2. Ensure/update primary Node in nodes
  let node = nodes.find(n => n.id === 'node-local');
  const token = (node && node.token) ? node.token : `ptld_${Math.random().toString(36).substring(2, 24)}`;
  if (!node) {
    node = {
      id: 'node-local',
      name: nodeName,
      locationId: loc.id,
      location: loc.long,
      fqdn: ip,
      scheme: 'http',
      daemonPort,
      sftpPort,
      memoryTotal: ram,
      memoryAllocated: 4096,
      memoryOverallocate: 0,
      diskTotal: disk,
      diskAllocated: 15360,
      diskOverallocate: 0,
      status: 'online',
      ping: 1,
      wingsVersion: 'v1.11.12 (Wings Engine)',
      token,
      lastHeartbeat: new Date().toISOString()
    };
    nodes.unshift(node);
  } else {
    node.name = nodeName;
    node.locationId = loc.id;
    node.location = loc.long;
    node.fqdn = ip;
    node.daemonPort = daemonPort;
    node.sftpPort = sftpPort;
    node.memoryTotal = ram;
    node.diskTotal = disk;
    node.token = token;
    node.status = 'online';
    node.ping = 1;
    node.lastHeartbeat = new Date().toISOString();
  }
  saveJSON('nodes.json', nodes);

  // 3. Ensure/update Allocations for node-local
  const gamePorts = [25565, 25566, 25567, 25568, 8080, 28015, 3001, 3002];
  allocations = allocations.filter(a => a.nodeId !== 'node-local');
  gamePorts.forEach((p, idx) => {
    let assignedServerId = null;
    let isPrimary = false;
    let notes = '';
    if (p === 25565) {
      assignedServerId = 's-9b4f21';
      isPrimary = true;
      notes = 'Minecraft Game Port';
    } else if (p === 25566) {
      assignedServerId = 's-9b4f21';
      notes = 'Minecraft Dynmap View';
    } else if (p === 8080) {
      assignedServerId = 's-6c1a89';
      isPrimary = true;
      notes = 'Bot Webhook';
    } else if (p === 28015) {
      assignedServerId = 's-4d8e33';
      isPrimary = true;
      notes = 'Rust Game Port';
    }

    allocations.push({
      id: `alloc-local-${idx + 1}`,
      nodeId: 'node-local',
      ip,
      port: p,
      assignedServerId,
      alias: `${ip}:${p}`,
      isPrimary,
      notes
    });
  });
  saveJSON('allocations.json', allocations);

  // 4. Update servers to point to node-local with real IP
  servers.forEach(srv => {
    if (srv.id === 's-9b4f21' || srv.id === 's-6c1a89' || srv.id === 's-4d8e33' || srv.nodeId === 'node-local') {
      srv.nodeId = 'node-local';
      if (srv.allocation) {
        srv.allocation.ip = ip;
        srv.allocation.alias = `${ip}:${srv.allocation.port}`;
      }
      if (srv.allocations && srv.allocations[0]) {
        srv.allocations[0].ip = ip;
        srv.allocations[0].alias = `${ip}:${srv.allocations[0].port}`;
      }
      if (srv.sftp) {
        srv.sftp.host = ip;
        srv.sftp.port = sftpPort;
      }
    }
  });
  saveJSON('servers.json', servers);

  // 5. Generate Wings config.yml content
  const configYaml = `# Wings Configuration File - SMOOTH x HOST (Pterodactyl Spec)
debug: false
uuid: ${node.id}
token_id: ${Math.random().toString(36).substring(2, 18)}
token: ${token}
api:
  host: 0.0.0.0
  port: ${daemonPort}
  ssl:
    enabled: false
  upload_limit: 100
system:
  root_directory: /var/lib/pterodactyl
  log_directory: /var/log/pterodactyl
  data: /var/lib/pterodactyl/volumes
  sftp:
    bind_port: ${sftpPort}
allowed_mounts: []
remote: http://127.0.0.1:${panelPort}
`;

  // Write to /etc/pterodactyl/config.yml if accessible
  try {
    const etcDir = '/etc/pterodactyl';
    if (!fs.existsSync(etcDir)) fs.mkdirSync(etcDir, { recursive: true });
    fs.writeFileSync(path.join(etcDir, 'config.yml'), configYaml, 'utf-8');
  } catch (e) {}

  // Also write to local directory config.yml for convenience
  try {
    fs.writeFileSync(path.join(__dirname, 'config.yml'), configYaml, 'utf-8');
  } catch (e) {}

  logActivity({ event: 'admin:node.setup_host', description: `Configured primary host node [${node.name}] (${ip}) in ${loc.long}` });

  return {
    success: true,
    location: loc,
    node,
    serverIp: ip,
    allocationsCount: gamePorts.length,
    configYaml
  };
}

app.post('/api/admin/auto-setup', (req, res) => {
  try {
    const result = configureHostNode(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Node Allocations
app.get('/api/nodes/:id/allocations', (req, res) => {
  const nodeAllocations = allocations.filter(a => a.nodeId === req.params.id);
  res.json(nodeAllocations);
});

app.post('/api/nodes/:id/allocations', (req, res) => {
  const node = nodes.find(n => n.id === req.params.id);
  if (!node) return res.status(404).json({ error: 'Node not found' });
  const { ip, ports, alias } = req.body;
  if (!ip || !ports) return res.status(400).json({ error: 'IP and Ports are required' });

  const portList = [];
  const parts = ports.split(',').map(p => p.trim());
  for (const part of parts) {
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      if (!isNaN(start) && !isNaN(end) && end >= start) {
        for (let i = start; i <= Math.min(start + 50, end); i++) portList.push(i);
      }
    } else {
      const p = Number(part);
      if (!isNaN(p)) portList.push(p);
    }
  }

  const added = [];
  portList.forEach(port => {
    const exists = allocations.some(a => a.nodeId === node.id && a.ip === ip && a.port === port);
    if (!exists) {
      const newAlloc = {
        id: `alloc-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
        nodeId: node.id,
        ip,
        port,
        assignedServerId: null,
        alias: alias ? `${alias}:${port}` : `${node.fqdn}:${port}`,
        isPrimary: false,
        notes: ''
      };
      allocations.push(newAlloc);
      added.push(newAlloc);
    }
  });

  saveJSON('allocations.json', allocations);
  logActivity({ event: 'admin:allocation.create', description: `Generated ${added.length} ports on ${node.name}` });
  res.json({ count: added.length, allocations: added });
});

// ======================== EGGS & NESTS API ======================== //

app.get('/api/eggs', (req, res) => {
  res.json(eggs);
});

app.post('/api/eggs', (req, res) => {
  const { nest, name, dockerImage, dockerImages, startup, variables, icon, color } = req.body;
  if (!name || !nest || !startup) return res.status(400).json({ error: 'Name, nest and startup required' });

  const id = `egg-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
  const newEgg = {
    id,
    nest,
    name,
    author: 'custom@smoothhost.cloud',
    dockerImage: dockerImage || 'ghcr.io/pterodactyl/yolks:java_17',
    dockerImages: dockerImages && dockerImages.length ? dockerImages : [dockerImage || 'ghcr.io/pterodactyl/yolks:java_17'],
    startup,
    variables: variables || [],
    icon: icon || 'fa-cube',
    color: color || '#00e5ff'
  };

  eggs.push(newEgg);
  saveJSON('eggs.json', eggs);
  logActivity({ event: 'admin:egg.create', description: `Added new egg: ${name} in ${nest}` });
  res.status(201).json(newEgg);
});

app.put('/api/eggs/:id', (req, res) => {
  const egg = eggs.find(e => e.id === req.params.id);
  if (!egg) return res.status(404).json({ error: 'Egg not found' });
  const { name, dockerImage, dockerImages, startup, variables, icon, color } = req.body;
  if (name) egg.name = name;
  if (dockerImage) egg.dockerImage = dockerImage;
  if (dockerImages) egg.dockerImages = dockerImages;
  if (startup) egg.startup = startup;
  if (variables) egg.variables = variables;
  if (icon) egg.icon = icon;
  if (color) egg.color = color;

  saveJSON('eggs.json', eggs);
  logActivity({ event: 'admin:egg.update', description: `Updated egg configuration: ${egg.name}` });
  res.json(egg);
});

app.delete('/api/eggs/:id', (req, res) => {
  const idx = eggs.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Egg not found' });
  const [removed] = eggs.splice(idx, 1);
  saveJSON('eggs.json', eggs);
  logActivity({ event: 'admin:egg.delete', description: `Deleted egg ${removed.name}` });
  res.json({ success: true });
});

// Import Pterodactyl Egg JSON
app.post('/api/eggs/import', (req, res) => {
  try {
    const eggData = req.body;
    if (!eggData.name) return res.status(400).json({ error: 'Invalid egg JSON structure' });

    const id = `egg-${eggData.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString(36).substring(4)}`;
    const imported = {
      id,
      nest: eggData.nest || 'Custom Import',
      name: eggData.name,
      author: eggData.author || 'imported@pterodactyl.panel',
      dockerImage: eggData.docker_images ? Object.values(eggData.docker_images)[0] : (eggData.image || 'ghcr.io/pterodactyl/yolks:java_17'),
      dockerImages: eggData.docker_images ? Object.values(eggData.docker_images) : [eggData.image || 'ghcr.io/pterodactyl/yolks:java_17'],
      startup: eggData.startup || './start.sh',
      icon: 'fa-box-open',
      color: '#38bdf8',
      variables: (eggData.variables || []).map(v => ({
        name: v.env_variable || v.name,
        label: v.name || v.env_variable,
        defaultValue: v.default_value || '',
        description: v.description || ''
      }))
    };

    eggs.push(imported);
    saveJSON('eggs.json', eggs);
    logActivity({ event: 'admin:egg.import', description: `Imported Pterodactyl egg: ${imported.name}` });
    res.json(imported);
  } catch (err) {
    res.status(400).json({ error: 'Failed to import egg JSON: ' + err.message });
  }
});

// Export Egg JSON
app.get('/api/eggs/:id/export', (req, res) => {
  const egg = eggs.find(e => e.id === req.params.id);
  if (!egg) return res.status(404).json({ error: 'Egg not found' });

  const exportObj = {
    _comment: 'Exported from SMOOTH x HOST Pterodactyl-Compatible Panel',
    meta: { version: 'PTDL_v2', update_url: null },
    exported_at: new Date().toISOString(),
    name: egg.name,
    author: egg.author,
    description: `Exported egg template for ${egg.name}`,
    features: null,
    docker_images: (egg.dockerImages || [egg.dockerImage]).reduce((acc, img, i) => {
      acc[`Image #${i+1}`] = img;
      return acc;
    }, {}),
    startup: egg.startup,
    variables: (egg.variables || []).map(v => ({
      name: v.label,
      description: v.description,
      env_variable: v.name,
      default_value: v.defaultValue,
      user_viewable: true,
      user_editable: true,
      rules: 'required|string'
    }))
  };

  res.setHeader('Content-Disposition', `attachment; filename="${egg.id}.json"`);
  res.json(exportObj);
});

// ======================== SERVERS API ======================== //

app.get('/api/servers', (req, res) => {
  res.json(servers);
});

app.get('/api/servers/:id', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  res.json(server);
});

app.post('/api/servers', (req, res) => {
  const { name, description, nodeId, eggId, memory, cpu, disk, swap, io } = req.body;
  if (!name || !nodeId || !eggId) {
    return res.status(400).json({ error: 'Server name, Node, and Egg are required' });
  }

  const selectedNode = nodes.find(n => n.id === nodeId) || nodes[0];
  const selectedEgg = eggs.find(e => e.id === eggId) || eggs[0];
  const randomHex = Math.random().toString(16).substring(2, 8);
  const id = `s-${randomHex}`;
  const uuid = `${randomHex}e0-4a8b-49fc-912a-${Date.now().toString(16).substring(4)}`;

  // Find or create an allocation from node
  let alloc = allocations.find(a => a.nodeId === selectedNode.id && !a.assignedServerId);
  if (!alloc) {
    const port = Math.floor(Math.random() * 20000) + 20000;
    alloc = {
      id: `alloc-${Date.now().toString(36)}`,
      nodeId: selectedNode.id,
      ip: selectedNode.fqdn.replace(/^[a-z0-9-]+\./, '198.51.'),
      port,
      assignedServerId: id,
      alias: `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.smoothhost.net:${port}`,
      isPrimary: true,
      notes: 'Game Port'
    };
    allocations.push(alloc);
  } else {
    alloc.assignedServerId = id;
    alloc.isPrimary = true;
    alloc.notes = 'Game Port';
  }
  saveJSON('allocations.json', allocations);

  const memLimit = Number(memory) || 2048;
  const cpuLimit = Number(cpu) || 100;
  const diskLimit = Number(disk) || 10240;

  const newServer = {
    id,
    uuid,
    name,
    description: description || `Deployed via SMOOTH x HOST Quick Deploy`,
    nodeId: selectedNode.id,
    eggId: selectedEgg.id,
    dockerImage: selectedEgg.dockerImage,
    status: 'offline',
    isSuspended: false,
    uptime: 0,
    allocation: {
      ip: alloc.ip,
      port: alloc.port,
      alias: alloc.alias
    },
    allocations: [
      {
        id: alloc.id,
        ip: alloc.ip,
        port: alloc.port,
        alias: alloc.alias,
        isPrimary: true,
        notes: 'Primary Allocation'
      }
    ],
    limits: {
      memory: memLimit,
      cpu: cpuLimit,
      disk: diskLimit,
      io: Number(io) || 500
    },
    build: {
      memory: memLimit,
      cpu: cpuLimit,
      disk: diskLimit,
      swap: Number(swap) || 256,
      io: Number(io) || 500,
      oomKiller: true
    },
    stats: { cpu: 0, memory: 0, disk: 120, netRx: 0, netTx: 0 },
    startup: selectedEgg.startup,
    variables: (selectedEgg.variables || []).reduce((acc, v) => {
      acc[v.name] = v.defaultValue;
      return acc;
    }, {}),
    sftp: {
      host: selectedNode.fqdn,
      port: selectedNode.sftpPort || 2022,
      username: `smooth_${id}`
    },
    databases: [],
    backups: [],
    schedules: [],
    subusers: []
  };

  servers.push(newServer);
  saveJSON('servers.json', servers);
  initializeServerFiles(newServer.id, newServer.eggId);

  // Setup virtual files for newly created server
  virtualFiles[newServer.id] = {
    '/server.properties': `# Properties for ${newServer.name}\nserver-port=${alloc.port}\nmotd=SMOOTH x HOST Server\n`,
    '/README.txt': `Welcome to ${newServer.name} hosted on SMOOTH x HOST!\n`
  };

  serverLogs[newServer.id] = [
    `\x1b[36m[Wings Daemon]\x1b[0m Provisioning container [${uuid}] on node ${selectedNode.name}`,
    `\x1b[32m[SMOOTH x HOST]\x1b[0m Created file tree for ${selectedEgg.name}`,
    `\x1b[33m[Installer]\x1b[0m Environment configured with ${newServer.limits.memory}MB RAM / ${newServer.limits.cpu}% CPU`,
    `\x1b[32m[SMOOTH x HOST]\x1b[0m Server ready for initial boot!`
  ];

  logActivity({ event: 'server:create', serverId: newServer.id, serverName: newServer.name, description: `Deployed server instance on ${selectedNode.name}` });
  res.status(201).json(newServer);
});

app.delete('/api/servers/:id', (req, res) => {
  const index = servers.findIndex(s => s.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Server not found' });
  const [removed] = servers.splice(index, 1);
  saveJSON('servers.json', servers);

  // Free allocations back to node pool
  allocations.forEach(a => {
    if (a.assignedServerId === removed.id) {
      a.assignedServerId = null;
      a.isPrimary = false;
      a.notes = '';
    }
  });
  saveJSON('allocations.json', allocations);

  try {
    const sDir = path.join(SERVERS_DIR, removed.id);
    if (fs.existsSync(sDir)) {
      fs.rmSync(sDir, { recursive: true, force: true });
    }
  } catch (e) {}

  delete serverLogs[removed.id];
  delete virtualFiles[removed.id];

  logActivity({ event: 'server:delete', serverId: removed.id, serverName: removed.name, description: `Deleted server instance permanently` });
  res.json({ success: true, message: 'Server deleted successfully' });
});

// Server Power Actions
app.post('/api/servers/:id/power', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  const { action } = req.body;

  if (server.isSuspended) {
    return res.status(403).json({ error: 'Server is currently suspended by administration. Power actions are disabled.' });
  }

  if (action === 'start') {
    if (server.status === 'running') {
      return res.status(400).json({ error: 'Server is already running' });
    }
    server.status = 'starting';
    broadcastToServer(server.id, { type: 'status', serverId: server.id, status: 'starting' });
    appendServerLog(server.id, `\x1b[36m[Wings Daemon]\x1b[0m Connecting to container [${server.uuid}]...`);
    appendServerLog(server.id, `\x1b[33m[Wings Daemon]\x1b[0m Running boot command: ${server.startup.replace('{{SERVER_MEMORY}}', server.limits.memory)}`);

    setTimeout(() => {
      appendServerLog(server.id, `[Server thread/INFO]: Container initialized on port ${server.allocation.port}. Online!`);
      server.status = 'running';
      server.uptime = 1;
      saveJSON('servers.json', servers);
      broadcastToServer(server.id, { type: 'status', serverId: server.id, status: 'running' });
    }, 1200);

    logActivity({ event: 'server:power.start', serverId: server.id, serverName: server.name, description: 'Power action: START' });
    return res.json({ success: true, status: 'starting' });
  }

  if (action === 'stop') {
    if (server.status === 'offline') {
      return res.status(400).json({ error: 'Server is already offline' });
    }
    server.status = 'stopping';
    broadcastToServer(server.id, { type: 'status', serverId: server.id, status: 'stopping' });
    appendServerLog(server.id, `\x1b[31m[Wings Daemon]\x1b[0m Sending SIGTERM to process group...`);

    setTimeout(() => {
      server.status = 'offline';
      server.uptime = 0;
      server.stats.cpu = 0;
      server.stats.memory = 0;
      saveJSON('servers.json', servers);
      appendServerLog(server.id, `\x1b[32m[Wings Daemon]\x1b[0m Container stopped cleanly. Code 0`);
      broadcastToServer(server.id, { type: 'status', serverId: server.id, status: 'offline' });
    }, 1000);

    logActivity({ event: 'server:power.stop', serverId: server.id, serverName: server.name, description: 'Power action: STOP' });
    return res.json({ success: true, status: 'stopping' });
  }

  if (action === 'restart') {
    server.status = 'starting';
    broadcastToServer(server.id, { type: 'status', serverId: server.id, status: 'starting' });
    appendServerLog(server.id, `\x1b[33m[Wings Daemon]\x1b[0m Restart initiated by user...`);

    setTimeout(() => {
      server.status = 'running';
      server.uptime = 1;
      saveJSON('servers.json', servers);
      appendServerLog(server.id, `\x1b[32m[Wings Daemon]\x1b[0m Server successfully restarted and operational.`);
      broadcastToServer(server.id, { type: 'status', serverId: server.id, status: 'running' });
    }, 1400);

    logActivity({ event: 'server:power.restart', serverId: server.id, serverName: server.name, description: 'Power action: RESTART' });
    return res.json({ success: true, status: 'restarting' });
  }

  if (action === 'kill') {
    server.status = 'offline';
    server.uptime = 0;
    server.stats.cpu = 0;
    server.stats.memory = 0;
    saveJSON('servers.json', servers);
    appendServerLog(server.id, `\x1b[1;31m[Wings Daemon]\x1b[0m SENT SIGKILL (-9)! Immediate process termination.`);
    broadcastToServer(server.id, { type: 'status', serverId: server.id, status: 'offline' });
    logActivity({ event: 'server:power.kill', serverId: server.id, serverName: server.name, description: 'Power action: KILL (SIGKILL)' });
    return res.json({ success: true, status: 'offline' });
  }

  res.status(400).json({ error: 'Invalid power action' });
});

// Console Command Execution
app.post('/api/servers/:id/command', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  const { command } = req.body;
  if (!command || !command.trim()) return res.status(400).json({ error: 'Empty command' });

  const cleanCmd = command.trim();
  appendServerLog(server.id, `\x1b[37;1m> ${cleanCmd}\x1b[0m`);

  if (server.isSuspended) {
    appendServerLog(server.id, `\x1b[31m[Wings Daemon] Cannot send command: Server is suspended.\x1b[0m`);
    return res.status(403).json({ error: 'Server is suspended' });
  }

  if (server.status !== 'running') {
    appendServerLog(server.id, `\x1b[31m[Wings Daemon] Cannot send command: Server container is not running.\x1b[0m`);
    return res.json({ success: false, message: 'Server is not running' });
  }

  setTimeout(() => {
    const cmdLower = cleanCmd.toLowerCase();
    if (cmdLower === 'help') {
      appendServerLog(server.id, `[Server thread/INFO]: Available commands: /help, /tps, /op <player>, /say <msg>, /whitelist <on|off>, /status, /plugins, /stop, /save-all`);
    } else if (cmdLower === 'tps') {
      appendServerLog(server.id, `[Server thread/INFO]: TPS from last 1m, 5m, 15m: 20.0, 19.98, 20.0`);
    } else if (cmdLower.startsWith('op ')) {
      const target = cleanCmd.substring(3).trim();
      appendServerLog(server.id, `[Server thread/INFO]: Made ${target} a server operator`);
    } else if (cmdLower.startsWith('say ')) {
      const msg = cleanCmd.substring(4).trim();
      appendServerLog(server.id, `[Server thread/INFO]: [Server] ${msg}`);
    } else if (cmdLower === 'status') {
      appendServerLog(server.id, `[Server thread/INFO]: Memory: ${server.stats.memory}MB / ${server.limits.memory}MB | CPU: ${server.stats.cpu}% | Uptime: ${server.uptime}s`);
    } else if (cmdLower === 'plugins' || cmdLower === 'pl') {
      appendServerLog(server.id, `[Server thread/INFO]: Plugins (2): EssentialsX v2.20.1, LuckPerms v5.4.102`);
    } else if (cmdLower === 'save-all') {
      appendServerLog(server.id, `[Server thread/INFO]: Saved the world to disk cleanly.`);
    } else {
      appendServerLog(server.id, `[Server thread/INFO]: Executed command: "${cleanCmd}"`);
    }
  }, 80);

  logActivity({ event: 'server:console.command', serverId: server.id, serverName: server.name, description: `Executed: ${cleanCmd}` });
  res.json({ success: true });
});

// ======================== FILE MANAGER API ======================== //

// List Files
app.get('/api/servers/:id/files', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const relPath = req.query.path || '/';
  const vFiles = virtualFiles[server.id] || {};

  // Try physical filesystem first
  const targetDir = path.join(SERVERS_DIR, server.id, relPath);
  if (fs.existsSync(targetDir)) {
    try {
      const entries = fs.readdirSync(targetDir, { withFileTypes: true });
      const files = entries.map(entry => {
        const fullPath = path.join(targetDir, entry.name);
        let stat = {};
        try { stat = fs.statSync(fullPath); } catch (e) {}
        return {
          name: entry.name,
          isDirectory: entry.isDirectory(),
          size: stat.size || 0,
          modified: stat.mtime || new Date(),
          mode: entry.isDirectory() ? '0755' : '0644'
        };
      });
      files.sort((a, b) => a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : (a.isDirectory ? -1 : 1));
      return res.json({ currentPath: relPath, files });
    } catch (e) {}
  }

  // Fallback to virtual files
  const filesMap = new Map();
  const normalizedPath = relPath === '/' ? '/' : (relPath.endsWith('/') ? relPath : `${relPath}/`);

  Object.keys(vFiles).forEach(fpath => {
    if (fpath.startsWith(normalizedPath) || (relPath === '/' && fpath.startsWith('/'))) {
      const remainder = fpath.slice(normalizedPath.length);
      const parts = remainder.split('/').filter(Boolean);
      if (parts.length === 1) {
        filesMap.set(parts[0], {
          name: parts[0],
          isDirectory: false,
          size: (vFiles[fpath] || '').length,
          modified: new Date(),
          mode: '0644'
        });
      } else if (parts.length > 1) {
        filesMap.set(parts[0], {
          name: parts[0],
          isDirectory: true,
          size: 0,
          modified: new Date(),
          mode: '0755'
        });
      }
    }
  });

  const files = Array.from(filesMap.values());
  files.sort((a, b) => a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : (a.isDirectory ? -1 : 1));
  res.json({ currentPath: relPath, files });
});

// Get File Content
app.get('/api/servers/:id/files/content', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'Path is required' });

  const targetFile = path.join(SERVERS_DIR, server.id, filePath);
  if (fs.existsSync(targetFile)) {
    try {
      const content = fs.readFileSync(targetFile, 'utf-8');
      return res.json({ path: filePath, content });
    } catch (e) {}
  }

  const vFiles = virtualFiles[server.id] || {};
  const normKey = filePath.startsWith('/') ? filePath : `/${filePath}`;
  if (vFiles[normKey] !== undefined) {
    return res.json({ path: filePath, content: vFiles[normKey] });
  }

  res.status(404).json({ error: 'File not found' });
});

// Save File Content
app.post('/api/servers/:id/files/content', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const { path: filePath, content } = req.body;
  if (!filePath) return res.status(400).json({ error: 'File path required' });

  const normKey = filePath.startsWith('/') ? filePath : `/${filePath}`;
  if (!virtualFiles[server.id]) virtualFiles[server.id] = {};
  virtualFiles[server.id][normKey] = content || '';

  try {
    const targetFile = path.join(SERVERS_DIR, server.id, filePath);
    const dir = path.dirname(targetFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(targetFile, content || '', 'utf-8');
  } catch (e) {}

  appendServerLog(server.id, `\x1b[34m[File Manager]\x1b[0m Saved file: ${filePath}`);
  logActivity({ event: 'server:file.write', serverId: server.id, serverName: server.name, description: `Updated file: ${filePath}` });
  res.json({ success: true, message: 'File saved successfully' });
});

// Download File
app.get('/api/servers/:id/files/download', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'Path required' });

  const fileName = path.basename(filePath);
  const targetFile = path.join(SERVERS_DIR, server.id, filePath);

  if (fs.existsSync(targetFile)) {
    return res.download(targetFile, fileName);
  }

  const vFiles = virtualFiles[server.id] || {};
  const normKey = filePath.startsWith('/') ? filePath : `/${filePath}`;
  if (vFiles[normKey] !== undefined) {
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(vFiles[normKey]);
  }

  res.status(404).json({ error: 'File not found' });
});

// Upload File
app.post('/api/servers/:id/files/upload', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const { path: relPath, filename, content, isBase64 } = req.body;
  if (!filename) return res.status(400).json({ error: 'Filename is required' });

  const fullRel = `${relPath || ''}/${filename}`.replace(/\/+/g, '/');
  if (!virtualFiles[server.id]) virtualFiles[server.id] = {};

  const fileData = isBase64 ? Buffer.from(content, 'base64') : Buffer.from(content || '', 'utf-8');
  virtualFiles[server.id][fullRel] = isBase64 ? '[Binary File]' : (content || '');

  try {
    const targetPath = path.join(SERVERS_DIR, server.id, relPath || '', filename);
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(targetPath, fileData);
  } catch (e) {}

  appendServerLog(server.id, `\x1b[34m[File Manager]\x1b[0m Uploaded file: ${filename}`);
  logActivity({ event: 'server:file.upload', serverId: server.id, serverName: server.name, description: `Uploaded file ${filename} to ${relPath || '/'}` });
  res.json({ success: true, path: fullRel });
});

// Rename File or Folder
app.post('/api/servers/:id/files/rename', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const { from, to } = req.body;
  if (!from || !to) return res.status(400).json({ error: 'from and to paths required' });

  const normFrom = from.startsWith('/') ? from : `/${from}`;
  const normTo = to.startsWith('/') ? to : `/${to}`;

  if (virtualFiles[server.id]) {
    if (virtualFiles[server.id][normFrom] !== undefined) {
      virtualFiles[server.id][normTo] = virtualFiles[server.id][normFrom];
      delete virtualFiles[server.id][normFrom];
    }
    // Rename any children if directory
    Object.keys(virtualFiles[server.id]).forEach(k => {
      if (k.startsWith(`${normFrom}/`)) {
        const sub = k.slice(normFrom.length);
        virtualFiles[server.id][`${normTo}${sub}`] = virtualFiles[server.id][k];
        delete virtualFiles[server.id][k];
      }
    });
  }

  try {
    const fromPath = path.join(SERVERS_DIR, server.id, from);
    const toPath = path.join(SERVERS_DIR, server.id, to);
    if (fs.existsSync(fromPath)) {
      fs.renameSync(fromPath, toPath);
    }
  } catch (e) {}

  appendServerLog(server.id, `\x1b[34m[File Manager]\x1b[0m Renamed ${from} to ${to}`);
  res.json({ success: true });
});

// Copy / Duplicate File
app.post('/api/servers/:id/files/copy', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const { path: sourcePath } = req.body;
  if (!sourcePath) return res.status(400).json({ error: 'Source path required' });

  const ext = path.extname(sourcePath);
  const base = sourcePath.slice(0, sourcePath.length - ext.length);
  const destPath = `${base}_copy${ext}`;

  const normSrc = sourcePath.startsWith('/') ? sourcePath : `/${sourcePath}`;
  const normDest = destPath.startsWith('/') ? destPath : `/${destPath}`;

  if (virtualFiles[server.id] && virtualFiles[server.id][normSrc] !== undefined) {
    virtualFiles[server.id][normDest] = virtualFiles[server.id][normSrc];
  }

  try {
    const src = path.join(SERVERS_DIR, server.id, sourcePath);
    const dst = path.join(SERVERS_DIR, server.id, destPath);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
    }
  } catch (e) {}

  appendServerLog(server.id, `\x1b[34m[File Manager]\x1b[0m Copied ${sourcePath} to ${destPath}`);
  res.json({ success: true, newPath: destPath });
});

// Compress / Archive Files
app.post('/api/servers/:id/files/compress', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const { root, files } = req.body;
  const archiveName = `archive_${Date.now().toString(36)}.tar.gz`;
  const archiveRel = `${root || ''}/${archiveName}`.replace(/\/+/g, '/');

  if (!virtualFiles[server.id]) virtualFiles[server.id] = {};
  virtualFiles[server.id][archiveRel] = `[Compressed Archive containing ${(files || []).length} items]`;

  appendServerLog(server.id, `\x1b[35m[Archive Engine]\x1b[0m Created compressed archive: ${archiveName}`);
  logActivity({ event: 'server:file.compress', serverId: server.id, serverName: server.name, description: `Archived ${(files || []).length} files to ${archiveName}` });
  res.json({ success: true, archive: archiveRel });
});

// Decompress / Unarchive
app.post('/api/servers/:id/files/decompress', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const { path: archivePath } = req.body;
  appendServerLog(server.id, `\x1b[35m[Archive Engine]\x1b[0m Extracted contents of: ${archivePath}`);
  logActivity({ event: 'server:file.decompress', serverId: server.id, serverName: server.name, description: `Extracted archive ${archivePath}` });
  res.json({ success: true });
});

// Permissions Chmod
app.post('/api/servers/:id/files/chmod', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  const { path: filePath, mode } = req.body;
  appendServerLog(server.id, `\x1b[34m[File Manager]\x1b[0m Changed permissions of ${filePath} to ${mode || '0644'}`);
  res.json({ success: true });
});

// Mass Delete Files
app.post('/api/servers/:id/files/mass-delete', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  const { paths } = req.body;
  if (!Array.isArray(paths)) return res.status(400).json({ error: 'paths array required' });

  paths.forEach(p => {
    const norm = p.startsWith('/') ? p : `/${p}`;
    if (virtualFiles[server.id]) {
      delete virtualFiles[server.id][norm];
      Object.keys(virtualFiles[server.id]).forEach(k => {
        if (k.startsWith(`${norm}/`)) delete virtualFiles[server.id][k];
      });
    }
    try {
      const full = path.join(SERVERS_DIR, server.id, p);
      if (fs.existsSync(full)) {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) fs.rmSync(full, { recursive: true, force: true });
        else fs.unlinkSync(full);
      }
    } catch (e) {}
  });

  appendServerLog(server.id, `\x1b[34m[File Manager]\x1b[0m Bulk deleted ${paths.length} items`);
  logActivity({ event: 'server:file.delete', serverId: server.id, serverName: server.name, description: `Bulk deleted ${paths.length} files` });
  res.json({ success: true, count: paths.length });
});

// Create File or Directory
app.post('/api/servers/:id/files/create', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const { path: relPath, name, isDirectory } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const fullRel = `${relPath || ''}/${name}`.replace(/\/+/g, '/');
  if (!virtualFiles[server.id]) virtualFiles[server.id] = {};

  if (isDirectory) {
    virtualFiles[server.id][`${fullRel}/.keep`] = '';
  } else {
    virtualFiles[server.id][fullRel] = '';
  }

  try {
    const targetPath = path.join(SERVERS_DIR, server.id, relPath || '', name);
    if (isDirectory) {
      fs.mkdirSync(targetPath, { recursive: true });
    } else {
      fs.writeFileSync(targetPath, '', 'utf-8');
    }
  } catch (e) {}

  appendServerLog(server.id, `\x1b[34m[File Manager]\x1b[0m Created ${isDirectory ? 'directory' : 'file'}: ${name}`);
  logActivity({ event: 'server:file.create', serverId: server.id, serverName: server.name, description: `Created ${isDirectory ? 'directory' : 'file'}: ${name}` });
  res.json({ success: true });
});

// Delete Single File or Directory
app.delete('/api/servers/:id/files', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'Path is required' });

  const normKey = filePath.startsWith('/') ? filePath : `/${filePath}`;
  if (virtualFiles[server.id]) {
    delete virtualFiles[server.id][normKey];
    Object.keys(virtualFiles[server.id]).forEach(k => {
      if (k.startsWith(`${normKey}/`)) delete virtualFiles[server.id][k];
    });
  }

  try {
    const targetPath = path.join(SERVERS_DIR, server.id, filePath);
    if (fs.existsSync(targetPath)) {
      const stat = fs.statSync(targetPath);
      if (stat.isDirectory()) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(targetPath);
      }
    }
  } catch (e) {}

  appendServerLog(server.id, `\x1b[34m[File Manager]\x1b[0m Deleted: ${filePath}`);
  logActivity({ event: 'server:file.delete', serverId: server.id, serverName: server.name, description: `Deleted ${filePath}` });
  res.json({ success: true });
});

// ======================== DATABASES API ======================== //

app.get('/api/servers/:id/databases', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  res.json(server.databases || []);
});

app.post('/api/servers/:id/databases', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  const { name, allowedHosts } = req.body;
  if (!name) return res.status(400).json({ error: 'Database name required' });

  const dbId = `db-${Date.now().toString(36)}`;
  const cleanDbName = `s${server.id.replace('s-', '')}_${name.replace(/[^a-z0-9_]/gi, '')}`;
  const newDb = {
    id: dbId,
    name: cleanDbName,
    host: '127.0.0.1:3306',
    user: `u_${cleanDbName.substring(0, 12)}`,
    pass: `SmoothPass_${Math.random().toString(36).substring(2, 10)}!`,
    allowedHosts: allowedHosts || '%',
    maxConnections: 50
  };

  server.databases = server.databases || [];
  server.databases.push(newDb);
  saveJSON('servers.json', servers);
  logActivity({ event: 'server:database.create', serverId: server.id, serverName: server.name, description: `Provisioned database ${cleanDbName}` });
  res.status(201).json(newDb);
});

app.post('/api/servers/:id/databases/:dbId/rotate-password', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const db = (server.databases || []).find(d => d.id === req.params.dbId);
  if (!db) return res.status(404).json({ error: 'Database not found' });

  db.pass = `SmoothPass_${Math.random().toString(36).substring(2, 12)}!`;
  saveJSON('servers.json', servers);
  logActivity({ event: 'server:database.password_reset', serverId: server.id, serverName: server.name, description: `Reset password for database ${db.name}` });
  res.json(db);
});

app.delete('/api/servers/:id/databases/:dbId', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  server.databases = (server.databases || []).filter(d => d.id !== req.params.dbId);
  saveJSON('servers.json', servers);
  logActivity({ event: 'server:database.delete', serverId: server.id, serverName: server.name, description: `Deleted database ${req.params.dbId}` });
  res.json({ success: true });
});

// ======================== BACKUPS API ======================== //

app.get('/api/servers/:id/backups', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  res.json(server.backups || []);
});

app.post('/api/servers/:id/backups', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  const { name, isLocked, ignoredFiles } = req.body;

  const backupId = `bk-${Date.now().toString(36)}`;
  const newBackup = {
    id: backupId,
    name: name || `Backup-${new Date().toLocaleDateString()}`,
    size: `${(Math.random() * 2 + 0.8).toFixed(2)} GB`,
    createdAt: new Date().toISOString(),
    isLocked: !!isLocked,
    ignoredFiles: ignoredFiles || '',
    checksum: `sha256:${Math.random().toString(16).substring(2, 10)}${Math.random().toString(16).substring(2, 10)}...`,
    status: 'completed'
  };

  server.backups = server.backups || [];
  server.backups.unshift(newBackup);
  saveJSON('servers.json', servers);

  appendServerLog(server.id, `\x1b[35m[Backup Manager]\x1b[0m Created snapshot: ${newBackup.name}`);
  logActivity({ event: 'server:backup.create', serverId: server.id, serverName: server.name, description: `Created backup snapshot ${newBackup.name}` });
  res.status(201).json(newBackup);
});

app.post('/api/servers/:id/backups/:backupId/lock', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  const bk = (server.backups || []).find(b => b.id === req.params.backupId);
  if (!bk) return res.status(404).json({ error: 'Backup not found' });

  bk.isLocked = !bk.isLocked;
  saveJSON('servers.json', servers);
  logActivity({ event: 'server:backup.lock', serverId: server.id, serverName: server.name, description: `${bk.isLocked ? 'Locked' : 'Unlocked'} backup ${bk.name}` });
  res.json(bk);
});

app.post('/api/servers/:id/backups/:backupId/restore', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  const bk = (server.backups || []).find(b => b.id === req.params.backupId);
  if (!bk) return res.status(404).json({ error: 'Backup not found' });

  appendServerLog(server.id, `\x1b[1;33m[Backup Manager]\x1b[0m RESTORE INITIATED: Restoring from snapshot [${bk.name}]...`);
  appendServerLog(server.id, `\x1b[36m[Wings Daemon]\x1b[0m Extracting archive tarball to volume directory...`);

  setTimeout(() => {
    appendServerLog(server.id, `\x1b[32m[Backup Manager]\x1b[0m Verification passed. Restored 100% of snapshot files.`);
    logActivity({ event: 'server:backup.restore', serverId: server.id, serverName: server.name, description: `Restored snapshot ${bk.name}` });
  }, 1000);

  res.json({ success: true, message: 'Restore sequence started' });
});

app.get('/api/servers/:id/backups/:backupId/download', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  const bk = (server.backups || []).find(b => b.id === req.params.backupId);
  if (!bk) return res.status(404).json({ error: 'Backup not found' });

  res.setHeader('Content-Disposition', `attachment; filename="${bk.name.replace(/[^a-z0-9_-]/gi, '_')}.tar.gz"`);
  res.setHeader('Content-Type', 'application/gzip');
  res.send(Buffer.from(`SIMULATED_BACKUP_ARCHIVE_SMOOTH_HOST_${server.id}_${bk.id}`));
});

app.delete('/api/servers/:id/backups/:backupId', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const bk = (server.backups || []).find(b => b.id === req.params.backupId);
  if (bk && bk.isLocked) {
    return res.status(400).json({ error: 'Cannot delete a locked backup snapshot. Unlock it first.' });
  }

  server.backups = (server.backups || []).filter(b => b.id !== req.params.backupId);
  saveJSON('servers.json', servers);
  logActivity({ event: 'server:backup.delete', serverId: server.id, serverName: server.name, description: `Deleted backup ${req.params.backupId}` });
  res.json({ success: true });
});

// ======================== SCHEDULES (CRON) API ======================== //

app.get('/api/servers/:id/schedules', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  res.json(server.schedules || []);
});

app.post('/api/servers/:id/schedules', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  const { name, cron, tasks } = req.body;
  if (!name || !cron) return res.status(400).json({ error: 'Name and cron required' });

  const sched = {
    id: `sch-${Date.now().toString(36)}`,
    name,
    cron,
    isActive: true,
    lastRun: 'Never',
    tasks: tasks || [
      { id: `tsk-1`, sequence: 1, action: 'power', payload: 'restart', timeOffset: 0 }
    ]
  };

  server.schedules = server.schedules || [];
  server.schedules.push(sched);
  saveJSON('servers.json', servers);
  logActivity({ event: 'server:schedule.create', serverId: server.id, serverName: server.name, description: `Configured cron schedule: ${name} (${cron})` });
  res.status(201).json(sched);
});

app.post('/api/servers/:id/schedules/:schedId/toggle', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  const sc = (server.schedules || []).find(s => s.id === req.params.schedId);
  if (!sc) return res.status(404).json({ error: 'Schedule not found' });

  sc.isActive = !sc.isActive;
  saveJSON('servers.json', servers);
  res.json(sc);
});

app.post('/api/servers/:id/schedules/:schedId/trigger', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  const sc = (server.schedules || []).find(s => s.id === req.params.schedId);
  if (!sc) return res.status(404).json({ error: 'Schedule not found' });

  sc.lastRun = 'Just now';
  saveJSON('servers.json', servers);

  appendServerLog(server.id, `\x1b[35m[Schedule Engine]\x1b[0m Executing scheduled task chain: ${sc.name}`);

  // Run tasks sequentially with simulated timing
  (sc.tasks || []).forEach((tsk, idx) => {
    setTimeout(() => {
      if (tsk.action === 'command') {
        appendServerLog(server.id, `\x1b[37;1m> ${tsk.payload}\x1b[0m`);
      } else if (tsk.action === 'power') {
        appendServerLog(server.id, `\x1b[33m[Schedule Engine]\x1b[0m Power action [${tsk.payload.toUpperCase()}] triggered by schedule`);
      } else if (tsk.action === 'backup') {
        appendServerLog(server.id, `\x1b[35m[Backup Manager]\x1b[0m Scheduled automatic backup initiated`);
      }
    }, (idx + 1) * 350);
  });

  logActivity({ event: 'server:schedule.trigger', serverId: server.id, serverName: server.name, description: `Triggered schedule ${sc.name} manually` });
  res.json({ success: true, message: 'Schedule triggered successfully' });
});

app.delete('/api/servers/:id/schedules/:schedId', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  server.schedules = (server.schedules || []).filter(s => s.id !== req.params.schedId);
  saveJSON('servers.json', servers);
  res.json({ success: true });
});

// ======================== SUB-USERS API ======================== //

app.get('/api/servers/:id/users', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  res.json(server.subusers || []);
});

app.post('/api/servers/:id/users', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  const { email, permissions } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const subuser = {
    id: `usr-${Date.now().toString(36)}`,
    email,
    role: 'Co-Owner',
    permissions: permissions || ['control.start', 'control.restart', 'console.read']
  };

  server.subusers = server.subusers || [];
  server.subusers.push(subuser);
  saveJSON('servers.json', servers);
  logActivity({ event: 'server:user.invite', serverId: server.id, serverName: server.name, description: `Invited sub-user ${email}` });
  res.status(201).json(subuser);
});

app.put('/api/servers/:id/users/:userId', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  const sub = (server.subusers || []).find(u => u.id === req.params.userId);
  if (!sub) return res.status(404).json({ error: 'Subuser not found' });

  if (req.body.permissions) sub.permissions = req.body.permissions;
  if (req.body.role) sub.role = req.body.role;
  saveJSON('servers.json', servers);
  logActivity({ event: 'server:user.update', serverId: server.id, serverName: server.name, description: `Updated permissions for sub-user ${sub.email}` });
  res.json(sub);
});

app.delete('/api/servers/:id/users/:userId', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  server.subusers = (server.subusers || []).filter(u => u.id !== req.params.userId);
  saveJSON('servers.json', servers);
  logActivity({ event: 'server:user.delete', serverId: server.id, serverName: server.name, description: `Revoked sub-user access` });
  res.json({ success: true });
});

// ======================== NETWORK & ALLOCATIONS API ======================== //

app.get('/api/servers/:id/network', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const assigned = allocations.filter(a => a.assignedServerId === server.id);
  const nodePool = allocations.filter(a => a.nodeId === server.nodeId && !a.assignedServerId);

  res.json({
    allocations: assigned,
    availableOnNode: nodePool
  });
});

app.post('/api/servers/:id/network/assign', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  let alloc = allocations.find(a => a.nodeId === server.nodeId && !a.assignedServerId);
  if (!alloc) {
    // Generate an automatic port
    const port = Math.floor(Math.random() * 20000) + 20000;
    const node = nodes.find(n => n.id === server.nodeId) || nodes[0];
    alloc = {
      id: `alloc-${Date.now().toString(36)}`,
      nodeId: server.nodeId,
      ip: node.fqdn.replace(/^[a-z0-9-]+\./, '198.51.'),
      port,
      assignedServerId: server.id,
      alias: `${node.fqdn}:${port}`,
      isPrimary: false,
      notes: 'Secondary Allocation'
    };
    allocations.push(alloc);
  } else {
    alloc.assignedServerId = server.id;
    alloc.isPrimary = false;
    alloc.notes = 'Secondary Allocation';
  }

  server.allocations = allocations.filter(a => a.assignedServerId === server.id);
  saveJSON('allocations.json', allocations);
  saveJSON('servers.json', servers);
  logActivity({ event: 'server:network.assign', serverId: server.id, serverName: server.name, description: `Assigned new port ${alloc.port}` });
  res.json(alloc);
});

app.post('/api/servers/:id/network/primary', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  const { allocationId } = req.body;

  allocations.forEach(a => {
    if (a.assignedServerId === server.id) {
      a.isPrimary = (a.id === allocationId);
      if (a.isPrimary) {
        server.allocation = { ip: a.ip, port: a.port, alias: a.alias };
      }
    }
  });

  server.allocations = allocations.filter(a => a.assignedServerId === server.id);
  saveJSON('allocations.json', allocations);
  saveJSON('servers.json', servers);
  logActivity({ event: 'server:network.primary', serverId: server.id, serverName: server.name, description: `Switched primary allocation` });
  res.json({ success: true });
});

app.post('/api/servers/:id/network/notes', (req, res) => {
  const { allocationId, notes } = req.body;
  const alloc = allocations.find(a => a.id === allocationId);
  if (!alloc) return res.status(404).json({ error: 'Allocation not found' });

  alloc.notes = notes || '';
  saveJSON('allocations.json', allocations);
  res.json(alloc);
});

app.delete('/api/servers/:id/network/:allocId', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const alloc = allocations.find(a => a.id === req.params.allocId);
  if (!alloc) return res.status(404).json({ error: 'Allocation not found' });

  if (alloc.isPrimary) {
    return res.status(400).json({ error: 'Cannot unassign primary allocation. Switch primary first.' });
  }

  alloc.assignedServerId = null;
  alloc.isPrimary = false;
  alloc.notes = '';

  server.allocations = allocations.filter(a => a.assignedServerId === server.id);
  saveJSON('allocations.json', allocations);
  saveJSON('servers.json', servers);
  logActivity({ event: 'server:network.unassign', serverId: server.id, serverName: server.name, description: `Unassigned port ${alloc.port}` });
  res.json({ success: true });
});

// ======================== SERVER SETTINGS & TRANSFERS ======================== //

app.post('/api/servers/:id/settings', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const { name, description, startup, dockerImage, variables } = req.body;
  if (name) server.name = name;
  if (description !== undefined) server.description = description;
  if (startup) server.startup = startup;
  if (dockerImage) server.dockerImage = dockerImage;
  if (variables) server.variables = { ...server.variables, ...variables };

  saveJSON('servers.json', servers);
  appendServerLog(server.id, `\x1b[33m[Settings]\x1b[0m Server settings and environment variables updated.`);
  logActivity({ event: 'server:settings.update', serverId: server.id, serverName: server.name, description: `Updated server settings & startup configuration` });
  res.json(server);
});

// Server Node Transfer
app.post('/api/servers/:id/transfer', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  const { targetNodeId } = req.body;

  const targetNode = nodes.find(n => n.id === targetNodeId);
  if (!targetNode) return res.status(400).json({ error: 'Target node not found' });

  server.nodeId = targetNode.id;
  server.sftp.host = targetNode.fqdn;

  appendServerLog(server.id, `\x1b[35m[Transfer Engine]\x1b[0m INITIATED NODE TRANSFER to [${targetNode.name}]`);
  appendServerLog(server.id, `\x1b[36m[Transfer Engine]\x1b[0m Streaming archive to Wings daemon on ${targetNode.fqdn}...`);

  setTimeout(() => {
    appendServerLog(server.id, `\x1b[32m[Transfer Engine]\x1b[0m Archive unpacked. Server now bound to ${targetNode.name}.`);
  }, 1200);

  saveJSON('servers.json', servers);
  logActivity({ event: 'server:transfer', serverId: server.id, serverName: server.name, description: `Migrated server to node ${targetNode.name}` });
  res.json({ success: true, message: `Server transferred to ${targetNode.name}` });
});

// Reinstall Server
app.post('/api/servers/:id/reinstall', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  server.status = 'offline';
  server.uptime = 0;

  initializeServerFiles(server.id, server.eggId);

  appendServerLog(server.id, `\x1b[1;31m[Installer]\x1b[0m REINSTALL INITIATED. Files reset to default egg template.`);
  broadcastToServer(server.id, { type: 'status', serverId: server.id, status: 'offline' });
  saveJSON('servers.json', servers);

  logActivity({ event: 'server:reinstall', serverId: server.id, serverName: server.name, description: `Reinstalled server files to default egg template` });
  res.json({ success: true, message: 'Server reinstalled successfully' });
});

// ======================== ADMIN SERVER CONTROLS ======================== //

// Update Server Build Limits
app.post('/api/admin/servers/:id/build', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const { memory, cpu, disk, swap, io, oomKiller } = req.body;
  if (memory) {
    server.limits.memory = Number(memory);
    server.build.memory = Number(memory);
  }
  if (cpu) {
    server.limits.cpu = Number(cpu);
    server.build.cpu = Number(cpu);
  }
  if (disk) {
    server.limits.disk = Number(disk);
    server.build.disk = Number(disk);
  }
  if (swap !== undefined) server.build.swap = Number(swap);
  if (io !== undefined) {
    server.limits.io = Number(io);
    server.build.io = Number(io);
  }
  if (oomKiller !== undefined) server.build.oomKiller = !!oomKiller;

  saveJSON('servers.json', servers);
  appendServerLog(server.id, `\x1b[33m[Admin]\x1b[0m Resource build quotas modified: ${server.limits.memory}MB RAM, ${server.limits.cpu}% CPU`);
  logActivity({ event: 'admin:server.build', serverId: server.id, serverName: server.name, description: `Updated build quotas` });
  res.json(server);
});

// Suspend / Unsuspend Server
app.post('/api/admin/servers/:id/suspend', (req, res) => {
  const server = servers.find(s => s.id === req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  server.isSuspended = !server.isSuspended;
  if (server.isSuspended) {
    server.status = 'offline';
    server.uptime = 0;
    server.stats.cpu = 0;
    server.stats.memory = 0;
    appendServerLog(server.id, `\x1b[1;31m[Admin]\x1b[0m SERVER SUSPENDED BY ADMINISTRATOR.`);
    broadcastToServer(server.id, { type: 'status', serverId: server.id, status: 'offline', isSuspended: true });
  } else {
    appendServerLog(server.id, `\x1b[1;32m[Admin]\x1b[0m SERVER UNSUSPENDED. Ready for power actions.`);
    broadcastToServer(server.id, { type: 'status', serverId: server.id, status: server.status, isSuspended: false });
  }

  saveJSON('servers.json', servers);
  logActivity({ event: 'admin:server.suspend', serverId: server.id, serverName: server.name, description: `${server.isSuspended ? 'Suspended' : 'Unsuspended'} server` });
  res.json({ isSuspended: server.isSuspended });
});

// ======================== ADMIN USERS API ======================== //

app.get('/api/admin/users', (req, res) => {
  res.json(users);
});

app.post('/api/admin/users', (req, res) => {
  const { username, email, firstName, lastName, role, rootAdmin } = req.body;
  if (!username || !email) return res.status(400).json({ error: 'Username and Email required' });

  const initials = `${(firstName || username)[0]}${(lastName || '')[0] || ''}`.toUpperCase();
  const newUser = {
    id: `usr-${Date.now().toString(36)}`,
    username,
    email,
    firstName: firstName || '',
    lastName: lastName || '',
    role: role || (rootAdmin ? 'Root Admin' : 'Client Customer'),
    rootAdmin: !!rootAdmin,
    twoFactorEnabled: false,
    createdAt: new Date().toISOString(),
    avatar: initials || 'US',
    sshKeys: []
  };

  users.push(newUser);
  saveJSON('users.json', users);
  logActivity({ event: 'admin:user.create', description: `Created panel user account for ${email}` });
  res.status(201).json(newUser);
});

app.put('/api/admin/users/:id', (req, res) => {
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { username, email, firstName, lastName, role, rootAdmin } = req.body;
  if (username) user.username = username;
  if (email) user.email = email;
  if (firstName !== undefined) user.firstName = firstName;
  if (lastName !== undefined) user.lastName = lastName;
  if (role) user.role = role;
  if (rootAdmin !== undefined) user.rootAdmin = !!rootAdmin;

  saveJSON('users.json', users);
  logActivity({ event: 'admin:user.update', description: `Updated user account for ${user.email}` });
  res.json(user);
});

app.delete('/api/admin/users/:id', (req, res) => {
  const idx = users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });
  if (users[idx].rootAdmin && users.filter(u => u.rootAdmin).length <= 1) {
    return res.status(400).json({ error: 'Cannot delete the sole Root Administrator' });
  }

  const [removed] = users.splice(idx, 1);
  saveJSON('users.json', users);
  logActivity({ event: 'admin:user.delete', description: `Deleted user account ${removed.email}` });
  res.json({ success: true });
});

// ======================== API KEYS & AUDIT LOGS ======================== //

// Application API Keys (Admin)
app.get('/api/admin/api-keys', (req, res) => {
  res.json(apiKeys.application || []);
});

app.post('/api/admin/api-keys', (req, res) => {
  const { description, allowedIps } = req.body;
  const token = `ptra_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`;
  const newKey = {
    id: `key-${Date.now().toString(36)}`,
    identifier: token,
    description: description || 'External Automation Token',
    allowedIps: allowedIps ? allowedIps.split(',').map(s => s.trim()) : [],
    lastUsed: 'Never',
    createdAt: new Date().toISOString()
  };

  apiKeys.application = apiKeys.application || [];
  apiKeys.application.push(newKey);
  saveJSON('api_keys.json', apiKeys);
  logActivity({ event: 'admin:api_key.create', description: `Generated application API key: ${newKey.description}` });
  res.status(201).json(newKey);
});

app.delete('/api/admin/api-keys/:keyId', (req, res) => {
  apiKeys.application = (apiKeys.application || []).filter(k => k.id !== req.params.keyId);
  saveJSON('api_keys.json', apiKeys);
  res.json({ success: true });
});

// Client API Keys (Account)
app.get('/api/account/api-keys', (req, res) => {
  res.json(apiKeys.client || []);
});

app.post('/api/account/api-keys', (req, res) => {
  const { description, allowedIps } = req.body;
  const token = `ptrc_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`;
  const newKey = {
    id: `key-${Date.now().toString(36)}`,
    identifier: token,
    description: description || 'Client Automation Key',
    allowedIps: allowedIps ? allowedIps.split(',').map(s => s.trim()) : [],
    lastUsed: 'Never',
    createdAt: new Date().toISOString()
  };

  apiKeys.client = apiKeys.client || [];
  apiKeys.client.push(newKey);
  saveJSON('api_keys.json', apiKeys);
  logActivity({ event: 'account:api_key.create', description: `Generated client API key: ${newKey.description}` });
  res.status(201).json(newKey);
});

app.delete('/api/account/api-keys/:keyId', (req, res) => {
  apiKeys.client = (apiKeys.client || []).filter(k => k.id !== req.params.keyId);
  saveJSON('api_keys.json', apiKeys);
  res.json({ success: true });
});

// Activity / Audit Logs
app.get('/api/activity', (req, res) => {
  res.json(activityLogs.slice(0, 100));
});

app.get('/api/servers/:id/activity', (req, res) => {
  const filtered = activityLogs.filter(a => a.serverId === req.params.id);
  res.json(filtered.slice(0, 50));
});

// ======================== ACCOUNT CENTER API ======================== //

app.get('/api/account', (req, res) => {
  const adminUser = users.find(u => u.rootAdmin) || users[0] || {
    username: 'admin',
    email: 'admin@smoothhost.cloud',
    firstName: 'Root',
    lastName: 'Administrator',
    role: 'Root Admin',
    twoFactorEnabled: true,
    avatar: 'AD'
  };
  res.json(adminUser);
});

app.post('/api/account', (req, res) => {
  const adminUser = users.find(u => u.rootAdmin) || users[0];
  const { email, username, firstName, lastName } = req.body;
  if (email) adminUser.email = email;
  if (username) adminUser.username = username;
  if (firstName !== undefined) adminUser.firstName = firstName;
  if (lastName !== undefined) adminUser.lastName = lastName;
  saveJSON('users.json', users);
  logActivity({ event: 'account:profile.update', description: 'Updated account profile details' });
  res.json(adminUser);
});

app.post('/api/account/password', (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
  }
  logActivity({ event: 'account:password.change', description: 'Account password changed successfully' });
  res.json({ success: true, message: 'Password updated successfully' });
});

app.post('/api/account/2fa/generate', (req, res) => {
  const secret = `SMOOTH${Math.random().toString(36).substring(2, 10).toUpperCase()}2FA`;
  // Generate a clean SVG QR code simulation
  const qrSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">
    <rect width="160" height="160" fill="#ffffff" rx="10"/>
    <rect x="20" y="20" width="35" height="35" fill="#000000"/>
    <rect x="25" y="25" width="25" height="25" fill="#ffffff"/>
    <rect x="30" y="30" width="15" height="15" fill="#000000"/>
    <rect x="105" y="20" width="35" height="35" fill="#000000"/>
    <rect x="110" y="25" width="25" height="25" fill="#ffffff"/>
    <rect x="115" y="30" width="15" height="15" fill="#000000"/>
    <rect x="20" y="105" width="35" height="35" fill="#000000"/>
    <rect x="25" y="110" width="25" height="25" fill="#ffffff"/>
    <rect x="30" y="115" width="15" height="15" fill="#000000"/>
    <rect x="65" y="25" width="10" height="10" fill="#000000"/>
    <rect x="80" y="40" width="15" height="15" fill="#000000"/>
    <rect x="65" y="70" width="25" height="25" fill="#000000"/>
    <rect x="100" y="70" width="15" height="10" fill="#000000"/>
    <rect x="120" y="85" width="15" height="15" fill="#000000"/>
    <rect x="65" y="105" width="15" height="15" fill="#000000"/>
    <rect x="90" y="115" width="25" height="10" fill="#000000"/>
    <rect x="125" y="125" width="15" height="15" fill="#000000"/>
  </svg>`;

  res.json({
    secret,
    qrSvg
  });
});

app.post('/api/account/2fa/verify', (req, res) => {
  const { code } = req.body;
  if (!code || code.length !== 6) {
    return res.status(400).json({ error: 'Please enter a valid 6-digit TOTP code' });
  }

  const adminUser = users.find(u => u.rootAdmin) || users[0];
  adminUser.twoFactorEnabled = !adminUser.twoFactorEnabled;
  saveJSON('users.json', users);

  logActivity({ event: 'account:2fa.toggle', description: `${adminUser.twoFactorEnabled ? 'Enabled' : 'Disabled'} two-factor authentication` });
  res.json({ twoFactorEnabled: adminUser.twoFactorEnabled });
});

// SSH Keys
app.get('/api/account/ssh-keys', (req, res) => {
  const adminUser = users.find(u => u.rootAdmin) || users[0];
  res.json(adminUser.sshKeys || []);
});

app.post('/api/account/ssh-keys', (req, res) => {
  const adminUser = users.find(u => u.rootAdmin) || users[0];
  const { name, publicKey } = req.body;
  if (!name || !publicKey) return res.status(400).json({ error: 'Key name and public key required' });

  const newKey = {
    id: `ssh-${Date.now().toString(36)}`,
    name,
    fingerprint: `SHA256:${Math.random().toString(36).substring(2, 8)}...${Math.random().toString(36).substring(2, 6)}`,
    publicKey,
    createdAt: new Date().toISOString()
  };

  adminUser.sshKeys = adminUser.sshKeys || [];
  adminUser.sshKeys.push(newKey);
  saveJSON('users.json', users);
  logActivity({ event: 'account:ssh_key.create', description: `Added public SSH key: ${name}` });
  res.status(201).json(newKey);
});

app.delete('/api/account/ssh-keys/:keyId', (req, res) => {
  const adminUser = users.find(u => u.rootAdmin) || users[0];
  adminUser.sshKeys = (adminUser.sshKeys || []).filter(k => k.id !== req.params.keyId);
  saveJSON('users.json', users);
  res.json({ success: true });
});

// Wildcard fallback for SPA routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Export Express app for Vercel Serverless Function
module.exports = app;

// CLI Host Auto-Configuration execution
if (process.argv.includes('--configure-host') || process.argv.includes('--setup')) {
  function getCliArg(flag, fallback) {
    const idx = process.argv.indexOf(flag);
    if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
    return fallback;
  }
  const result = configureHostNode({
    ip: getCliArg('--ip', '127.0.0.1'),
    name: getCliArg('--name', 'Local VPS Node (Core)'),
    location: getCliArg('--location', 'Local VPS / Datacenter'),
    locCode: getCliArg('--loc-code', 'local'),
    ram: getCliArg('--ram', '32768'),
    disk: getCliArg('--disk', '1024000'),
    wingsPort: getCliArg('--wings-port', '8080'),
    sftpPort: getCliArg('--sftp-port', '2022'),
    panelPort: getCliArg('--port', '3000')
  });
  console.log(`====================================================`);
  console.log(`   ✔ SMOOTH x HOST - HOST NODE AUTO-CONFIGURED      `);
  console.log(`   Location : ${result.location.long} [${result.location.short}]`);
  console.log(`   Node ID  : ${result.node.id} (${result.node.fqdn})`);
  console.log(`   Memory   : ${result.node.memoryTotal} MB | Disk: ${result.node.diskTotal} MB`);
  console.log(`   Ports    : ${result.allocationsCount} allocations initialized`);
  console.log(`   Token    : ${result.node.token}`);
  console.log(`====================================================`);
  process.exit(0);
}

// Start standalone HTTP & WebSocket server only when run directly (local / VPS)
if (!IS_VERCEL && require.main === module) {
  server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`   🚀 SMOOTH x HOST - PTERODACTYL STYLE PANEL       `);
    console.log(`   Running on http://localhost:${PORT}             `);
    console.log(`   WebSocket live on ws://localhost:${PORT}/ws      `);
    console.log(`====================================================`);
  });
}
