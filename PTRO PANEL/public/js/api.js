/**
 * SMOOTH x HOST - API & Real-Time Sync Client
 * Full Pterodactyl-Compatible API Service
 */

class ApiService {
  constructor() {
    this.ws = null;
    this.wsSubscribers = new Set();
    this.pollingTimers = new Map();
    this.isPollingMode = false;
    this.eventListeners = {
      console: [],
      stats: [],
      status: [],
      backlog: []
    };
    this.initSync();
  }

  // Event dispatcher
  on(event, callback) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].push(callback);
    }
  }

  emit(event, data) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].forEach(cb => {
        try { cb(data); } catch (e) { console.error('Listener error:', e); }
      });
    }
  }

  // REST API Client
  async request(endpoint, options = {}) {
    const url = `/api${endpoint}`;
    try {
      const res = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        },
        ...options
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${res.status}: ${res.statusText}`);
      }
      return await res.json();
    } catch (err) {
      console.error(`API Error on ${url}:`, err);
      throw err;
    }
  }

  // System
  getSystem() { return this.request('/system'); }

  // Nodes
  getNodes() { return this.request('/nodes'); }
  createNode(data) { return this.request('/nodes', { method: 'POST', body: JSON.stringify(data) }); }
  updateNode(id, data) { return this.request(`/nodes/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
  deleteNode(id) { return this.request(`/nodes/${id}`, { method: 'DELETE' }); }
  getNodeDeployCommand(id) { return this.request(`/nodes/${id}/deploy-command`); }
  getNodeConfig(id) { return this.request(`/nodes/${id}/configuration`); }
  getNodeAllocations(id) { return this.request(`/nodes/${id}/allocations`); }
  createNodeAllocations(id, data) { return this.request(`/nodes/${id}/allocations`, { method: 'POST', body: JSON.stringify(data) }); }

  // Eggs & Nests
  getEggs() { return this.request('/eggs'); }
  createEgg(data) { return this.request('/eggs', { method: 'POST', body: JSON.stringify(data) }); }
  updateEgg(id, data) { return this.request(`/eggs/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
  deleteEgg(id) { return this.request(`/eggs/${id}`, { method: 'DELETE' }); }
  importEgg(data) { return this.request('/eggs/import', { method: 'POST', body: JSON.stringify(data) }); }
  exportEgg(id) { return this.request(`/eggs/${id}/export`); }

  // Servers
  getServers() { return this.request('/servers'); }
  getServer(id) { return this.request(`/servers/${id}`); }
  getServerLive(id) { return this.request(`/servers/${id}/live`); }
  createServer(data) { return this.request('/servers', { method: 'POST', body: JSON.stringify(data) }); }
  deleteServer(id) { return this.request(`/servers/${id}`, { method: 'DELETE' }); }
  
  // Power & Console
  sendPowerAction(id, action) {
    return this.request(`/servers/${id}/power`, { method: 'POST', body: JSON.stringify({ action }) });
  }

  sendCommand(id, command) {
    return this.request(`/servers/${id}/command`, { method: 'POST', body: JSON.stringify({ command }) });
  }

  // File Manager
  listFiles(id, path = '/') {
    return this.request(`/servers/${id}/files?path=${encodeURIComponent(path)}`);
  }

  getFileContent(id, path) {
    return this.request(`/servers/${id}/files/content?path=${encodeURIComponent(path)}`);
  }

  saveFileContent(id, path, content) {
    return this.request(`/servers/${id}/files/content`, {
      method: 'POST',
      body: JSON.stringify({ path, content })
    });
  }

  createFileOrFolder(id, path, name, isDirectory) {
    return this.request(`/servers/${id}/files/create`, {
      method: 'POST',
      body: JSON.stringify({ path, name, isDirectory })
    });
  }

  deleteFile(id, path) {
    return this.request(`/servers/${id}/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
  }

  uploadFile(id, path, filename, content, isBase64 = false) {
    return this.request(`/servers/${id}/files/upload`, {
      method: 'POST',
      body: JSON.stringify({ path, filename, content, isBase64 })
    });
  }

  renameFile(id, from, to) {
    return this.request(`/servers/${id}/files/rename`, {
      method: 'POST',
      body: JSON.stringify({ from, to })
    });
  }

  copyFile(id, path) {
    return this.request(`/servers/${id}/files/copy`, {
      method: 'POST',
      body: JSON.stringify({ path })
    });
  }

  compressFiles(id, root, files) {
    return this.request(`/servers/${id}/files/compress`, {
      method: 'POST',
      body: JSON.stringify({ root, files })
    });
  }

  decompressFile(id, path) {
    return this.request(`/servers/${id}/files/decompress`, {
      method: 'POST',
      body: JSON.stringify({ path })
    });
  }

  chmodFile(id, path, mode) {
    return this.request(`/servers/${id}/files/chmod`, {
      method: 'POST',
      body: JSON.stringify({ path, mode })
    });
  }

  massDeleteFiles(id, paths) {
    return this.request(`/servers/${id}/files/mass-delete`, {
      method: 'POST',
      body: JSON.stringify({ paths })
    });
  }

  // Databases
  getDatabases(id) { return this.request(`/servers/${id}/databases`); }
  createDatabase(id, name, allowedHosts = '%') {
    return this.request(`/servers/${id}/databases`, { method: 'POST', body: JSON.stringify({ name, allowedHosts }) });
  }
  rotateDatabasePassword(id, dbId) {
    return this.request(`/servers/${id}/databases/${dbId}/rotate-password`, { method: 'POST' });
  }
  deleteDatabase(id, dbId) {
    return this.request(`/servers/${id}/databases/${dbId}`, { method: 'DELETE' });
  }

  // Backups
  getBackups(id) { return this.request(`/servers/${id}/backups`); }
  createBackup(id, name, isLocked = false, ignoredFiles = '') {
    return this.request(`/servers/${id}/backups`, { method: 'POST', body: JSON.stringify({ name, isLocked, ignoredFiles }) });
  }
  lockBackup(id, backupId) {
    return this.request(`/servers/${id}/backups/${backupId}/lock`, { method: 'POST' });
  }
  restoreBackup(id, backupId) {
    return this.request(`/servers/${id}/backups/${backupId}/restore`, { method: 'POST' });
  }
  deleteBackup(id, backupId) {
    return this.request(`/servers/${id}/backups/${backupId}`, { method: 'DELETE' });
  }

  // Schedules
  getSchedules(id) { return this.request(`/servers/${id}/schedules`); }
  createSchedule(id, name, cron, tasks = []) {
    return this.request(`/servers/${id}/schedules`, { method: 'POST', body: JSON.stringify({ name, cron, tasks }) });
  }
  toggleSchedule(id, schedId) {
    return this.request(`/servers/${id}/schedules/${schedId}/toggle`, { method: 'POST' });
  }
  triggerSchedule(id, schedId) {
    return this.request(`/servers/${id}/schedules/${schedId}/trigger`, { method: 'POST' });
  }
  deleteSchedule(id, schedId) {
    return this.request(`/servers/${id}/schedules/${schedId}`, { method: 'DELETE' });
  }

  // Sub-Users
  getUsers(id) { return this.request(`/servers/${id}/users`); }
  inviteUser(id, email, permissions) {
    return this.request(`/servers/${id}/users`, { method: 'POST', body: JSON.stringify({ email, permissions }) });
  }
  updateUserPermissions(id, userId, permissions, role) {
    return this.request(`/servers/${id}/users/${userId}`, { method: 'PUT', body: JSON.stringify({ permissions, role }) });
  }
  deleteUser(id, userId) {
    return this.request(`/servers/${id}/users/${userId}`, { method: 'DELETE' });
  }

  // Network & Allocations
  getServerNetwork(id) { return this.request(`/servers/${id}/network`); }
  assignServerNetwork(id) { return this.request(`/servers/${id}/network/assign`, { method: 'POST' }); }
  setPrimaryNetwork(id, allocationId) {
    return this.request(`/servers/${id}/network/primary`, { method: 'POST', body: JSON.stringify({ allocationId }) });
  }
  updateNetworkNotes(id, allocationId, notes) {
    return this.request(`/servers/${id}/network/notes`, { method: 'POST', body: JSON.stringify({ allocationId, notes }) });
  }
  deleteServerNetwork(id, allocId) {
    return this.request(`/servers/${id}/network/${allocId}`, { method: 'DELETE' });
  }

  // Settings & Lifecycle
  updateSettings(id, data) {
    return this.request(`/servers/${id}/settings`, { method: 'POST', body: JSON.stringify(data) });
  }
  transferServer(id, targetNodeId) {
    return this.request(`/servers/${id}/transfer`, { method: 'POST', body: JSON.stringify({ targetNodeId }) });
  }
  reinstallServer(id) {
    return this.request(`/servers/${id}/reinstall`, { method: 'POST' });
  }

  // Admin Controls
  updateServerBuild(id, data) {
    return this.request(`/admin/servers/${id}/build`, { method: 'POST', body: JSON.stringify(data) });
  }
  toggleServerSuspension(id) {
    return this.request(`/admin/servers/${id}/suspend`, { method: 'POST' });
  }

  // Admin Users
  getAdminUsers() { return this.request('/admin/users'); }
  createAdminUser(data) { return this.request('/admin/users', { method: 'POST', body: JSON.stringify(data) }); }
  updateAdminUser(id, data) { return this.request(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
  deleteAdminUser(id) { return this.request(`/admin/users/${id}`, { method: 'DELETE' }); }

  // API Keys
  getApplicationApiKeys() { return this.request('/admin/api-keys'); }
  createApplicationApiKey(data) { return this.request('/admin/api-keys', { method: 'POST', body: JSON.stringify(data) }); }
  deleteApplicationApiKey(id) { return this.request(`/admin/api-keys/${id}`, { method: 'DELETE' }); }

  getClientApiKeys() { return this.request('/account/api-keys'); }
  createClientApiKey(data) { return this.request('/account/api-keys', { method: 'POST', body: JSON.stringify(data) }); }
  deleteClientApiKey(id) { return this.request(`/account/api-keys/${id}`, { method: 'DELETE' }); }

  // Activity
  getActivity(serverId = null) {
    return this.request(serverId ? `/servers/${serverId}/activity` : '/activity');
  }

  // Account
  getAccount() { return this.request('/account'); }
  updateAccount(data) { return this.request('/account', { method: 'POST', body: JSON.stringify(data) }); }
  updatePassword(data) { return this.request('/account/password', { method: 'POST', body: JSON.stringify(data) }); }
  generate2FA() { return this.request('/account/2fa/generate', { method: 'POST' }); }
  verify2FA(code) { return this.request('/account/2fa/verify', { method: 'POST', body: JSON.stringify({ code }) }); }
  getSshKeys() { return this.request('/account/ssh-keys'); }
  addSshKey(data) { return this.request('/account/ssh-keys', { method: 'POST', body: JSON.stringify(data) }); }
  deleteSshKey(id) { return this.request(`/account/ssh-keys/${id}`, { method: 'DELETE' }); }

  // Dual-mode Sync: WebSocket with seamless Serverless Polling Fallback
  initSync() {
    const isVercelHost = window.location.hostname.endsWith('vercel.app') || window.location.hostname.includes('vercel');

    if (isVercelHost) {
      this.enablePollingMode('Wings Online (Cloud Edge)');
      return;
    }

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.wsSubscribers.forEach(serverId => {
          this.ws.send(JSON.stringify({ type: 'subscribe', serverId }));
        });
        const statusEl = document.getElementById('ws-status-text');
        if (statusEl) statusEl.textContent = 'Wings Online';
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'console') {
            this.emit('console', data);
          } else if (data.type === 'stats') {
            this.emit('stats', data);
          } else if (data.type === 'status') {
            this.emit('status', data);
          } else if (data.type === 'log_backlog') {
            this.emit('backlog', data);
          }
        } catch (e) {}
      };

      this.ws.onerror = () => {
        this.enablePollingMode('Wings Online (HTTP Edge)');
      };

      this.ws.onclose = () => {
        if (!this.isPollingMode) {
          setTimeout(() => this.initSync(), 3000);
        }
      };
    } catch (e) {
      this.enablePollingMode('Wings Online (Fallback)');
    }
  }

  enablePollingMode(statusLabel = 'Wings Online (Edge)') {
    if (this.isPollingMode) return;
    this.isPollingMode = true;
    const statusEl = document.getElementById('ws-status-text');
    if (statusEl) statusEl.textContent = statusLabel;

    this.wsSubscribers.forEach(serverId => {
      this.startPolling(serverId);
    });
  }

  startPolling(serverId) {
    if (this.pollingTimers.has(serverId)) return;

    let initialBacklogLoaded = false;
    const poll = async () => {
      try {
        const liveData = await this.getServerLive(serverId);
        this.emit('status', { serverId, status: liveData.status, isSuspended: liveData.isSuspended, uptime: liveData.uptime });
        this.emit('stats', { serverId, stats: liveData.stats, uptime: liveData.uptime });

        if (!initialBacklogLoaded && liveData.logs) {
          this.emit('backlog', { serverId, logs: liveData.logs });
          initialBacklogLoaded = true;
        }
      } catch (err) {}
    };

    poll();
    const timerId = setInterval(poll, 1200);
    this.pollingTimers.set(serverId, timerId);
  }

  stopPolling(serverId) {
    if (this.pollingTimers.has(serverId)) {
      clearInterval(this.pollingTimers.get(serverId));
      this.pollingTimers.delete(serverId);
    }
  }

  subscribeServer(serverId) {
    this.wsSubscribers.add(serverId);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'subscribe', serverId }));
    }
    if (this.isPollingMode) {
      this.startPolling(serverId);
    }
  }

  unsubscribeServer(serverId) {
    this.wsSubscribers.delete(serverId);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'unsubscribe', serverId }));
    }
    this.stopPolling(serverId);
  }
}

window.api = new ApiService();
