/**
 * SMOOTH x HOST - Core Frontend Controller
 * Complete Pterodactyl-Compatible Enterprise Engine
 */

class SmoothHostApp {
  constructor() {
    this.currentView = 'servers'; // 'servers' | 'server-detail' | 'admin' | 'account' | 'activity'
    this.activeServerId = null;
    this.activeTab = 'console';
    this.adminSubTab = 'overview';
    this.accountSubTab = 'profile';
    this.servers = [];
    this.nodes = [];
    this.eggs = [];
    this.system = null;
    this.currentPath = '/';
    this.selectedFiles = new Set();
    this.commandHistory = [];
    this.historyIndex = -1;
    this.charts = {};
    this.terminal = null;
    this.filter = 'all';
    this.searchQuery = '';
    this.soundEnabled = localStorage.getItem('sh_sound_enabled') !== 'false';
    this.audioCtx = null;
    this.accountUser = null;

    this.init();
  }

  async init() {
    this.bindGlobalEvents();
    await this.loadInitialData();
    this.updateSoundUI();
    this.handleRoute();
    window.addEventListener('hashchange', () => this.handleRoute());

    // Listen to WebSocket broadcasts
    window.api.on('stats', (data) => this.onServerStats(data));
    window.api.on('console', (data) => this.onServerConsole(data));
    window.api.on('status', (data) => this.onServerStatus(data));
    window.api.on('backlog', (data) => this.onServerBacklog(data));
  }

  // Audio SFX synthesis
  playSound(type = 'click') {
    if (!this.soundEnabled) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!this.audioCtx) this.audioCtx = new AudioContext();
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      const now = this.audioCtx.currentTime;

      if (type === 'click') {
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.05);
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
      } else if (type === 'power') {
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === 'notify') {
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.setValueAtTime(880, now + 0.08);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.18);
      }
    } catch (e) {}
  }

  toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    localStorage.setItem('sh_sound_enabled', this.soundEnabled ? 'true' : 'false');
    this.updateSoundUI();
    if (this.soundEnabled) this.playSound('notify');
    this.showToast(`Sound effects ${this.soundEnabled ? 'Enabled' : 'Muted'}`, 'info');
  }

  updateSoundUI() {
    const icon = document.getElementById('sound-toggle-icon');
    const menuState = document.getElementById('menu-sound-state');
    if (icon) {
      icon.className = this.soundEnabled ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark';
      icon.style.color = this.soundEnabled ? 'var(--brand-cyan)' : 'var(--text-dim)';
    }
    if (menuState) {
      menuState.textContent = this.soundEnabled ? 'ON' : 'OFF';
      menuState.style.color = this.soundEnabled ? 'var(--brand-cyan)' : 'var(--text-dim)';
    }
  }

  // Toast System
  showToast(message, type = 'info') {
    this.playSound('notify');
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = {
      success: 'fa-circle-check',
      info: 'fa-circle-info',
      error: 'fa-circle-xmark',
      warn: 'fa-triangle-exclamation'
    };

    toast.innerHTML = `
      <i class="fa-solid ${icons[type] || 'fa-bell'}" style="font-size: 1.1rem;"></i>
      <div style="flex:1;">${this.escapeHtml(message)}</div>
      <i class="fa-solid fa-xmark" style="cursor:pointer; opacity:0.6;" onclick="this.parentElement.remove()"></i>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 4000);
  }

  async loadInitialData() {
    try {
      const [system, servers, nodes, eggs, account] = await Promise.all([
        window.api.getSystem(),
        window.api.getServers(),
        window.api.getNodes(),
        window.api.getEggs(),
        window.api.getAccount().catch(() => null)
      ]);
      this.system = system;
      this.servers = servers;
      this.nodes = nodes;
      this.eggs = eggs;
      this.accountUser = account;

      if (account) {
        const navEmail = document.getElementById('nav-user-email');
        const navAvatar = document.getElementById('nav-user-avatar');
        const dropName = document.getElementById('dropdown-user-name');
        const dropEmail = document.getElementById('dropdown-user-email');
        if (navEmail) navEmail.textContent = account.email;
        if (navAvatar) navAvatar.textContent = account.avatar || 'AD';
        if (dropName) dropName.textContent = `${account.firstName} ${account.lastName}`.trim() || account.username;
        if (dropEmail) dropEmail.textContent = account.email;
      }

      this.renderClusterMetrics();
    } catch (err) {
      this.showToast('Failed to connect to host backend', 'error');
    }
  }

  // Global Keybindings & Navigation Events
  bindGlobalEvents() {
    // Quick Command Palette (Ctrl+K or Cmd+K)
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.openCommandPalette();
      }
      if (e.key === 'Escape') {
        this.closeModals();
        this.closeDropdownMenu();
      }
    });

    // Close dropdown on outside click
    window.addEventListener('click', (e) => {
      const wrapper = document.querySelector('.user-profile-wrapper');
      if (wrapper && !wrapper.contains(e.target)) {
        this.closeDropdownMenu();
      }
    });

    // Nav Links
    document.getElementById('nav-brand')?.addEventListener('click', () => this.navigate('#servers'));
    document.getElementById('nav-servers')?.addEventListener('click', () => this.navigate('#servers'));
    document.getElementById('nav-admin')?.addEventListener('click', () => this.navigate('#admin'));
    document.getElementById('nav-activity')?.addEventListener('click', () => this.navigate('#activity'));
    document.getElementById('search-palette-btn')?.addEventListener('click', () => this.openCommandPalette());
    document.getElementById('sound-toggle-btn')?.addEventListener('click', () => this.toggleSound());

    // User profile menu trigger
    const menuTrigger = document.getElementById('user-menu-trigger');
    if (menuTrigger) {
      menuTrigger.onclick = (e) => {
        e.stopPropagation();
        this.toggleDropdownMenu();
      };
    }

    document.getElementById('menu-opt-sound')?.addEventListener('click', () => this.toggleSound());
  }

  toggleDropdownMenu() {
    const menu = document.getElementById('user-dropdown-menu');
    if (menu) menu.classList.toggle('show');
  }

  closeDropdownMenu() {
    const menu = document.getElementById('user-dropdown-menu');
    if (menu) menu.classList.remove('show');
  }

  navigate(hash) {
    this.playSound('click');
    this.closeDropdownMenu();
    window.location.hash = hash;
  }

  // Main Hash Router
  async handleRoute() {
    const hash = window.location.hash || '#servers';
    const parts = hash.replace(/^#\/?/, '').split('/');
    const route = parts[0] || 'servers';

    // Update active nav button
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

    if (route === 'servers') {
      this.currentView = 'servers';
      if (this.activeServerId) {
        window.api.unsubscribeServer(this.activeServerId);
        this.activeServerId = null;
      }
      document.getElementById('nav-servers')?.classList.add('active');
      await this.refreshServersList();
      this.renderServersView();
    } else if (route === 'server') {
      this.currentView = 'server-detail';
      const serverId = parts[1];
      const tab = parts[2] || 'console';
      document.getElementById('nav-servers')?.classList.add('active');
      await this.openServerDetail(serverId, tab);
    } else if (route === 'admin') {
      this.currentView = 'admin';
      this.adminSubTab = parts[1] || 'overview';
      if (this.activeServerId) {
        window.api.unsubscribeServer(this.activeServerId);
        this.activeServerId = null;
      }
      document.getElementById('nav-admin')?.classList.add('active');
      await this.renderAdminView();
    } else if (route === 'account') {
      this.currentView = 'account';
      this.accountSubTab = parts[1] || 'profile';
      if (this.activeServerId) {
        window.api.unsubscribeServer(this.activeServerId);
        this.activeServerId = null;
      }
      await this.renderAccountView();
    } else if (route === 'activity') {
      this.currentView = 'activity';
      if (this.activeServerId) {
        window.api.unsubscribeServer(this.activeServerId);
        this.activeServerId = null;
      }
      document.getElementById('nav-activity')?.classList.add('active');
      await this.renderGlobalActivityView();
    }
  }

  // ======================== DASHBOARD VIEW ======================== //

  async refreshServersList() {
    try {
      this.servers = await window.api.getServers();
      this.system = await window.api.getSystem();
      this.nodes = await window.api.getNodes();
      this.eggs = await window.api.getEggs();
      this.renderClusterMetrics();
    } catch (e) {}
  }

  renderClusterMetrics() {
    const el = document.getElementById('cluster-metrics-container');
    if (!el || !this.system) return;

    const running = this.servers.filter(s => s.status === 'running').length;
    const totalMemGB = (this.servers.reduce((a, s) => a + s.limits.memory, 0) / 1024).toFixed(1);
    const usedMemGB = (this.servers.reduce((a, s) => a + (s.status === 'running' ? s.stats.memory : 0), 0) / 1024).toFixed(1);
    const totalDiskGB = (this.servers.reduce((a, s) => a + s.limits.disk, 0) / 1024).toFixed(1);

    el.innerHTML = `
      <div class="metrics-ribbon">
        <div class="metric-card">
          <div class="metric-icon-box cyan"><i class="fa-solid fa-server"></i></div>
          <div class="metric-data">
            <span class="metric-label">Active Instances</span>
            <span class="metric-value">${running} <span style="font-size: 0.9rem; color: var(--text-dim); font-weight:400;">/ ${this.servers.length}</span></span>
            <span class="metric-sub">${this.nodes.length} Wings Nodes Connected</span>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon-box green"><i class="fa-solid fa-microchip"></i></div>
          <div class="metric-data">
            <span class="metric-label">Memory Allocation</span>
            <span class="metric-value">${usedMemGB} <span style="font-size: 0.9rem; color: var(--text-dim); font-weight:400;">/ ${totalMemGB} GB</span></span>
            <span class="metric-sub">Dedicated ECC DDR5</span>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon-box purple"><i class="fa-solid fa-hard-drive"></i></div>
          <div class="metric-data">
            <span class="metric-label">NVMe Storage</span>
            <span class="metric-value">${totalDiskGB} GB</span>
            <span class="metric-sub">Enterprise Gen4 Arrays</span>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon-box amber"><i class="fa-solid fa-network-wired"></i></div>
          <div class="metric-data">
            <span class="metric-label">Network Throughput</span>
            <span class="metric-value">10 Gbps</span>
            <span class="metric-sub">DDoS Protected Anycast</span>
          </div>
        </div>
      </div>
    `;
  }

  renderServersView() {
    const mainView = document.getElementById('main-content-view');
    if (!mainView) return;

    let filtered = this.servers.filter(s => {
      if (this.filter === 'running' && s.status !== 'running') return false;
      if (this.filter === 'offline' && s.status !== 'offline') return false;
      if (this.filter === 'minecraft' && s.eggId !== 'minecraft-paper') return false;
      if (this.filter === 'nodejs' && s.eggId !== 'nodejs-app') return false;
      if (this.filter === 'games' && !['rust-dedicated', 'fivem-server', 'source-csgo'].includes(s.eggId)) return false;

      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        return s.name.toLowerCase().includes(q) ||
               (s.allocation && s.allocation.alias && s.allocation.alias.toLowerCase().includes(q)) ||
               s.id.toLowerCase().includes(q);
      }
      return true;
    });

    mainView.innerHTML = `
      <div id="cluster-metrics-container"></div>

      <div class="dashboard-toolbar">
        <div class="search-filter-group">
          <div class="input-search-box">
            <i class="fa-solid fa-magnifying-glass" style="color: var(--text-dim);"></i>
            <input type="text" id="server-search-input" placeholder="Search servers by name, ID, or IP..." value="${this.escapeHtml(this.searchQuery)}">
          </div>

          <div class="filter-pills">
            <button class="filter-pill ${this.filter === 'all' ? 'active' : ''}" data-filter="all">All</button>
            <button class="filter-pill ${this.filter === 'running' ? 'active' : ''}" data-filter="running">Running</button>
            <button class="filter-pill ${this.filter === 'offline' ? 'active' : ''}" data-filter="offline">Offline</button>
            <button class="filter-pill ${this.filter === 'minecraft' ? 'active' : ''}" data-filter="minecraft">Minecraft</button>
            <button class="filter-pill ${this.filter === 'nodejs' ? 'active' : ''}" data-filter="nodejs">Node.js</button>
            <button class="filter-pill ${this.filter === 'games' ? 'active' : ''}" data-filter="games">Games</button>
          </div>
        </div>

        <button class="btn-primary" id="btn-deploy-server">
          <i class="fa-solid fa-plus"></i> Deploy Server
        </button>
      </div>

      <div class="servers-grid" id="servers-grid-container">
        ${filtered.map(server => this.renderServerCardHTML(server)).join('')}
      </div>

      ${filtered.length === 0 ? `
        <div style="text-align:center; padding: 4rem 1rem; color: var(--text-dim);">
          <i class="fa-solid fa-cubes-stacked" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.4;"></i>
          <h3 style="color: var(--text-muted); margin-bottom: 0.5rem;">No servers match your filter</h3>
          <p style="font-size: 0.88rem;">Try clearing your search query or click "Deploy Server" to create one.</p>
        </div>
      ` : ''}
    `;

    this.renderClusterMetrics();

    // Attach search input handler
    const searchInput = document.getElementById('server-search-input');
    if (searchInput) {
      searchInput.oninput = (e) => {
        this.searchQuery = e.target.value;
        this.renderServersView();
        const newInp = document.getElementById('server-search-input');
        if (newInp) {
          newInp.focus();
          newInp.selectionStart = newInp.selectionEnd = newInp.value.length;
        }
      };
    }

    // Attach filter clicks
    document.querySelectorAll('.filter-pill').forEach(btn => {
      btn.onclick = () => {
        this.playSound('click');
        this.filter = btn.getAttribute('data-filter');
        this.renderServersView();
      };
    });

    // Deploy Server button
    document.getElementById('btn-deploy-server')?.addEventListener('click', () => this.openCreateServerModal());

    // Attach card power actions & card clicks
    document.querySelectorAll('.server-card').forEach(card => {
      const serverId = card.getAttribute('data-id');
      card.onclick = (e) => {
        if (e.target.closest('.card-power-footer') || e.target.closest('.copy-icon-btn')) return;
        this.navigate(`#server/${serverId}/console`);
      };
    });

    document.querySelectorAll('.copy-icon-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const text = btn.getAttribute('data-copy');
        navigator.clipboard.writeText(text);
        this.showToast(`Copied to clipboard: ${text}`, 'success');
      };
    });

    document.querySelectorAll('.power-btn-mini').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const sId = btn.getAttribute('data-id');
        const action = btn.getAttribute('data-action');
        await this.triggerPowerAction(sId, action);
      };
    });
  }

  renderServerCardHTML(s) {
    const egg = this.eggs.find(e => e.id === s.eggId) || { name: 'Custom Egg', icon: 'fa-cube', color: '#00e5ff' };
    const node = this.nodes.find(n => n.id === s.nodeId) || { name: 'Default Node' };

    const cpuPct = Math.min(100, Math.round((s.stats.cpu / (s.limits.cpu || 100)) * 100)) || 0;
    const memPct = Math.min(100, Math.round((s.stats.memory / s.limits.memory) * 100)) || 0;
    const diskPct = Math.min(100, Math.round((s.stats.disk / s.limits.disk) * 100)) || 0;

    return `
      <div class="server-card ${s.isSuspended ? 'suspended' : ''}" data-id="${s.id}">
        <div>
          <div class="card-top">
            <div class="egg-icon-pill" style="color: ${egg.color}; border-color: ${egg.color}33;">
              <i class="fa-solid ${egg.icon}"></i>
            </div>
            <div class="server-meta">
              <h3 class="server-title" title="${this.escapeHtml(s.name)}">${this.escapeHtml(s.name)}</h3>
              <p class="server-subdesc">${egg.name} &bull; ${s.uuid.substring(0, 8)}</p>
            </div>
            <div class="status-badge ${s.isSuspended ? 'offline' : s.status}">
              <div class="status-dot-indicator"></div>
              <span>${s.isSuspended ? 'SUSPENDED' : s.status}</span>
            </div>
          </div>

          <div class="server-address-box">
            <span><i class="fa-solid fa-network-wired" style="margin-right: 6px; opacity:0.6;"></i>${s.allocation ? s.allocation.alias : 'No IP'}</span>
            <button class="copy-icon-btn" data-copy="${s.allocation ? s.allocation.alias : ''}" title="Copy Address">
              <i class="fa-regular fa-copy"></i>
            </button>
          </div>

          <div class="resource-meters">
            <div class="meter-row">
              <div class="meter-header">
                <span class="meter-title"><i class="fa-solid fa-microchip"></i> CPU Usage</span>
                <span class="meter-value-txt" id="card-cpu-${s.id}">${s.stats.cpu}% / ${s.limits.cpu}%</span>
              </div>
              <div class="progress-track">
                <div class="progress-fill cyan" id="card-cpubar-${s.id}" style="width: ${cpuPct}%;"></div>
              </div>
            </div>

            <div class="meter-row">
              <div class="meter-header">
                <span class="meter-title"><i class="fa-solid fa-memory"></i> Memory</span>
                <span class="meter-value-txt" id="card-mem-${s.id}">${s.stats.memory} MB / ${s.limits.memory} MB</span>
              </div>
              <div class="progress-track">
                <div class="progress-fill purple" id="card-membar-${s.id}" style="width: ${memPct}%;"></div>
              </div>
            </div>

            <div class="meter-row">
              <div class="meter-header">
                <span class="meter-title"><i class="fa-solid fa-hard-drive"></i> Disk</span>
                <span class="meter-value-txt">${s.stats.disk} MB / ${s.limits.disk} MB</span>
              </div>
              <div class="progress-track">
                <div class="progress-fill amber" style="width: ${diskPct}%;"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="card-power-footer">
          <div class="node-label">
            <i class="fa-solid fa-location-dot"></i> ${node.name}
          </div>
          <div class="power-quick-actions">
            <button class="power-btn-mini start" data-id="${s.id}" data-action="start" title="Start" ${s.isSuspended ? 'disabled style="opacity:0.4;"' : ''}>
              <i class="fa-solid fa-play"></i>
            </button>
            <button class="power-btn-mini restart" data-id="${s.id}" data-action="restart" title="Restart" ${s.isSuspended ? 'disabled style="opacity:0.4;"' : ''}>
              <i class="fa-solid fa-rotate-right"></i>
            </button>
            <button class="power-btn-mini stop" data-id="${s.id}" data-action="stop" title="Stop" ${s.isSuspended ? 'disabled style="opacity:0.4;"' : ''}>
              <i class="fa-solid fa-stop"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // ======================== SERVER DETAIL VIEW ======================== //

  async openServerDetail(serverId, tab = 'console') {
    this.activeServerId = serverId;
    this.activeTab = tab;

    let server = this.servers.find(s => s.id === serverId);
    if (!server) {
      try {
        server = await window.api.getServer(serverId);
        this.servers.push(server);
      } catch (err) {
        this.showToast('Server not found', 'error');
        this.navigate('#servers');
        return;
      }
    }

    // Subscribe to live updates
    window.api.subscribeServer(serverId);

    this.renderServerDetailLayout(server);
    this.renderActiveTabContent(server);
  }

  renderServerDetailLayout(server) {
    const mainView = document.getElementById('main-content-view');
    if (!mainView) return;

    const egg = this.eggs.find(e => e.id === server.eggId) || { name: 'Server', icon: 'fa-cube', color: '#00e5ff' };
    const node = this.nodes.find(n => n.id === server.nodeId) || { name: 'Node' };

    mainView.innerHTML = `
      <div class="server-detail-header">
        <div class="server-hero-left">
          <div class="server-hero-avatar" style="color: ${egg.color}; border-color: ${egg.color}40;">
            <i class="fa-solid ${egg.icon}"></i>
          </div>
          <div class="server-hero-info">
            <div class="server-breadcrumbs">
              <a class="breadcrumb-link" href="#servers"><i class="fa-solid fa-arrow-left"></i> Servers</a>
              <span>/</span>
              <span>${this.escapeHtml(server.name)}</span>
            </div>
            <h1 class="server-hero-title">
              ${this.escapeHtml(server.name)}
              <span class="status-badge ${server.isSuspended ? 'offline' : server.status}" id="hero-status-badge">
                <span class="status-dot-indicator"></span>
                <span id="hero-status-text">${server.isSuspended ? 'SUSPENDED' : server.status}</span>
              </span>
            </h1>
            <div class="server-meta-tags">
              <span class="meta-tag"><i class="fa-solid fa-network-wired"></i> ${server.allocation ? server.allocation.alias : 'No IP'}</span>
              <span class="meta-tag"><i class="fa-solid fa-server"></i> ${node.name}</span>
              <span class="meta-tag"><i class="fa-solid fa-fingerprint"></i> ${server.uuid.substring(0, 8)}</span>
              <span class="meta-tag" id="hero-uptime-tag"><i class="fa-regular fa-clock"></i> Uptime: ${this.formatUptime(server.uptime)}</span>
            </div>
          </div>
        </div>

        <div class="master-power-controls">
          <button class="power-act-btn start" id="btn-hero-start" ${server.isSuspended ? 'disabled style="opacity:0.4;"' : ''}><i class="fa-solid fa-play"></i> Start</button>
          <button class="power-act-btn restart" id="btn-hero-restart" ${server.isSuspended ? 'disabled style="opacity:0.4;"' : ''}><i class="fa-solid fa-rotate-right"></i> Restart</button>
          <button class="power-act-btn stop" id="btn-hero-stop" ${server.isSuspended ? 'disabled style="opacity:0.4;"' : ''}><i class="fa-solid fa-stop"></i> Stop</button>
          <button class="power-act-btn kill" id="btn-hero-kill" ${server.isSuspended ? 'disabled style="opacity:0.4;"' : ''}><i class="fa-solid fa-bolt"></i> Kill</button>
        </div>
      </div>

      <!-- Sub Navigation Tabs -->
      <div class="sub-nav-tabs">
        <button class="sub-tab-btn ${this.activeTab === 'console' ? 'active' : ''}" data-tab="console"><i class="fa-solid fa-terminal"></i> Console</button>
        <button class="sub-tab-btn ${this.activeTab === 'files' ? 'active' : ''}" data-tab="files"><i class="fa-regular fa-folder-open"></i> File Manager</button>
        <button class="sub-tab-btn ${this.activeTab === 'databases' ? 'active' : ''}" data-tab="databases"><i class="fa-solid fa-database"></i> Databases</button>
        <button class="sub-tab-btn ${this.activeTab === 'schedules' ? 'active' : ''}" data-tab="schedules"><i class="fa-regular fa-calendar-check"></i> Schedules</button>
        <button class="sub-tab-btn ${this.activeTab === 'users' ? 'active' : ''}" data-tab="users"><i class="fa-solid fa-users"></i> Users</button>
        <button class="sub-tab-btn ${this.activeTab === 'backups' ? 'active' : ''}" data-tab="backups"><i class="fa-solid fa-box-archive"></i> Backups</button>
        <button class="sub-tab-btn ${this.activeTab === 'network' ? 'active' : ''}" data-tab="network"><i class="fa-solid fa-network-wired"></i> Network</button>
        <button class="sub-tab-btn ${this.activeTab === 'startup' ? 'active' : ''}" data-tab="startup"><i class="fa-solid fa-sliders"></i> Startup</button>
        <button class="sub-tab-btn ${this.activeTab === 'settings' ? 'active' : ''}" data-tab="settings"><i class="fa-solid fa-gear"></i> Settings</button>
        <button class="sub-tab-btn ${this.activeTab === 'activity' ? 'active' : ''}" data-tab="activity"><i class="fa-solid fa-clock-rotate-left"></i> Activity</button>
      </div>

      <div id="tab-content-area"></div>
    `;

    // Power handlers
    document.getElementById('btn-hero-start')?.addEventListener('click', () => this.triggerPowerAction(server.id, 'start'));
    document.getElementById('btn-hero-restart')?.addEventListener('click', () => this.triggerPowerAction(server.id, 'restart'));
    document.getElementById('btn-hero-stop')?.addEventListener('click', () => this.triggerPowerAction(server.id, 'stop'));
    document.getElementById('btn-hero-kill')?.addEventListener('click', () => this.triggerPowerAction(server.id, 'kill'));

    // Tab buttons
    document.querySelectorAll('.sub-tab-btn').forEach(btn => {
      btn.onclick = () => {
        const tab = btn.getAttribute('data-tab');
        this.navigate(`#server/${server.id}/${tab}`);
      };
    });
  }

  async renderActiveTabContent(server) {
    const tabArea = document.getElementById('tab-content-area');
    if (!tabArea) return;

    if (this.activeTab === 'console') {
      this.renderConsoleTab(tabArea, server);
    } else if (this.activeTab === 'files') {
      this.renderFileManagerTab(tabArea, server);
    } else if (this.activeTab === 'databases') {
      this.renderDatabasesTab(tabArea, server);
    } else if (this.activeTab === 'schedules') {
      this.renderSchedulesTab(tabArea, server);
    } else if (this.activeTab === 'users') {
      this.renderUsersTab(tabArea, server);
    } else if (this.activeTab === 'backups') {
      this.renderBackupsTab(tabArea, server);
    } else if (this.activeTab === 'network') {
      this.renderNetworkTab(tabArea, server);
    } else if (this.activeTab === 'startup') {
      this.renderStartupTab(tabArea, server);
    } else if (this.activeTab === 'settings') {
      this.renderSettingsTab(tabArea, server);
    } else if (this.activeTab === 'activity') {
      this.renderServerActivityTab(tabArea, server);
    }
  }

  // ======================== TAB: CONSOLE ======================== //

  renderConsoleTab(container, server) {
    container.innerHTML = `
      <div class="live-stats-row">
        <div class="live-stat-card">
          <div class="live-stat-top">
            <div>
              <div class="live-stat-title"><i class="fa-solid fa-microchip" style="color: var(--brand-cyan);"></i> CPU Usage</div>
              <div class="live-stat-num" id="stat-cpu-num">${server.stats.cpu}%</div>
            </div>
            <span class="live-stat-limit">Limit: ${server.limits.cpu}%</span>
          </div>
          <canvas class="sparkline-canvas" id="chart-cpu"></canvas>
        </div>

        <div class="live-stat-card">
          <div class="live-stat-top">
            <div>
              <div class="live-stat-title"><i class="fa-solid fa-memory" style="color: #a855f7;"></i> Memory</div>
              <div class="live-stat-num" id="stat-mem-num">${(server.stats.memory / 1024).toFixed(2)} GB</div>
            </div>
            <span class="live-stat-limit">Limit: ${(server.limits.memory / 1024).toFixed(2)} GB</span>
          </div>
          <canvas class="sparkline-canvas" id="chart-mem"></canvas>
        </div>

        <div class="live-stat-card">
          <div class="live-stat-top">
            <div>
              <div class="live-stat-title"><i class="fa-solid fa-hard-drive" style="color: #f59e0b;"></i> Disk Space</div>
              <div class="live-stat-num" id="stat-disk-num">${(server.stats.disk / 1024).toFixed(2)} GB</div>
            </div>
            <span class="live-stat-limit">Limit: ${(server.limits.disk / 1024).toFixed(2)} GB</span>
          </div>
          <canvas class="sparkline-canvas" id="chart-disk"></canvas>
        </div>

        <div class="live-stat-card">
          <div class="live-stat-top">
            <div>
              <div class="live-stat-title"><i class="fa-solid fa-arrow-down-up-lock" style="color: #10b981;"></i> Network I/O</div>
              <div class="live-stat-num" id="stat-net-num">${server.stats.netRx} KB/s</div>
            </div>
            <span class="live-stat-limit">TX: ${server.stats.netTx} KB/s</span>
          </div>
          <canvas class="sparkline-canvas" id="chart-net"></canvas>
        </div>
      </div>

      <div class="terminal-wrapper">
        <div class="terminal-header">
          <div class="terminal-title-left">
            <span class="term-dot red"></span>
            <span class="term-dot yellow"></span>
            <span class="term-dot green"></span>
            <span style="margin-left: 8px;"><i class="fa-solid fa-terminal"></i> container@wings:~# (SMOOTH x HOST Daemon)</span>
          </div>
          <div class="terminal-actions-right">
            <button class="term-btn" id="btn-term-clear" title="Clear output"><i class="fa-solid fa-trash-can"></i> Clear</button>
            <button class="term-btn" id="btn-term-scroll" title="Auto-scroll toggle"><i class="fa-solid fa-arrow-down"></i> Auto-Scroll</button>
            <button class="term-btn" id="btn-term-download" title="Download log file"><i class="fa-solid fa-download"></i> Download</button>
          </div>
        </div>

        <div class="terminal-output" id="terminal-screen"></div>

        <div class="terminal-command-bar">
          <span class="prompt-symbol">&gt;</span>
          <input type="text" class="command-input" id="terminal-cmd-input" placeholder="Type a command (e.g. help, tps, op Admin, say Hello, status, plugins)..." autocomplete="off" spellcheck="false" ${server.isSuspended ? 'disabled placeholder="Server is suspended"' : ''}>
          <button class="btn-primary" id="btn-send-cmd" style="padding: 6px 14px; font-size: 0.8rem;" ${server.isSuspended ? 'disabled' : ''}>
            <i class="fa-solid fa-paper-plane"></i> Send
          </button>
        </div>

        <div class="quick-commands-bar">
          <span style="font-size: 0.72rem; color: var(--text-dim); text-transform: uppercase; font-weight:600;">Quick:</span>
          <button class="quick-cmd-chip" data-cmd="help">/help</button>
          <button class="quick-cmd-chip" data-cmd="tps">/tps</button>
          <button class="quick-cmd-chip" data-cmd="status">/status</button>
          <button class="quick-cmd-chip" data-cmd="plugins">/plugins</button>
          <button class="quick-cmd-chip" data-cmd="say Server announcement from SMOOTH x HOST">/say Announcement</button>
          <button class="quick-cmd-chip" data-cmd="save-all">/save-all</button>
        </div>
      </div>
    `;

    // Charts
    this.charts.cpu = new LiveChart('chart-cpu', { color: '#00e5ff', fillColor: 'rgba(0, 229, 255, 0.15)', maxValue: server.limits.cpu });
    this.charts.mem = new LiveChart('chart-mem', { color: '#a855f7', fillColor: 'rgba(168, 85, 247, 0.15)', maxValue: server.limits.memory });
    this.charts.disk = new LiveChart('chart-disk', { color: '#f59e0b', fillColor: 'rgba(245, 158, 11, 0.15)', maxValue: server.limits.disk });
    this.charts.net = new LiveChart('chart-net', { color: '#10b981', fillColor: 'rgba(16, 185, 129, 0.15)', autoScale: true });

    // Terminal
    this.terminal = new TerminalManager('terminal-screen');

    document.getElementById('btn-term-clear').onclick = () => this.terminal.clear();
    document.getElementById('btn-term-download').onclick = () => this.terminal.downloadLogs(server.name);
    
    const scrollBtn = document.getElementById('btn-term-scroll');
    scrollBtn.onclick = () => {
      this.terminal.autoScroll = !this.terminal.autoScroll;
      scrollBtn.style.color = this.terminal.autoScroll ? 'var(--brand-cyan)' : 'var(--text-dim)';
      this.showToast(`Auto-scroll ${this.terminal.autoScroll ? 'enabled' : 'disabled'}`, 'info');
    };

    // Command Input
    const cmdInput = document.getElementById('terminal-cmd-input');
    const sendBtn = document.getElementById('btn-send-cmd');

    const executeCmd = async () => {
      const val = cmdInput.value.trim();
      if (!val) return;
      this.playSound('click');
      this.commandHistory.push(val);
      this.historyIndex = this.commandHistory.length;
      cmdInput.value = '';
      try {
        await window.api.sendCommand(server.id, val);
      } catch (err) {
        this.showToast(err.message, 'error');
      }
    };

    sendBtn.onclick = executeCmd;

    cmdInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        executeCmd();
      } else if (e.key === 'ArrowUp') {
        if (this.historyIndex > 0) {
          this.historyIndex--;
          cmdInput.value = this.commandHistory[this.historyIndex] || '';
        }
      } else if (e.key === 'ArrowDown') {
        if (this.historyIndex < this.commandHistory.length - 1) {
          this.historyIndex++;
          cmdInput.value = this.commandHistory[this.historyIndex] || '';
        } else {
          this.historyIndex = this.commandHistory.length;
          cmdInput.value = '';
        }
      }
    };

    // Quick Command chips
    document.querySelectorAll('.quick-cmd-chip').forEach(chip => {
      chip.onclick = () => {
        cmdInput.value = chip.getAttribute('data-cmd');
        cmdInput.focus();
      };
    });
  }

  // ======================== TAB: FILE MANAGER ======================== //

  async renderFileManagerTab(container, server) {
    this.selectedFiles.clear();

    container.innerHTML = `
      <div class="file-manager-container">
        <!-- Hidden input for file uploads -->
        <input type="file" id="file-upload-input" multiple style="display:none;">

        <div class="file-toolbar">
          <div class="file-breadcrumbs" id="file-crumbs-container"></div>
          <div class="file-actions-group">
            <button class="btn-primary" id="btn-upload-file"><i class="fa-solid fa-cloud-arrow-up"></i> Upload</button>
            <button class="btn-secondary" id="btn-new-file"><i class="fa-solid fa-file-circle-plus"></i> New File</button>
            <button class="btn-secondary" id="btn-new-folder"><i class="fa-solid fa-folder-plus"></i> New Folder</button>
            <button class="btn-secondary" id="btn-refresh-files"><i class="fa-solid fa-arrows-rotate"></i> Refresh</button>
          </div>
        </div>

        <div id="mass-action-container"></div>

        <div style="overflow-x: auto;">
          <table class="file-table">
            <thead>
              <tr>
                <th style="width: 4%; text-align: center;"><input type="checkbox" id="select-all-files-cb" title="Select All"></th>
                <th style="width: 44%;">Name</th>
                <th style="width: 12%;">Size</th>
                <th style="width: 10%;">Permissions</th>
                <th style="width: 18%;">Last Modified</th>
                <th style="width: 12%; text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody id="files-tbody">
              <tr><td colspan="6" style="text-align:center; padding: 2rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading directory contents...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('btn-new-file').onclick = () => this.openCreateFileModal(server);
    document.getElementById('btn-new-folder').onclick = () => this.openCreateFolderModal(server);
    document.getElementById('btn-refresh-files').onclick = () => this.loadDirectoryFiles(server, this.currentPath);

    // Upload triggers
    const uploadInput = document.getElementById('file-upload-input');
    document.getElementById('btn-upload-file').onclick = () => uploadInput.click();

    uploadInput.onchange = async (e) => {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;
      this.playSound('click');
      this.showToast(`Uploading ${files.length} file(s)...`, 'info');

      for (const file of files) {
        const reader = new FileReader();
        reader.onload = async () => {
          const content = reader.result;
          try {
            await window.api.uploadFile(server.id, this.currentPath, file.name, content, false);
            this.showToast(`Uploaded ${file.name}`, 'success');
            this.loadDirectoryFiles(server, this.currentPath);
          } catch (err) {
            this.showToast(`Failed to upload ${file.name}: ${err.message}`, 'error');
          }
        };
        reader.readAsText(file);
      }
      uploadInput.value = '';
    };

    // Select All Checkbox
    document.getElementById('select-all-files-cb').onchange = (e) => {
      const checked = e.target.checked;
      document.querySelectorAll('.file-row-cb').forEach(cb => {
        cb.checked = checked;
        const p = cb.getAttribute('data-path');
        if (checked) this.selectedFiles.add(p);
        else this.selectedFiles.delete(p);
      });
      this.updateMassActionBar(server);
    };

    await this.loadDirectoryFiles(server, this.currentPath || '/');
  }

  updateMassActionBar(server) {
    const container = document.getElementById('mass-action-container');
    if (!container) return;

    if (this.selectedFiles.size === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = `
      <div class="mass-action-bar">
        <span style="font-weight: 600; color: var(--brand-cyan);"><i class="fa-solid fa-circle-check"></i> ${this.selectedFiles.size} item(s) selected</span>
        <div style="display:flex; gap: 8px;">
          <button class="btn-secondary" id="btn-mass-archive"><i class="fa-solid fa-file-zipper"></i> Archive</button>
          <button class="btn-danger" id="btn-mass-delete"><i class="fa-solid fa-trash-can"></i> Delete Selected</button>
        </div>
      </div>
    `;

    document.getElementById('btn-mass-archive').onclick = async () => {
      this.playSound('click');
      try {
        const res = await window.api.compressFiles(server.id, this.currentPath, Array.from(this.selectedFiles));
        this.showToast(`Archived to ${res.archive}`, 'success');
        this.selectedFiles.clear();
        this.loadDirectoryFiles(server, this.currentPath);
      } catch (err) {
        this.showToast(err.message, 'error');
      }
    };

    document.getElementById('btn-mass-delete').onclick = async () => {
      if (confirm(`Delete ${this.selectedFiles.size} selected items? This cannot be undone.`)) {
        try {
          await window.api.massDeleteFiles(server.id, Array.from(this.selectedFiles));
          this.showToast('Selected files deleted', 'success');
          this.selectedFiles.clear();
          this.loadDirectoryFiles(server, this.currentPath);
        } catch (err) {
          this.showToast(err.message, 'error');
        }
      }
    };
  }

  async loadDirectoryFiles(server, dirPath) {
    this.currentPath = dirPath;
    this.selectedFiles.clear();
    const tbody = document.getElementById('files-tbody');
    const crumbsContainer = document.getElementById('file-crumbs-container');
    if (!tbody || !crumbsContainer) return;

    this.updateMassActionBar(server);
    const selectAllCb = document.getElementById('select-all-files-cb');
    if (selectAllCb) selectAllCb.checked = false;

    // Render breadcrumbs
    const parts = dirPath.split('/').filter(Boolean);
    let breadcrumbHTML = `<span class="file-crumb" data-path="/"><i class="fa-solid fa-house"></i> root</span>`;
    let accum = '';
    parts.forEach(p => {
      accum += `/${p}`;
      breadcrumbHTML += `<span>/</span><span class="file-crumb" data-path="${accum}">${p}</span>`;
    });
    crumbsContainer.innerHTML = breadcrumbHTML;

    crumbsContainer.querySelectorAll('.file-crumb').forEach(c => {
      c.onclick = () => this.loadDirectoryFiles(server, c.getAttribute('data-path'));
    });

    try {
      const res = await window.api.listFiles(server.id, dirPath);
      if (res.files.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 3rem; color: var(--text-dim);">Directory is empty</td></tr>`;
        return;
      }

      tbody.innerHTML = res.files.map(f => {
        const fullRel = pathJoin(dirPath, f.name);
        const iconClass = f.isDirectory ? 'fa-folder folder' : this.getFileIcon(f.name);
        const sizeFormatted = f.isDirectory ? '-' : this.formatBytes(f.size);
        const dateFormatted = new Date(f.modified).toLocaleString();
        const mode = f.mode || (f.isDirectory ? '0755' : '0644');
        const isArchive = f.name.endsWith('.tar.gz') || f.name.endsWith('.zip') || f.name.endsWith('.tar');

        return `
          <tr class="file-row" data-name="${this.escapeHtml(f.name)}" data-is-dir="${f.isDirectory}">
            <td style="text-align: center;">
              <input type="checkbox" class="file-row-cb" data-path="${fullRel}">
            </td>
            <td>
              <div class="file-name-cell">
                <i class="fa-solid ${iconClass} file-icon"></i>
                <span style="font-weight: 500;">${this.escapeHtml(f.name)}</span>
              </div>
            </td>
            <td><span style="font-family: var(--font-mono); font-size: 0.8rem;">${sizeFormatted}</span></td>
            <td><span class="badge-role" style="font-family: var(--font-mono); font-size: 0.72rem; cursor:pointer;" onclick="app.openChmodModal('${server.id}', '${fullRel}', '${mode}')" title="Click to edit permissions">${mode}</span></td>
            <td><span style="font-size: 0.8rem; color: var(--text-dim);">${dateFormatted}</span></td>
            <td>
              <div class="file-row-actions">
                ${!f.isDirectory ? `
                  <button class="file-action-btn edit" data-path="${fullRel}" title="Edit File">
                    <i class="fa-solid fa-pen-to-square"></i>
                  </button>
                  <a class="file-action-btn" href="/api/servers/${server.id}/files/download?path=${encodeURIComponent(fullRel)}" download title="Download">
                    <i class="fa-solid fa-download"></i>
                  </a>
                ` : ''}
                ${isArchive ? `
                  <button class="file-action-btn extract" data-path="${fullRel}" title="Extract Archive">
                    <i class="fa-solid fa-box-open"></i>
                  </button>
                ` : ''}
                <button class="file-action-btn rename" data-path="${fullRel}" title="Rename">
                  <i class="fa-solid fa-i-cursor"></i>
                </button>
                <button class="file-action-btn copy" data-path="${fullRel}" title="Duplicate">
                  <i class="fa-regular fa-copy"></i>
                </button>
                <button class="file-action-btn delete" data-path="${fullRel}" title="Delete">
                  <i class="fa-solid fa-trash-can"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      // Checkbox handlers
      tbody.querySelectorAll('.file-row-cb').forEach(cb => {
        cb.onclick = (e) => {
          e.stopPropagation();
          const p = cb.getAttribute('data-path');
          if (cb.checked) this.selectedFiles.add(p);
          else this.selectedFiles.delete(p);
          this.updateMassActionBar(server);
        };
      });

      // Attach row clicks
      tbody.querySelectorAll('.file-row').forEach(row => {
        row.onclick = (e) => {
          if (e.target.closest('.file-row-actions') || e.target.closest('input') || e.target.closest('.badge-role')) return;
          const isDir = row.getAttribute('data-is-dir') === 'true';
          const name = row.getAttribute('data-name');
          const next = pathJoin(dirPath, name);
          if (isDir) {
            this.loadDirectoryFiles(server, next);
          } else {
            this.openCodeEditor(server, next);
          }
        };
      });

      // Row Actions
      tbody.querySelectorAll('.file-action-btn.edit').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          this.openCodeEditor(server, btn.getAttribute('data-path'));
        };
      });

      tbody.querySelectorAll('.file-action-btn.extract').forEach(btn => {
        btn.onclick = async (e) => {
          e.stopPropagation();
          const p = btn.getAttribute('data-path');
          try {
            await window.api.decompressFile(server.id, p);
            this.showToast(`Extracted ${p}`, 'success');
            this.loadDirectoryFiles(server, this.currentPath);
          } catch (err) {
            this.showToast(err.message, 'error');
          }
        };
      });

      tbody.querySelectorAll('.file-action-btn.rename').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          this.openRenameModal(server, btn.getAttribute('data-path'));
        };
      });

      tbody.querySelectorAll('.file-action-btn.copy').forEach(btn => {
        btn.onclick = async (e) => {
          e.stopPropagation();
          try {
            await window.api.copyFile(server.id, btn.getAttribute('data-path'));
            this.showToast('File duplicated', 'success');
            this.loadDirectoryFiles(server, this.currentPath);
          } catch (err) {
            this.showToast(err.message, 'error');
          }
        };
      });

      tbody.querySelectorAll('.file-action-btn.delete').forEach(btn => {
        btn.onclick = async (e) => {
          e.stopPropagation();
          const target = btn.getAttribute('data-path');
          if (confirm(`Are you sure you want to delete "${target}"?`)) {
            try {
              await window.api.deleteFile(server.id, target);
              this.showToast(`Deleted ${target}`, 'success');
              this.loadDirectoryFiles(server, this.currentPath);
            } catch (err) {
              this.showToast(err.message, 'error');
            }
          }
        };
      });
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" style="color: #ef4444; padding: 2rem; text-align:center;">Failed to list files: ${err.message}</td></tr>`;
    }
  }

  // Rename File Modal
  openRenameModal(server, targetPath) {
    const filename = path.basename ? targetPath.split('/').pop() : targetPath;
    const newName = prompt('Enter new filename or path:', filename);
    if (!newName || newName === filename) return;

    const parentDir = targetPath.substring(0, targetPath.lastIndexOf('/')) || '';
    const newPath = pathJoin(parentDir, newName);

    window.api.renameFile(server.id, targetPath, newPath)
      .then(() => {
        this.showToast('Renamed successfully', 'success');
        this.loadDirectoryFiles(server, this.currentPath);
      })
      .catch(err => this.showToast(err.message, 'error'));
  }

  // Chmod Permissions Modal
  openChmodModal(serverId, targetPath, currentMode = '0644') {
    const newMode = prompt(`Enter octal permissions for ${targetPath}:`, currentMode);
    if (!newMode || newMode === currentMode) return;

    window.api.chmodFile(serverId, targetPath, newMode)
      .then(() => {
        this.showToast(`Updated permissions to ${newMode}`, 'success');
        const s = this.servers.find(srv => srv.id === serverId);
        if (s) this.loadDirectoryFiles(s, this.currentPath);
      })
      .catch(err => this.showToast(err.message, 'error'));
  }

  // In-Browser Code Editor Modal
  async openCodeEditor(server, filePath) {
    try {
      const res = await window.api.getFileContent(server.id, filePath);
      const modal = document.createElement('div');
      modal.className = 'code-editor-modal';
      modal.id = 'active-editor-modal';

      modal.innerHTML = `
        <div class="editor-window">
          <div class="editor-header">
            <div class="editor-filename">
              <i class="fa-solid fa-code"></i> ${this.escapeHtml(filePath)}
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="btn-primary" id="btn-editor-save"><i class="fa-solid fa-floppy-disk"></i> Save Content</button>
              <button class="btn-secondary" id="btn-editor-close"><i class="fa-solid fa-xmark"></i> Close</button>
            </div>
          </div>
          <textarea class="editor-textarea" id="editor-text-content" spellcheck="false">${this.escapeHtml(res.content)}</textarea>
          <div class="editor-footer">
            <span style="font-size: 0.78rem; color: var(--text-dim); font-family: var(--font-mono);">UTF-8 | Lines: <span id="line-counter">0</span></span>
            <span style="font-size: 0.78rem; color: var(--brand-cyan);">SMOOTH x HOST Monaco-Core IDE</span>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      const textarea = document.getElementById('editor-text-content');
      const counter = document.getElementById('line-counter');
      const updateLines = () => {
        counter.textContent = textarea.value.split('\n').length;
      };
      textarea.oninput = updateLines;
      updateLines();

      document.getElementById('btn-editor-save').onclick = async () => {
        this.playSound('click');
        try {
          await window.api.saveFileContent(server.id, filePath, textarea.value);
          this.showToast(`Saved ${filePath} successfully`, 'success');
        } catch (err) {
          this.showToast(`Failed to save: ${err.message}`, 'error');
        }
      };

      document.getElementById('btn-editor-close').onclick = () => modal.remove();
    } catch (err) {
      this.showToast(`Cannot open file: ${err.message}`, 'error');
    }
  }

  openCreateFileModal(server) {
    const filename = prompt('Enter new file name (e.g. config.json, bot.js, server.properties):');
    if (!filename) return;
    window.api.createFileOrFolder(server.id, this.currentPath, filename, false)
      .then(() => {
        this.showToast(`Created file: ${filename}`, 'success');
        this.loadDirectoryFiles(server, this.currentPath);
      })
      .catch(err => this.showToast(err.message, 'error'));
  }

  openCreateFolderModal(server) {
    const foldername = prompt('Enter new folder name:');
    if (!foldername) return;
    window.api.createFileOrFolder(server.id, this.currentPath, foldername, true)
      .then(() => {
        this.showToast(`Created directory: ${foldername}`, 'success');
        this.loadDirectoryFiles(server, this.currentPath);
      })
      .catch(err => this.showToast(err.message, 'error'));
  }

  // ======================== TAB: DATABASES ======================== //

  async renderDatabasesTab(container, server) {
    container.innerHTML = `
      <div class="panel-section-box">
        <div class="section-head-row">
          <div>
            <h2 class="section-title"><i class="fa-solid fa-database" style="color: #38bdf8;"></i> MySQL Databases</h2>
            <p style="font-size: 0.85rem; color: var(--text-dim); margin-top: 4px;">Dedicated MariaDB/MySQL instances with remote root access</p>
          </div>
          <button class="btn-primary" id="btn-new-db"><i class="fa-solid fa-plus"></i> New Database</button>
        </div>

        <div class="items-grid" id="db-list-grid">
          <div style="padding: 2rem; text-align:center; color: var(--text-dim);"><i class="fa-solid fa-spinner fa-spin"></i> Loading databases...</div>
        </div>
      </div>
    `;

    document.getElementById('btn-new-db').onclick = () => this.openCreateDatabaseModal(server);
    await this.loadDatabases(server);
  }

  async loadDatabases(server) {
    const grid = document.getElementById('db-list-grid');
    if (!grid) return;
    try {
      const dbs = await window.api.getDatabases(server.id);
      if (dbs.length === 0) {
        grid.innerHTML = `
          <div style="grid-column: 1/-1; text-align:center; padding: 3rem; color: var(--text-dim);">
            <i class="fa-solid fa-database" style="font-size: 2.5rem; opacity: 0.3; margin-bottom: 0.8rem;"></i>
            <p>No databases provisioned for this server yet.</p>
          </div>
        `;
        return;
      }

      grid.innerHTML = dbs.map(db => `
        <div class="item-card">
          <div>
            <div class="item-card-title">
              <span><i class="fa-solid fa-database" style="color: var(--brand-cyan); margin-right: 6px;"></i> ${this.escapeHtml(db.name)}</span>
              <div style="display:flex; gap: 6px;">
                <button class="file-action-btn rotate" data-db-id="${db.id}" title="Rotate Password"><i class="fa-solid fa-key"></i></button>
                <button class="file-action-btn delete" data-db-id="${db.id}" title="Delete Database"><i class="fa-solid fa-trash-can"></i></button>
              </div>
            </div>
            <div class="item-field-list" style="margin-top: 10px;">
              <div class="item-field"><span class="field-label">Endpoint</span><span class="field-val">${db.host}</span></div>
              <div class="item-field"><span class="field-label">Connections From</span><span class="field-val">${db.allowedHosts || '%'}</span></div>
              <div class="item-field"><span class="field-label">Username</span><span class="field-val">${db.user}</span></div>
              <div class="item-field">
                <span class="field-label">Password</span>
                <span class="field-val" style="cursor: pointer;" title="Click to copy password" onclick="navigator.clipboard.writeText('${db.pass}'); app.showToast('Database password copied!', 'success');">
                  •••••••••••• <i class="fa-regular fa-copy" style="font-size: 0.7rem; margin-left: 4px;"></i>
                </span>
              </div>
              <div class="item-field"><span class="field-label">Max Connections</span><span class="field-val">0 / ${db.maxConnections}</span></div>
            </div>
          </div>
        </div>
      `).join('');

      grid.querySelectorAll('.file-action-btn.rotate').forEach(btn => {
        btn.onclick = async () => {
          const dbId = btn.getAttribute('data-db-id');
          if (confirm('Rotate password for this database? Current connections may be dropped.')) {
            await window.api.rotateDatabasePassword(server.id, dbId);
            this.showToast('Password rotated successfully', 'success');
            this.loadDatabases(server);
          }
        };
      });

      grid.querySelectorAll('.file-action-btn.delete').forEach(btn => {
        btn.onclick = async () => {
          const dbId = btn.getAttribute('data-db-id');
          if (confirm('Delete this database? All stored tables and data will be permanently wiped.')) {
            await window.api.deleteDatabase(server.id, dbId);
            this.showToast('Database removed', 'success');
            this.loadDatabases(server);
          }
        };
      });
    } catch (err) {
      grid.innerHTML = `<div style="color: #ef4444;">${err.message}</div>`;
    }
  }

  openCreateDatabaseModal(server) {
    const name = prompt('Enter database identifier name (e.g. luckperms, botdata):');
    if (!name) return;
    const allowed = prompt('Allowed connections host (use % for any host):', '%');

    window.api.createDatabase(server.id, name, allowed || '%')
      .then(() => {
        this.showToast(`Database created: ${name}`, 'success');
        this.loadDatabases(server);
      })
      .catch(err => this.showToast(err.message, 'error'));
  }

  // ======================== TAB: SCHEDULES ======================== //

  async renderSchedulesTab(container, server) {
    container.innerHTML = `
      <div class="panel-section-box">
        <div class="section-head-row">
          <div>
            <h2 class="section-title"><i class="fa-regular fa-calendar-check" style="color: #a855f7;"></i> Automated Schedules (Cron)</h2>
            <p style="font-size: 0.85rem; color: var(--text-dim); margin-top: 4px;">Execute automated power restarts, console broadcasts, and backups</p>
          </div>
          <button class="btn-primary" id="btn-new-schedule"><i class="fa-solid fa-plus"></i> New Schedule</button>
        </div>

        <div class="items-grid" id="schedules-grid">
          <div style="padding: 2rem; text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i> Loading schedules...</div>
        </div>
      </div>
    `;

    document.getElementById('btn-new-schedule').onclick = () => this.openCreateScheduleModal(server);
    await this.loadSchedules(server);
  }

  async loadSchedules(server) {
    const grid = document.getElementById('schedules-grid');
    if (!grid) return;
    try {
      const schs = await window.api.getSchedules(server.id);
      if (schs.length === 0) {
        grid.innerHTML = `
          <div style="grid-column: 1/-1; text-align:center; padding: 3rem; color: var(--text-dim);">
            <i class="fa-regular fa-calendar-xmark" style="font-size: 2.5rem; opacity: 0.3; margin-bottom: 0.8rem;"></i>
            <p>No cron schedules configured.</p>
          </div>
        `;
        return;
      }

      grid.innerHTML = schs.map(sc => `
        <div class="item-card">
          <div>
            <div class="item-card-title">
              <span><i class="fa-solid fa-clock" style="color: #a855f7; margin-right: 6px;"></i> ${this.escapeHtml(sc.name)}</span>
              <div style="display:flex; gap: 6px;">
                <button class="file-action-btn toggle-active" data-sc-id="${sc.id}" title="${sc.isActive ? 'Pause' : 'Activate'}">
                  <i class="fa-solid ${sc.isActive ? 'fa-pause' : 'fa-play'}"></i>
                </button>
                <button class="file-action-btn delete" data-sc-id="${sc.id}" title="Delete Schedule">
                  <i class="fa-solid fa-trash-can"></i>
                </button>
              </div>
            </div>
            <div class="item-field-list" style="margin-top: 10px;">
              <div class="item-field"><span class="field-label">Cron Expression</span><span class="field-val" style="font-family: var(--font-mono);">${sc.cron}</span></div>
              <div class="item-field"><span class="field-label">Last Executed</span><span class="field-val" style="color: var(--text-muted);">${sc.lastRun || 'Never'}</span></div>
              <div class="item-field"><span class="field-label">State</span><span class="field-val" style="color: ${sc.isActive ? '#34d399' : '#f59e0b'};">${sc.isActive ? 'Active' : 'Paused'}</span></div>
            </div>

            <div style="margin-top: 12px;">
              <span style="font-size: 0.75rem; color: var(--text-dim); font-weight: 700; text-transform:uppercase;">Task Sequence (${(sc.tasks || []).length}):</span>
              <div class="task-timeline">
                ${(sc.tasks || []).map(t => `
                  <div class="task-timeline-card">
                    <div>
                      <span class="act-badge ${t.action}">${t.action.toUpperCase()}</span>
                      <span style="font-size: 0.82rem; margin-left: 6px; font-weight: 500;">${this.escapeHtml(t.payload)}</span>
                    </div>
                    <span style="font-size: 0.72rem; color: var(--text-dim);">+${t.timeOffset || 0}s</span>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
          <button class="btn-secondary btn-trigger-schedule" data-sc-id="${sc.id}" style="width: 100%; justify-content: center; margin-top: 10px;">
            <i class="fa-solid fa-bolt"></i> Run Schedule Now
          </button>
        </div>
      `).join('');

      grid.querySelectorAll('.btn-trigger-schedule').forEach(btn => {
        btn.onclick = async () => {
          const scId = btn.getAttribute('data-sc-id');
          await window.api.triggerSchedule(server.id, scId);
          this.showToast('Schedule execution triggered', 'success');
          this.loadSchedules(server);
        };
      });

      grid.querySelectorAll('.file-action-btn.toggle-active').forEach(btn => {
        btn.onclick = async () => {
          const scId = btn.getAttribute('data-sc-id');
          await window.api.toggleSchedule(server.id, scId);
          this.showToast('Schedule status updated', 'info');
          this.loadSchedules(server);
        };
      });

      grid.querySelectorAll('.file-action-btn.delete').forEach(btn => {
        btn.onclick = async () => {
          const scId = btn.getAttribute('data-sc-id');
          await window.api.deleteSchedule(server.id, scId);
          this.showToast('Schedule removed', 'success');
          this.loadSchedules(server);
        };
      });
    } catch (err) {
      grid.innerHTML = `<div>${err.message}</div>`;
    }
  }

  openCreateScheduleModal(server) {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.id = 'modal-create-schedule';

    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <div class="modal-title"><i class="fa-regular fa-calendar-plus" style="color: #a855f7;"></i> Create Automated Schedule</div>
          <button class="modal-close-btn" onclick="this.closest('.modal-backdrop').remove()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Schedule Name</label>
            <input type="text" class="form-input" id="sched-name" placeholder="e.g. Daily Restart at 4am" value="Daily Nightly Restart">
          </div>

          <div class="form-group">
            <label class="form-label">Cron Frequency Preset</label>
            <select class="form-input" id="sched-preset">
              <option value="0 4 * * *">Every Day at 04:00 AM (0 4 * * *)</option>
              <option value="0 */12 * * *">Every 12 Hours (0 */12 * * *)</option>
              <option value="0 */6 * * *">Every 6 Hours (0 */6 * * *)</option>
              <option value="0 * * * *">Every Hour (0 * * * *)</option>
              <option value="*/30 * * * *">Every 30 Minutes (*/30 * * * *)</option>
              <option value="custom">Custom Cron Expression</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Cron Expression</label>
            <input type="text" class="form-input" id="sched-cron" value="0 4 * * *" style="font-family: var(--font-mono);">
            <span style="font-size: 0.74rem; color: var(--text-dim);">Fields: minute &bull; hour &bull; day &bull; month &bull; weekday</span>
          </div>

          <div class="form-group">
            <label class="form-label">Initial Task Action</label>
            <select class="form-input" id="sched-action">
              <option value="power:restart">Power Action: Restart Server</option>
              <option value="backup:Daily Snapshot">Backup Action: Create Snapshot</option>
              <option value="command:say Server automated backup in progress">Console Command: /say Broadcast</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="this.closest('.modal-backdrop').remove()">Cancel</button>
          <button class="btn-primary" id="btn-submit-schedule"><i class="fa-solid fa-plus"></i> Create Schedule</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const preset = document.getElementById('sched-preset');
    const cronInp = document.getElementById('sched-cron');
    preset.onchange = () => {
      if (preset.value !== 'custom') cronInp.value = preset.value;
    };

    document.getElementById('btn-submit-schedule').onclick = async () => {
      const name = document.getElementById('sched-name').value.trim();
      const cron = cronInp.value.trim();
      const actVal = document.getElementById('sched-action').value;
      const [type, payload] = actVal.split(':');

      if (!name || !cron) {
        this.showToast('Name and Cron expression are required', 'warn');
        return;
      }

      modal.remove();
      try {
        await window.api.createSchedule(server.id, name, cron, [
          { id: 'tsk-1', sequence: 1, action: type, payload: payload, timeOffset: 0 }
        ]);
        this.showToast('Schedule created successfully', 'success');
        this.loadSchedules(server);
      } catch (err) {
        this.showToast(err.message, 'error');
      }
    };
  }

  // ======================== TAB: USERS ======================== //

  async renderUsersTab(container, server) {
    container.innerHTML = `
      <div class="panel-section-box">
        <div class="section-head-row">
          <div>
            <h2 class="section-title"><i class="fa-solid fa-users" style="color: #10b981;"></i> Sub-User Access Management</h2>
            <p style="font-size: 0.85rem; color: var(--text-dim); margin-top: 4px;">Grant teammates granular control over console, files, and backups</p>
          </div>
          <button class="btn-primary" id="btn-invite-user"><i class="fa-solid fa-user-plus"></i> Invite User</button>
        </div>

        <div class="items-grid" id="users-grid">
          <div style="padding: 2rem; text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i> Loading sub-users...</div>
        </div>
      </div>
    `;

    document.getElementById('btn-invite-user').onclick = () => this.openInviteUserModal(server);
    await this.loadUsers(server);
  }

  async loadUsers(server) {
    const grid = document.getElementById('users-grid');
    if (!grid) return;
    try {
      const users = await window.api.getUsers(server.id);
      if (users.length === 0) {
        grid.innerHTML = `
          <div style="grid-column: 1/-1; text-align:center; padding: 3rem; color: var(--text-dim);">
            <i class="fa-solid fa-user-shield" style="font-size: 2.5rem; opacity: 0.3; margin-bottom: 0.8rem;"></i>
            <p>No sub-users have been invited yet. Only root administrators have access.</p>
          </div>
        `;
        return;
      }

      grid.innerHTML = users.map(u => `
        <div class="item-card">
          <div>
            <div class="item-card-title">
              <span><i class="fa-solid fa-circle-user" style="color: #10b981; margin-right: 6px;"></i> ${this.escapeHtml(u.email)}</span>
              <div style="display:flex; gap: 6px;">
                <button class="file-action-btn edit-perms" data-user-id="${u.id}" title="Edit Permissions"><i class="fa-solid fa-sliders"></i></button>
                <button class="file-action-btn delete" data-user-id="${u.id}" title="Revoke Sub-user"><i class="fa-solid fa-user-xmark"></i></button>
              </div>
            </div>
            <div class="item-field-list" style="margin-top: 10px;">
              <div class="item-field"><span class="field-label">Role</span><span class="field-val">${u.role || 'Operator'}</span></div>
              <div class="item-field"><span class="field-label">Permissions</span><span class="field-val" style="color: var(--brand-cyan);">${(u.permissions || []).length} assigned</span></div>
              <div class="item-field"><span class="field-label">2FA Enforced</span><span class="field-val" style="color:#10b981;">Yes</span></div>
            </div>
          </div>
        </div>
      `).join('');

      grid.querySelectorAll('.file-action-btn.edit-perms').forEach(btn => {
        btn.onclick = () => {
          const uId = btn.getAttribute('data-user-id');
          const targetUser = users.find(u => u.id === uId);
          if (targetUser) this.openEditUserPermissionsModal(server, targetUser);
        };
      });

      grid.querySelectorAll('.file-action-btn.delete').forEach(btn => {
        btn.onclick = async () => {
          const uId = btn.getAttribute('data-user-id');
          if (confirm('Revoke access for this sub-user?')) {
            await window.api.deleteUser(server.id, uId);
            this.showToast('Sub-user revoked', 'success');
            this.loadUsers(server);
          }
        };
      });
    } catch (err) {
      grid.innerHTML = `<div>${err.message}</div>`;
    }
  }

  // Pterodactyl Categorized Permissions List
  getPermissionsList() {
    return [
      {
        category: 'Server Control',
        icon: 'fa-power-off',
        permissions: [
          { id: 'control.start', label: 'Start Server' },
          { id: 'control.stop', label: 'Stop Server' },
          { id: 'control.restart', label: 'Restart Server' }
        ]
      },
      {
        category: 'Terminal & Console',
        icon: 'fa-terminal',
        permissions: [
          { id: 'console.read', label: 'View Console Stream' },
          { id: 'console.send', label: 'Send Console Commands' }
        ]
      },
      {
        category: 'File Management',
        icon: 'fa-folder-open',
        permissions: [
          { id: 'file.read', label: 'View Files & Directories' },
          { id: 'file.create', label: 'Create New Files & Folders' },
          { id: 'file.update', label: 'Edit File Contents' },
          { id: 'file.delete', label: 'Delete Files & Folders' },
          { id: 'file.upload', label: 'Upload Files' },
          { id: 'file.archive', label: 'Compress / Extract Archives' }
        ]
      },
      {
        category: 'Sub-Users',
        icon: 'fa-users',
        permissions: [
          { id: 'user.read', label: 'View Sub-Users' },
          { id: 'user.create', label: 'Invite Sub-Users' },
          { id: 'user.update', label: 'Modify Permissions' },
          { id: 'user.delete', label: 'Revoke Access' }
        ]
      },
      {
        category: 'Backups & Snapshots',
        icon: 'fa-box-archive',
        permissions: [
          { id: 'backup.read', label: 'View Backups' },
          { id: 'backup.create', label: 'Create Backups' },
          { id: 'backup.restore', label: 'Restore Backups' },
          { id: 'backup.download', label: 'Download Backups' },
          { id: 'backup.delete', label: 'Delete Backups' }
        ]
      },
      {
        category: 'Databases',
        icon: 'fa-database',
        permissions: [
          { id: 'database.read', label: 'View Databases' },
          { id: 'database.create', label: 'Create Databases' },
          { id: 'database.password_reset', label: 'Rotate Passwords' },
          { id: 'database.delete', label: 'Delete Databases' }
        ]
      },
      {
        category: 'Schedules',
        icon: 'fa-clock',
        permissions: [
          { id: 'schedule.read', label: 'View Schedules' },
          { id: 'schedule.create', label: 'Create Schedules' },
          { id: 'schedule.trigger', label: 'Run Schedule Now' },
          { id: 'schedule.delete', label: 'Delete Schedules' }
        ]
      },
      {
        category: 'Settings & Danger Zone',
        icon: 'fa-gear',
        permissions: [
          { id: 'settings.rename', label: 'Rename Server' },
          { id: 'settings.reinstall', label: 'Reinstall Server' }
        ]
      }
    ];
  }

  openInviteUserModal(server) {
    const permCategories = this.getPermissionsList();
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.id = 'modal-invite-user';

    modal.innerHTML = `
      <div class="modal-card" style="max-width: 680px;">
        <div class="modal-header">
          <div class="modal-title"><i class="fa-solid fa-user-plus" style="color: #10b981;"></i> Invite Server Sub-User</div>
          <button class="modal-close-btn" onclick="this.closest('.modal-backdrop').remove()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">User Email Address</label>
            <input type="email" class="form-input" id="invite-email" placeholder="staff@example.com">
          </div>

          <div style="margin-top: 1rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.8rem;">
              <span class="form-label" style="margin: 0;">Permissions Configuration</span>
              <button class="btn-secondary" id="btn-select-all-perms" style="padding: 4px 10px; font-size: 0.75rem;">Select All</button>
            </div>

            ${permCategories.map(cat => `
              <div class="perm-category-box">
                <div class="perm-category-title">
                  <span><i class="fa-solid ${cat.icon}" style="color: var(--brand-cyan); margin-right: 6px;"></i> ${cat.category}</span>
                </div>
                <div class="perm-grid">
                  ${cat.permissions.map(p => `
                    <label class="perm-item-label">
                      <input type="checkbox" class="subuser-perm-cb" value="${p.id}" ${['control.start', 'control.restart', 'console.read'].includes(p.id) ? 'checked' : ''}>
                      <span>${p.label}</span>
                    </label>
                  `).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="this.closest('.modal-backdrop').remove()">Cancel</button>
          <button class="btn-primary" id="btn-submit-invite"><i class="fa-solid fa-paper-plane"></i> Send Invitation</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('btn-select-all-perms').onclick = () => {
      document.querySelectorAll('.subuser-perm-cb').forEach(cb => cb.checked = true);
    };

    document.getElementById('btn-submit-invite').onclick = async () => {
      const email = document.getElementById('invite-email').value.trim();
      if (!email) {
        this.showToast('Please enter an email address', 'warn');
        return;
      }

      const permissions = Array.from(document.querySelectorAll('.subuser-perm-cb:checked')).map(cb => cb.value);
      modal.remove();

      try {
        await window.api.inviteUser(server.id, email, permissions);
        this.showToast(`Invited ${email}`, 'success');
        this.loadUsers(server);
      } catch (err) {
        this.showToast(err.message, 'error');
      }
    };
  }

  openEditUserPermissionsModal(server, subuser) {
    const permCategories = this.getPermissionsList();
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';

    modal.innerHTML = `
      <div class="modal-card" style="max-width: 680px;">
        <div class="modal-header">
          <div class="modal-title"><i class="fa-solid fa-sliders" style="color: var(--brand-cyan);"></i> Permissions: ${this.escapeHtml(subuser.email)}</div>
          <button class="modal-close-btn" onclick="this.closest('.modal-backdrop').remove()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Role Title</label>
            <input type="text" class="form-input" id="edit-sub-role" value="${this.escapeHtml(subuser.role || 'Operator')}">
          </div>

          <div style="margin-top: 1rem;">
            ${permCategories.map(cat => `
              <div class="perm-category-box">
                <div class="perm-category-title">
                  <span><i class="fa-solid ${cat.icon}" style="color: var(--brand-cyan); margin-right: 6px;"></i> ${cat.category}</span>
                </div>
                <div class="perm-grid">
                  ${cat.permissions.map(p => `
                    <label class="perm-item-label">
                      <input type="checkbox" class="edit-perm-cb" value="${p.id}" ${(subuser.permissions || []).includes(p.id) ? 'checked' : ''}>
                      <span>${p.label}</span>
                    </label>
                  `).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="this.closest('.modal-backdrop').remove()">Cancel</button>
          <button class="btn-primary" id="btn-save-sub-perms"><i class="fa-solid fa-floppy-disk"></i> Save Permissions</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('btn-save-sub-perms').onclick = async () => {
      const role = document.getElementById('edit-sub-role').value;
      const perms = Array.from(document.querySelectorAll('.edit-perm-cb:checked')).map(cb => cb.value);
      modal.remove();

      try {
        await window.api.updateUserPermissions(server.id, subuser.id, perms, role);
        this.showToast('Sub-user permissions saved', 'success');
        this.loadUsers(server);
      } catch (err) {
        this.showToast(err.message, 'error');
      }
    };
  }

  // ======================== TAB: BACKUPS ======================== //

  async renderBackupsTab(container, server) {
    container.innerHTML = `
      <div class="panel-section-box">
        <div class="section-head-row">
          <div>
            <h2 class="section-title"><i class="fa-solid fa-box-archive" style="color: #f59e0b;"></i> Server Backups & Snapshots</h2>
            <p style="font-size: 0.85rem; color: var(--text-dim); margin-top: 4px;">Point-in-time full server disk archives with 1-click restore</p>
          </div>
          <button class="btn-primary" id="btn-create-backup"><i class="fa-solid fa-plus"></i> Create Backup</button>
        </div>

        <div class="items-grid" id="backups-grid">
          <div style="padding: 2rem; text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i> Loading backups...</div>
        </div>
      </div>
    `;

    document.getElementById('btn-create-backup').onclick = () => this.openCreateBackupModal(server);
    await this.loadBackups(server);
  }

  async loadBackups(server) {
    const grid = document.getElementById('backups-grid');
    if (!grid) return;
    try {
      const bks = await window.api.getBackups(server.id);
      if (bks.length === 0) {
        grid.innerHTML = `
          <div style="grid-column: 1/-1; text-align:center; padding: 3rem; color: var(--text-dim);">
            <i class="fa-solid fa-box-archive" style="font-size: 2.5rem; opacity: 0.3; margin-bottom: 0.8rem;"></i>
            <p>No backup snapshots saved yet.</p>
          </div>
        `;
        return;
      }

      grid.innerHTML = bks.map(b => `
        <div class="item-card">
          <div>
            <div class="item-card-title">
              <span><i class="fa-solid ${b.isLocked ? 'fa-lock' : 'fa-file-zipper'}" style="color: #f59e0b; margin-right: 6px;"></i> ${this.escapeHtml(b.name)}</span>
              <div style="display:flex; gap: 6px;">
                <button class="file-action-btn toggle-lock" data-bk-id="${b.id}" title="${b.isLocked ? 'Unlock Backup' : 'Lock Backup'}">
                  <i class="fa-solid ${b.isLocked ? 'fa-lock' : 'fa-lock-open'}"></i>
                </button>
                <button class="file-action-btn delete" data-bk-id="${b.id}" title="Delete Backup" ${b.isLocked ? 'disabled style="opacity:0.3;"' : ''}>
                  <i class="fa-solid fa-trash-can"></i>
                </button>
              </div>
            </div>
            <div class="item-field-list" style="margin-top: 10px;">
              <div class="item-field"><span class="field-label">Archive Size</span><span class="field-val">${b.size}</span></div>
              <div class="item-field"><span class="field-label">Created At</span><span class="field-val" style="color: var(--text-muted);">${new Date(b.createdAt).toLocaleDateString()}</span></div>
              <div class="item-field"><span class="field-label">Checksum</span><span class="field-val" style="font-family: var(--font-mono); font-size: 0.72rem; color:#10b981;">${b.checksum || 'sha256:verified'}</span></div>
            </div>
          </div>
          <div style="display:flex; gap: 8px; margin-top: 10px;">
            <button class="btn-secondary btn-restore-backup" data-bk-id="${b.id}" style="flex:1; justify-content:center;">
              <i class="fa-solid fa-rotate-left"></i> Restore
            </button>
            <a class="btn-secondary" href="/api/servers/${server.id}/backups/${b.id}/download" style="flex:1; justify-content:center; text-decoration:none;">
              <i class="fa-solid fa-download"></i> Download
            </a>
          </div>
        </div>
      `).join('');

      grid.querySelectorAll('.btn-restore-backup').forEach(btn => {
        btn.onclick = async () => {
          const bkId = btn.getAttribute('data-bk-id');
          if (confirm('Restore this backup snapshot? Existing files may be overwritten.')) {
            await window.api.restoreBackup(server.id, bkId);
            this.showToast('Restore sequence started', 'info');
          }
        };
      });

      grid.querySelectorAll('.file-action-btn.toggle-lock').forEach(btn => {
        btn.onclick = async () => {
          const bkId = btn.getAttribute('data-bk-id');
          await window.api.lockBackup(server.id, bkId);
          this.showToast('Backup lock status updated', 'info');
          this.loadBackups(server);
        };
      });

      grid.querySelectorAll('.file-action-btn.delete').forEach(btn => {
        btn.onclick = async () => {
          const bkId = btn.getAttribute('data-bk-id');
          await window.api.deleteBackup(server.id, bkId);
          this.showToast('Backup deleted', 'success');
          this.loadBackups(server);
        };
      });
    } catch (err) {
      grid.innerHTML = `<div>${err.message}</div>`;
    }
  }

  openCreateBackupModal(server) {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';

    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <div class="modal-title"><i class="fa-solid fa-box-archive" style="color: #f59e0b;"></i> Create Backup Snapshot</div>
          <button class="modal-close-btn" onclick="this.closest('.modal-backdrop').remove()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Backup Title</label>
            <input type="text" class="form-input" id="backup-title-inp" value="Snapshot-${new Date().toLocaleDateString().replace(/\//g, '-')}">
          </div>
          <div class="form-group">
            <label class="form-label">Ignored Files & Patterns (Optional)</label>
            <input type="text" class="form-input" id="backup-ignored-inp" placeholder="e.g. logs/*, cache/*, *.tmp">
          </div>
          <div class="form-group">
            <label class="perm-item-label" style="background:transparent; padding:0;">
              <input type="checkbox" id="backup-locked-cb">
              <span style="font-weight: 500; color: var(--text-main);">Lock backup from automated deletion</span>
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="this.closest('.modal-backdrop').remove()">Cancel</button>
          <button class="btn-primary" id="btn-submit-backup"><i class="fa-solid fa-floppy-disk"></i> Start Backup</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('btn-submit-backup').onclick = async () => {
      const name = document.getElementById('backup-title-inp').value.trim();
      const ignoredFiles = document.getElementById('backup-ignored-inp').value.trim();
      const isLocked = document.getElementById('backup-locked-cb').checked;
      modal.remove();

      try {
        await window.api.createBackup(server.id, name, isLocked, ignoredFiles);
        this.showToast('Backup snapshot initiated successfully', 'success');
        this.loadBackups(server);
      } catch (err) {
        this.showToast(err.message, 'error');
      }
    };
  }

  // ======================== TAB: NETWORK ======================== //

  async renderNetworkTab(container, server) {
    container.innerHTML = `
      <div class="panel-section-box">
        <div class="section-head-row">
          <div>
            <h2 class="section-title"><i class="fa-solid fa-network-wired" style="color: var(--brand-cyan);"></i> Port Allocations & IP Networking</h2>
            <p style="font-size: 0.85rem; color: var(--text-dim); margin-top: 4px;">Assigned public endpoints and reverse proxies</p>
          </div>
          <button class="btn-primary" id="btn-assign-port"><i class="fa-solid fa-plus"></i> Assign New Port</button>
        </div>

        <div class="items-grid" id="network-allocs-grid">
          <div style="padding: 2rem; text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i> Loading port allocations...</div>
        </div>
      </div>
    `;

    document.getElementById('btn-assign-port').onclick = () => this.assignNewAllocation(server);
    await this.loadNetworkAllocations(server);
  }

  async loadNetworkAllocations(server) {
    const grid = document.getElementById('network-allocs-grid');
    if (!grid) return;
    try {
      const res = await window.api.getServerNetwork(server.id);
      const allocs = res.allocations || [];

      grid.innerHTML = allocs.map(a => `
        <div class="item-card ${a.isPrimary ? 'primary-alloc' : ''}">
          <div class="item-card-title">
            <span><i class="fa-solid ${a.isPrimary ? 'fa-star' : 'fa-network-wired'}" style="color: ${a.isPrimary ? '#f59e0b' : 'var(--brand-cyan)'}; margin-right: 6px;"></i> ${a.alias || a.ip + ':' + a.port}</span>
            <span class="status-badge ${a.isPrimary ? 'running' : 'stopping'}" style="font-size: 0.7rem;">${a.isPrimary ? 'Primary' : 'Secondary'}</span>
          </div>
          <div class="item-field-list" style="margin-top: 10px;">
            <div class="item-field"><span class="field-label">IPv4 Address</span><span class="field-val">${a.ip}</span></div>
            <div class="item-field"><span class="field-label">Port</span><span class="field-val" style="font-family: var(--font-mono);">${a.port}</span></div>
            <div class="item-field"><span class="field-label">Notes / Alias</span><span class="field-val">${a.notes || 'None'}</span></div>
          </div>
          <div style="display:flex; gap: 8px; margin-top: 12px;">
            <button class="btn-secondary" style="flex:1; justify-content:center;" onclick="navigator.clipboard.writeText('${a.alias || a.ip + ':' + a.port}'); app.showToast('Copied address!', 'success');">
              <i class="fa-regular fa-copy"></i> Copy
            </button>
            ${!a.isPrimary ? `
              <button class="btn-secondary btn-set-primary" data-alloc-id="${a.id}" title="Make Primary">
                <i class="fa-solid fa-star"></i> Set Primary
              </button>
              <button class="file-action-btn delete btn-delete-alloc" data-alloc-id="${a.id}" title="Unassign">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            ` : ''}
          </div>
        </div>
      `).join('');

      grid.querySelectorAll('.btn-set-primary').forEach(btn => {
        btn.onclick = async () => {
          const aId = btn.getAttribute('data-alloc-id');
          await window.api.setPrimaryNetwork(server.id, aId);
          this.showToast('Primary allocation updated', 'success');
          this.loadNetworkAllocations(server);
        };
      });

      grid.querySelectorAll('.btn-delete-alloc').forEach(btn => {
        btn.onclick = async () => {
          const aId = btn.getAttribute('data-alloc-id');
          if (confirm('Unassign this port allocation?')) {
            await window.api.deleteServerNetwork(server.id, aId);
            this.showToast('Port allocation released', 'success');
            this.loadNetworkAllocations(server);
          }
        };
      });
    } catch (err) {
      grid.innerHTML = `<div>${err.message}</div>`;
    }
  }

  async assignNewAllocation(server) {
    this.playSound('click');
    try {
      const created = await window.api.assignServerNetwork(server.id);
      this.showToast(`Assigned port ${created.port} successfully`, 'success');
      this.loadNetworkAllocations(server);
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  }

  // ======================== TAB: STARTUP ======================== //

  renderStartupTab(container, server) {
    const egg = this.eggs.find(e => e.id === server.eggId) || { variables: [], dockerImages: [] };
    const dockerImages = egg.dockerImages && egg.dockerImages.length ? egg.dockerImages : [server.dockerImage || egg.dockerImage || 'ghcr.io/pterodactyl/yolks:java_17'];

    container.innerHTML = `
      <div class="panel-section-box">
        <div class="section-head-row">
          <div>
            <h2 class="section-title"><i class="fa-solid fa-sliders" style="color: #38bdf8;"></i> Startup Parameters & Egg Config</h2>
            <p style="font-size: 0.85rem; color: var(--text-dim); margin-top: 4px;">Edit container startup command and environment variables</p>
          </div>
          <button class="btn-primary" id="btn-save-startup"><i class="fa-solid fa-floppy-disk"></i> Save Variables</button>
        </div>

        <div class="settings-group">
          <div class="form-group">
            <label class="form-label">Docker Container Image</label>
            <select class="form-input" id="startup-docker-img">
              ${dockerImages.map(img => `<option value="${img}" ${img === (server.dockerImage || egg.dockerImage) ? 'selected' : ''}>${img}</option>`).join('')}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Startup Command</label>
            <textarea class="form-input form-textarea" id="startup-command-input" style="font-family: var(--font-mono); font-size: 0.85rem;">${this.escapeHtml(server.startup)}</textarea>
            <span style="font-size: 0.75rem; color: var(--text-dim);">Available template variables: {{SERVER_MEMORY}}, {{SERVER_PORT}}, {{SERVER_JARFILE}}</span>
          </div>

          <div style="margin-top: 1rem;">
            <h3 style="font-size: 1rem; color: var(--text-main); margin-bottom: 1rem;">Egg Environment Variables</h3>
            <div class="items-grid">
              ${(egg.variables || []).map(v => `
                <div class="item-card">
                  <div class="form-group">
                    <label class="form-label">${this.escapeHtml(v.label)} <span style="font-family: var(--font-mono); color: var(--brand-cyan);">(${v.name})</span></label>
                    <input type="text" class="form-input egg-var-input" data-var="${v.name}" value="${this.escapeHtml(server.variables[v.name] || v.defaultValue)}">
                    <span style="font-size: 0.75rem; color: var(--text-dim);">${v.description}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-save-startup').onclick = async () => {
      this.playSound('click');
      const startup = document.getElementById('startup-command-input').value;
      const dockerImage = document.getElementById('startup-docker-img').value;
      const variables = {};
      document.querySelectorAll('.egg-var-input').forEach(inp => {
        variables[inp.getAttribute('data-var')] = inp.value;
      });

      try {
        await window.api.updateSettings(server.id, { startup, dockerImage, variables });
        server.startup = startup;
        server.dockerImage = dockerImage;
        server.variables = variables;
        this.showToast('Startup parameters updated successfully', 'success');
      } catch (err) {
        this.showToast(err.message, 'error');
      }
    };
  }

  // ======================== TAB: SETTINGS ======================== //

  renderSettingsTab(container, server) {
    const build = server.build || { memory: server.limits.memory, cpu: server.limits.cpu, disk: server.limits.disk, swap: 256 };

    container.innerHTML = `
      <div class="panel-section-box">
        <h2 class="section-title"><i class="fa-solid fa-sliders" style="color: #38bdf8;"></i> Server Information</h2>
        <div class="settings-group" style="margin-top: 1rem;">
          <div class="form-group">
            <label class="form-label">Server Display Name</label>
            <input type="text" class="form-input" id="setting-server-name" value="${this.escapeHtml(server.name)}">
          </div>
          <div class="form-group">
            <label class="form-label">Server Description</label>
            <input type="text" class="form-input" id="setting-server-desc" value="${this.escapeHtml(server.description || '')}">
          </div>
          <button class="btn-primary" id="btn-save-general-settings" style="width: fit-content;">Save General Settings</button>
        </div>
      </div>

      <div class="panel-section-box">
        <h2 class="section-title"><i class="fa-solid fa-network-wired" style="color: #10b981;"></i> SFTP Connection Details</h2>
        <p style="font-size: 0.85rem; color: var(--text-dim); margin: 6px 0 1rem 0;">Connect using FileZilla, Cyberduck, or WinSCP</p>
        <div class="item-field-list">
          <div class="item-field"><span class="field-label">SFTP Host</span><span class="field-val">${server.sftp.host}</span></div>
          <div class="item-field"><span class="field-label">Port</span><span class="field-val">${server.sftp.port}</span></div>
          <div class="item-field"><span class="field-label">Username</span><span class="field-val">${server.sftp.username}</span></div>
        </div>
        <a class="btn-secondary" href="sftp://${server.sftp.username}@${server.sftp.host}:${server.sftp.port}" style="margin-top: 12px; width: fit-content; text-decoration:none;">
          <i class="fa-solid fa-arrow-up-right-from-square"></i> Launch SFTP Client
        </a>
      </div>

      <div class="panel-section-box">
        <div class="section-head-row">
          <div>
            <h2 class="section-title"><i class="fa-solid fa-shuffle" style="color: #a855f7;"></i> Node Transfer</h2>
            <p style="font-size: 0.85rem; color: var(--text-dim); margin-top: 4px;">Relocate this container instance to a different Wings node cluster</p>
          </div>
          <button class="btn-primary" id="btn-transfer-node"><i class="fa-solid fa-truck-fast"></i> Transfer Node</button>
        </div>
      </div>

      <div class="danger-zone-box">
        <div class="danger-title"><i class="fa-solid fa-triangle-exclamation"></i> Danger Zone</div>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.25rem;">
          These operations are destructive. Reinstalling will wipe all current files and reload the clean egg template. Deleting will permanently remove this instance and all associated databases and snapshots.
        </p>
        <div style="display:flex; gap: 12px; flex-wrap:wrap;">
          <button class="btn-danger" id="btn-reinstall-server"><i class="fa-solid fa-rotate"></i> Reinstall Server</button>
          <button class="btn-danger" id="btn-delete-server" style="background:#ef4444; color:#fff;"><i class="fa-solid fa-trash-can"></i> Delete Server</button>
        </div>
      </div>
    `;

    document.getElementById('btn-save-general-settings').onclick = async () => {
      const name = document.getElementById('setting-server-name').value;
      const description = document.getElementById('setting-server-desc').value;
      try {
        await window.api.updateSettings(server.id, { name, description });
        server.name = name;
        server.description = description;
        this.showToast('Server settings updated', 'success');
        this.renderServerDetailLayout(server);
        this.renderActiveTabContent(server);
      } catch (err) {
        this.showToast(err.message, 'error');
      }
    };

    document.getElementById('btn-transfer-node').onclick = () => this.openNodeTransferModal(server);

    document.getElementById('btn-reinstall-server').onclick = async () => {
      if (confirm(`Are you sure you want to REINSTALL "${server.name}"? All files will be reset.`)) {
        await window.api.reinstallServer(server.id);
        this.showToast('Reinstall initiated', 'warn');
        this.navigate(`#server/${server.id}/console`);
      }
    };

    document.getElementById('btn-delete-server').onclick = async () => {
      const confirmation = prompt(`Type "${server.name}" to confirm permanent deletion:`);
      if (confirmation === server.name) {
        await window.api.deleteServer(server.id);
        this.showToast(`Server "${server.name}" was deleted`, 'success');
        this.navigate('#servers');
      } else if (confirmation !== null) {
        this.showToast('Server name did not match. Deletion cancelled.', 'warn');
      }
    };
  }

  openNodeTransferModal(server) {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';

    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <div class="modal-title"><i class="fa-solid fa-truck-fast" style="color: #a855f7;"></i> Transfer Server to Another Node</div>
          <button class="modal-close-btn" onclick="this.closest('.modal-backdrop').remove()">&times;</button>
        </div>
        <div class="modal-body">
          <p style="font-size: 0.88rem; color: var(--text-dim);">
            Transferring will pack the server's filesystem, migrate allocations to the destination Wings node, and unpack container volumes with zero data loss.
          </p>
          <div class="form-group" style="margin-top: 1rem;">
            <label class="form-label">Target Destination Node</label>
            <select class="form-input" id="target-node-select">
              ${this.nodes.filter(n => n.id !== server.nodeId).map(n => `
                <option value="${n.id}">${n.name} (${n.location})</option>
              `).join('')}
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="this.closest('.modal-backdrop').remove()">Cancel</button>
          <button class="btn-primary" id="btn-submit-transfer"><i class="fa-solid fa-rocket"></i> Begin Transfer</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('btn-submit-transfer').onclick = async () => {
      const targetNodeId = document.getElementById('target-node-select').value;
      modal.remove();
      this.showToast('Server migration started...', 'info');

      try {
        await window.api.transferServer(server.id, targetNodeId);
        this.showToast('Migration completed successfully', 'success');
        this.navigate(`#server/${server.id}/console`);
      } catch (err) {
        this.showToast(err.message, 'error');
      }
    };
  }

  // ======================== TAB: SERVER ACTIVITY ======================== //

  async renderServerActivityTab(container, server) {
    container.innerHTML = `
      <div class="panel-section-box">
        <div class="section-head-row">
          <div>
            <h2 class="section-title"><i class="fa-solid fa-clock-rotate-left" style="color: var(--brand-cyan);"></i> Server Audit & Activity Logs</h2>
            <p style="font-size: 0.85rem; color: var(--text-dim); margin-top: 4px;">Security trail of power actions, file modifications, and database operations</p>
          </div>
        </div>

        <div id="server-activity-container" style="overflow-x: auto; margin-top: 1rem;">
          <div style="padding: 2rem; text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i> Loading activity logs...</div>
        </div>
      </div>
    `;

    try {
      const logs = await window.api.getActivity(server.id);
      const target = document.getElementById('server-activity-container');
      if (!target) return;

      if (logs.length === 0) {
        target.innerHTML = `<div style="text-align:center; padding: 3rem; color: var(--text-dim);">No activity logged for this server yet.</div>`;
        return;
      }

      target.innerHTML = `
        <table class="activity-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Action</th>
              <th>User</th>
              <th>IP Address</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            ${logs.map(l => {
              const badgeClass = l.action.includes('power') ? 'power' : (l.action.includes('file') ? 'file' : (l.action.includes('command') ? 'command' : (l.action.includes('backup') ? 'backup' : 'admin')));
              return `
                <tr class="activity-row">
                  <td style="font-size: 0.8rem; color: var(--text-dim); font-family: var(--font-mono);">${new Date(l.timestamp).toLocaleString()}</td>
                  <td><span class="act-badge ${badgeClass}">${this.escapeHtml(l.action)}</span></td>
                  <td><span style="font-weight: 500;">${this.escapeHtml(l.user)}</span></td>
                  <td><span style="font-family: var(--font-mono); font-size: 0.8rem;">${this.escapeHtml(l.ip)}</span></td>
                  <td><span style="color: var(--text-muted);">${this.escapeHtml(l.description)}</span></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
    } catch (e) {}
  }

  // ======================== GLOBAL ACTIVITY VIEW ======================== //

  async renderGlobalActivityView() {
    const mainView = document.getElementById('main-content-view');
    if (!mainView) return;

    mainView.innerHTML = `
      <div style="margin-bottom: 2rem;">
        <h1 style="font-size: 1.8rem; font-weight: 800; color: var(--text-main); margin-bottom: 4px;">
          <i class="fa-solid fa-clock-rotate-left" style="color: var(--brand-cyan); margin-right: 8px;"></i> Cluster Security & Audit Logs
        </h1>
        <p style="font-size: 0.9rem; color: var(--text-dim);">Real-time audit trail of all panel operations, administrative changes, and container actions</p>
      </div>

      <div class="panel-section-box">
        <div id="global-activity-container" style="overflow-x: auto;">
          <div style="padding: 2rem; text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i> Loading audit trail...</div>
        </div>
      </div>
    `;

    try {
      const logs = await window.api.getActivity();
      const target = document.getElementById('global-activity-container');
      if (!target) return;

      target.innerHTML = `
        <table class="activity-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Action</th>
              <th>User</th>
              <th>Target Server</th>
              <th>IP Address</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            ${logs.map(l => {
              const badgeClass = l.action.includes('power') ? 'power' : (l.action.includes('file') ? 'file' : (l.action.includes('command') ? 'command' : (l.action.includes('backup') ? 'backup' : 'admin')));
              return `
                <tr class="activity-row">
                  <td style="font-size: 0.8rem; color: var(--text-dim); font-family: var(--font-mono);">${new Date(l.timestamp).toLocaleString()}</td>
                  <td><span class="act-badge ${badgeClass}">${this.escapeHtml(l.action)}</span></td>
                  <td><span style="font-weight: 500;">${this.escapeHtml(l.user)}</span></td>
                  <td><span style="color: var(--brand-cyan);">${this.escapeHtml(l.serverName || 'System / Admin')}</span></td>
                  <td><span style="font-family: var(--font-mono); font-size: 0.8rem;">${this.escapeHtml(l.ip)}</span></td>
                  <td><span style="color: var(--text-muted);">${this.escapeHtml(l.description)}</span></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
    } catch (e) {}
  }

  // ======================== ADMIN CONTROL CENTER ======================== //

  async renderAdminView() {
    const mainView = document.getElementById('main-content-view');
    if (!mainView) return;

    mainView.innerHTML = `
      <div style="margin-bottom: 1.5rem;">
        <h1 style="font-size: 1.8rem; font-weight: 800; color: var(--text-main); margin-bottom: 4px;">
          <i class="fa-solid fa-shield-halved" style="color: var(--brand-cyan); margin-right: 8px;"></i> Administrator Control Center
        </h1>
        <p style="font-size: 0.9rem; color: var(--text-dim);">SMOOTH x HOST Cluster Infrastructure, Wings Daemons, Nests & Eggs, Users, and Quotas</p>
      </div>

      <div class="admin-sub-tabs">
        <button class="admin-tab-btn ${this.adminSubTab === 'overview' ? 'active' : ''}" data-sub="overview"><i class="fa-solid fa-chart-line"></i> Overview</button>
        <button class="admin-tab-btn ${this.adminSubTab === 'nodes' ? 'active' : ''}" data-sub="nodes"><i class="fa-solid fa-server"></i> Nodes & Wings</button>
        <button class="admin-tab-btn ${this.adminSubTab === 'servers' ? 'active' : ''}" data-sub="servers"><i class="fa-solid fa-database"></i> Servers & Quotas</button>
        <button class="admin-tab-btn ${this.adminSubTab === 'nests' ? 'active' : ''}" data-sub="nests"><i class="fa-solid fa-egg"></i> Nests & Eggs</button>
        <button class="admin-tab-btn ${this.adminSubTab === 'users' ? 'active' : ''}" data-sub="users"><i class="fa-solid fa-user-gear"></i> Users</button>
        <button class="admin-tab-btn ${this.adminSubTab === 'apikeys' ? 'active' : ''}" data-sub="apikeys"><i class="fa-solid fa-key"></i> Application API</button>
      </div>

      <div id="admin-subview-content"></div>
    `;

    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
      btn.onclick = () => {
        const sub = btn.getAttribute('data-sub');
        this.navigate(`#admin/${sub}`);
      };
    });

    const subContent = document.getElementById('admin-subview-content');
    if (this.adminSubTab === 'overview') await this.renderAdminOverviewTab(subContent);
    else if (this.adminSubTab === 'nodes') await this.renderAdminNodesTab(subContent);
    else if (this.adminSubTab === 'servers') await this.renderAdminServersTab(subContent);
    else if (this.adminSubTab === 'nests') await this.renderAdminEggsTab(subContent);
    else if (this.adminSubTab === 'users') await this.renderAdminUsersTab(subContent);
    else if (this.adminSubTab === 'apikeys') await this.renderAdminApiKeysTab(subContent);
  }

  async renderAdminOverviewTab(container) {
    const totalServers = this.servers.length;
    const runningServers = this.servers.filter(s => s.status === 'running').length;
    const totalRAM = (this.nodes.reduce((a, n) => a + n.memoryTotal, 0) / 1024).toFixed(1);
    const allocatedRAM = (this.servers.reduce((a, s) => a + s.limits.memory, 0) / 1024).toFixed(1);
    const totalDisk = (this.nodes.reduce((a, n) => a + n.diskTotal, 0) / 1024).toFixed(1);
    const allocatedDisk = (this.servers.reduce((a, s) => a + s.limits.disk, 0) / 1024).toFixed(1);

    container.innerHTML = `
      <div class="metrics-ribbon" style="margin-bottom: 1.5rem;">
        <div class="metric-card">
          <div class="metric-icon-box cyan"><i class="fa-solid fa-server"></i></div>
          <div class="metric-data">
            <span class="metric-label">Wings Nodes</span>
            <span class="metric-value">${this.nodes.length} Online</span>
            <span class="metric-sub">Healthy Heartbeats</span>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon-box green"><i class="fa-solid fa-cubes"></i></div>
          <div class="metric-data">
            <span class="metric-label">Servers Deployed</span>
            <span class="metric-value">${runningServers} / ${totalServers}</span>
            <span class="metric-sub">${totalServers - runningServers} Offline</span>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon-box purple"><i class="fa-solid fa-memory"></i></div>
          <div class="metric-data">
            <span class="metric-label">Cluster RAM Quota</span>
            <span class="metric-value">${allocatedRAM} / ${totalRAM} GB</span>
            <span class="metric-sub">Committed Allocation</span>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon-box amber"><i class="fa-solid fa-hard-drive"></i></div>
          <div class="metric-data">
            <span class="metric-label">Storage Quota</span>
            <span class="metric-value">${allocatedDisk} / ${totalDisk} GB</span>
            <span class="metric-sub">NVMe SSD Pool</span>
          </div>
        </div>
      </div>

      <div class="panel-section-box">
        <h2 class="section-title"><i class="fa-solid fa-gauge-high" style="color: var(--brand-cyan);"></i> System Health & Wings Diagnostics</h2>
        <div class="item-field-list" style="margin-top: 1rem;">
          <div class="item-field"><span class="field-label">Panel Version</span><span class="field-val">SMOOTH x HOST v2.4.0 (Enterprise Architecture)</span></div>
          <div class="item-field"><span class="field-label">Wings Engine Core</span><span class="field-val" style="color:#10b981;">v1.11.12 (Pterodactyl Daemon Spec)</span></div>
          <div class="item-field"><span class="field-label">Environment Architecture</span><span class="field-val">Dual-Mode (WebSocket Core & HTTP Edge Fallback)</span></div>
          <div class="item-field"><span class="field-label">Security Protocol</span><span class="field-val" style="color:#10b981;">TLS 1.3 / AES-256 Volume Encryption</span></div>
        </div>
      </div>
    `;
  }

  async renderAdminNodesTab(container) {
    this.nodes = await window.api.getNodes();

    container.innerHTML = `
      <div class="panel-section-box">
        <div class="section-head-row">
          <h2 class="section-title"><i class="fa-solid fa-server" style="color: var(--brand-cyan);"></i> Active Wings Nodes (${this.nodes.length})</h2>
          <button class="btn-primary" id="btn-create-node"><i class="fa-solid fa-plus"></i> Create Node</button>
        </div>

        <div class="items-grid">
          ${this.nodes.map(n => {
            const memPct = Math.round((n.memoryAllocated / n.memoryTotal) * 100) || 0;
            const diskPct = Math.round((n.diskAllocated / n.diskTotal) * 100) || 0;
            return `
              <div class="item-card">
                <div>
                  <div class="item-card-title">
                    <span><i class="fa-solid fa-cube" style="color: var(--brand-cyan); margin-right: 6px;"></i> ${this.escapeHtml(n.name)}</span>
                    <span class="system-status-pill"><span class="pulse-dot"></span> ${n.status}</span>
                  </div>
                  <div class="item-field-list" style="margin-top: 10px;">
                    <div class="item-field"><span class="field-label">FQDN / Address</span><span class="field-val">${n.fqdn}</span></div>
                    <div class="item-field"><span class="field-label">Daemon Port</span><span class="field-val">${n.daemonPort} (${n.scheme || 'https'})</span></div>
                    <div class="item-field"><span class="field-label">Location</span><span class="field-val">${n.location}</span></div>
                    <div class="item-field"><span class="field-label">Latency</span><span class="field-val" style="color:#10b981;">${n.ping} ms</span></div>
                    <div class="item-field"><span class="field-label">Memory Allocation</span><span class="field-val">${(n.memoryAllocated/1024).toFixed(1)} / ${(n.memoryTotal/1024).toFixed(1)} GB (${memPct}%)</span></div>
                    <div class="item-field"><span class="field-label">Disk Allocation</span><span class="field-val">${(n.diskAllocated/1024).toFixed(1)} / ${(n.diskTotal/1024).toFixed(1)} GB (${diskPct}%)</span></div>
                  </div>
                </div>
                <div style="display:flex; gap: 8px; margin-top: 12px; flex-wrap:wrap;">
                  <button class="btn-primary btn-node-deploy" data-node-id="${n.id}" style="flex: 1 1 100%; justify-content:center; padding: 7px 12px; font-size: 0.8rem;">
                    <i class="fa-solid fa-terminal"></i> Auto-Deploy Command (VPS Connect)
                  </button>
                  <button class="btn-secondary btn-node-allocs" data-node-id="${n.id}" style="flex:1; justify-content:center;"><i class="fa-solid fa-network-wired"></i> Ports</button>
                  <button class="btn-secondary btn-node-config" data-node-id="${n.id}" style="flex:1; justify-content:center;"><i class="fa-solid fa-file-code"></i> Config</button>
                  <button class="file-action-btn delete btn-delete-node" data-node-id="${n.id}" title="Delete Node"><i class="fa-solid fa-trash-can"></i></button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    document.getElementById('btn-create-node')?.addEventListener('click', () => this.openCreateNodeModal());

    container.querySelectorAll('.btn-node-deploy').forEach(btn => {
      btn.onclick = async () => {
        const nId = btn.getAttribute('data-node-id');
        const node = this.nodes.find(n => n.id === nId);
        if (node) this.openNodeDeployModal(node);
      };
    });

    container.querySelectorAll('.btn-node-config').forEach(btn => {
      btn.onclick = async () => {
        const nId = btn.getAttribute('data-node-id');
        const node = this.nodes.find(n => n.id === nId);
        if (node) this.openNodeConfigModal(node);
      };
    });

    container.querySelectorAll('.btn-node-allocs').forEach(btn => {
      btn.onclick = async () => {
        const nId = btn.getAttribute('data-node-id');
        const node = this.nodes.find(n => n.id === nId);
        if (node) this.openNodeAllocationsModal(node);
      };
    });

    container.querySelectorAll('.btn-delete-node').forEach(btn => {
      btn.onclick = async () => {
        const nId = btn.getAttribute('data-node-id');
        if (confirm('Delete this Wings node?')) {
          try {
            await window.api.deleteNode(nId);
            this.showToast('Node deleted', 'success');
            await this.renderAdminNodesTab(container);
          } catch (err) {
            this.showToast(err.message, 'error');
          }
        }
      };
    });
  }

  async openNodeDeployModal(node) {
    try {
      this.playSound('click');
      const res = await window.api.getNodeDeployCommand(node.id);
      const modal = document.createElement('div');
      modal.className = 'modal-backdrop';

      modal.innerHTML = `
        <div class="modal-card" style="max-width: 680px;">
          <div class="modal-header">
            <div class="modal-title"><i class="fa-solid fa-terminal" style="color: var(--brand-cyan);"></i> Connect VPS to Node: ${this.escapeHtml(node.name)}</div>
            <button class="modal-close-btn" onclick="this.closest('.modal-backdrop').remove()">&times;</button>
          </div>
          <div class="modal-body">
            <p style="font-size: 0.88rem; color: var(--text-dim); margin-bottom: 1rem;">
              Connect your Ubuntu/Debian/CentOS Linux VPS with this panel in 1 step using the auto-installer command below (similar to <code>pterodactyl-installer.se</code>):
            </p>

            <div class="form-group">
              <label class="form-label" style="display:flex; justify-content:space-between; align-items:center;">
                <span>1-Click VPS Auto-Install & Connect Command:</span>
                <span class="search-shortcut-pill">BASH</span>
              </label>
              <div style="display:flex; gap: 8px;">
                <input type="text" class="form-input" id="deploy-cmd-inp" style="font-family: var(--font-mono); font-size: 0.82rem; color: var(--brand-cyan);" value="${this.escapeHtml(res.automatedCommand)}" readonly>
                <button class="btn-primary" id="btn-copy-deploy-cmd" style="white-space: nowrap;"><i class="fa-regular fa-copy"></i> Copy</button>
              </div>
            </div>

            <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-subtle); border-radius: 10px; padding: 14px; margin-top: 1rem;">
              <h4 style="font-size: 0.92rem; color: var(--text-main); margin-bottom: 8px;"><i class="fa-solid fa-list-ol" style="color: #38bdf8; margin-right: 6px;"></i> How to run on your VPS:</h4>
              <ol style="padding-left: 20px; font-size: 0.82rem; color: var(--text-muted); line-height: 1.8;">
                <li>Open your terminal and connect to your VPS via SSH: <code>ssh root@your-vps-ip</code></li>
                <li>Paste the copied command above and press <b>Enter</b>.</li>
                <li>The script will automatically install Docker, set up the Wings daemon background service, and connect this VPS to your panel!</li>
                <li>Your node will automatically report <b>Online</b> and show real CPU/RAM/Disk stats!</li>
              </ol>
            </div>

            <div style="margin-top: 1rem; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size: 0.78rem; color: var(--text-dim); font-family: var(--font-mono);">Token: ${res.token}</span>
              <button class="btn-secondary" style="font-size: 0.75rem;" onclick="app.openNodeConfigModal(app.nodes.find(n => n.id === '${node.id}'))"><i class="fa-solid fa-file-code"></i> View Raw config.yml</button>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-primary" onclick="this.closest('.modal-backdrop').remove()">Done</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      document.getElementById('btn-copy-deploy-cmd').onclick = () => {
        const inp = document.getElementById('deploy-cmd-inp');
        navigator.clipboard.writeText(inp.value);
        this.showToast('VPS Command copied to clipboard!', 'success');
      };
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  }

  openCreateNodeModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';

    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <div class="modal-title"><i class="fa-solid fa-server" style="color: var(--brand-cyan);"></i> Create Wings Node</div>
          <button class="modal-close-btn" onclick="this.closest('.modal-backdrop').remove()">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Node Name</label>
            <input type="text" class="form-input" id="node-name" placeholder="e.g. EU-West-02 London Core">
          </div>
          <div class="form-group">
            <label class="form-label">Location / Region</label>
            <input type="text" class="form-input" id="node-loc" value="Europe / United Kingdom">
          </div>
          <div class="form-group">
            <label class="form-label">FQDN / Hostname</label>
            <input type="text" class="form-input" id="node-fqdn" placeholder="node-02.smoothhost.cloud">
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-group">
              <label class="form-label">Daemon Port</label>
              <input type="number" class="form-input" id="node-dport" value="8080">
            </div>
            <div class="form-group">
              <label class="form-label">SFTP Port</label>
              <input type="number" class="form-input" id="node-sport" value="2022">
            </div>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-group">
              <label class="form-label">Total Memory (MB)</label>
              <input type="number" class="form-input" id="node-mem" value="65536">
            </div>
            <div class="form-group">
              <label class="form-label">Total NVMe Disk (MB)</label>
              <input type="number" class="form-input" id="node-disk" value="2048000">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="this.closest('.modal-backdrop').remove()">Cancel</button>
          <button class="btn-primary" id="btn-submit-node"><i class="fa-solid fa-plus"></i> Create Node</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('btn-submit-node').onclick = async () => {
      const name = document.getElementById('node-name').value.trim();
      const location = document.getElementById('node-loc').value.trim();
      const fqdn = document.getElementById('node-fqdn').value.trim();
      const daemonPort = document.getElementById('node-dport').value;
      const sftpPort = document.getElementById('node-sport').value;
      const memoryTotal = document.getElementById('node-mem').value;
      const diskTotal = document.getElementById('node-disk').value;

      if (!name || !fqdn) {
        this.showToast('Name and FQDN are required', 'warn');
        return;
      }

      modal.remove();
      try {
        await window.api.createNode({ name, location, fqdn, daemonPort, sftpPort, memoryTotal, diskTotal });
        this.showToast('Node created successfully', 'success');
        this.renderAdminView();
      } catch (err) {
        this.showToast(err.message, 'error');
      }
    };
  }

  async openNodeConfigModal(node) {
    try {
      const res = await window.api.getNodeConfig(node.id);
      const modal = document.createElement('div');
      modal.className = 'modal-backdrop';

      modal.innerHTML = `
        <div class="modal-card" style="max-width: 650px;">
          <div class="modal-header">
            <div class="modal-title"><i class="fa-solid fa-file-code" style="color: var(--brand-cyan);"></i> Wings Configuration: ${this.escapeHtml(node.name)}</div>
            <button class="modal-close-btn" onclick="this.closest('.modal-backdrop').remove()">&times;</button>
          </div>
          <div class="modal-body">
            <p style="font-size: 0.82rem; color: var(--text-dim); margin-bottom: 8px;">
              Place this configuration file at <code>/etc/pterodactyl/config.yml</code> on your server to link Wings to this panel.
            </p>
            <textarea class="form-input form-textarea" style="height: 240px; font-family: var(--font-mono); font-size: 0.8rem;" readonly>${this.escapeHtml(res.yaml)}</textarea>
          </div>
          <div class="modal-footer">
            <button class="btn-primary" onclick="navigator.clipboard.writeText('${this.escapeHtml(res.yaml).replace(/'/g, "\\'")}'); app.showToast('Configuration copied to clipboard!', 'success');"><i class="fa-regular fa-copy"></i> Copy YAML</button>
            <button class="btn-secondary" onclick="this.closest('.modal-backdrop').remove()">Close</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    } catch (e) {}
  }

  async openNodeAllocationsModal(node) {
    try {
      const allocs = await window.api.getNodeAllocations(node.id);
      const modal = document.createElement('div');
      modal.className = 'modal-backdrop';

      modal.innerHTML = `
        <div class="modal-card" style="max-width: 700px;">
          <div class="modal-header">
            <div class="modal-title"><i class="fa-solid fa-network-wired" style="color: var(--brand-cyan);"></i> Port Allocations: ${this.escapeHtml(node.name)}</div>
            <button class="modal-close-btn" onclick="this.closest('.modal-backdrop').remove()">&times;</button>
          </div>
          <div class="modal-body">
            <div style="background: rgba(255,255,255,0.02); padding: 12px; border-radius: 8px; border: 1px solid var(--border-subtle); margin-bottom: 1rem;">
              <h4 style="font-size: 0.88rem; color: var(--text-main); margin-bottom: 8px;">Assign IP & Port Range</h4>
              <div style="display:grid; grid-template-columns: 2fr 2fr 1fr; gap: 8px;">
                <input type="text" class="form-input" id="new-alloc-ip" value="${node.fqdn.replace(/^[a-z0-9-]+\./, '198.51.')}" placeholder="IP">
                <input type="text" class="form-input" id="new-alloc-ports" placeholder="Ports (e.g. 25570-25580)">
                <button class="btn-primary" id="btn-submit-allocs">Generate</button>
              </div>
            </div>

            <div style="max-height: 250px; overflow-y:auto;">
              <table class="file-table">
                <thead>
                  <tr>
                    <th>IP</th>
                    <th>Port</th>
                    <th>Status</th>
                    <th>Assigned Server</th>
                  </tr>
                </thead>
                <tbody>
                  ${allocs.map(a => `
                    <tr>
                      <td>${a.ip}</td>
                      <td><span style="font-family: var(--font-mono);">${a.port}</span></td>
                      <td><span class="status-badge ${a.assignedServerId ? 'running' : 'stopping'}">${a.assignedServerId ? 'Assigned' : 'Free'}</span></td>
                      <td><span style="color: var(--brand-cyan);">${a.assignedServerId || '-'}</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" onclick="this.closest('.modal-backdrop').remove()">Close</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      document.getElementById('btn-submit-allocs').onclick = async () => {
        const ip = document.getElementById('new-alloc-ip').value.trim();
        const ports = document.getElementById('new-alloc-ports').value.trim();
        if (!ports) return;

        try {
          const res = await window.api.createNodeAllocations(node.id, { ip, ports });
          this.showToast(`Generated ${res.count} allocations`, 'success');
          modal.remove();
          this.openNodeAllocationsModal(node);
        } catch (err) {
          this.showToast(err.message, 'error');
        }
      };
    } catch (e) {}
  }

  // Admin Servers & Build Quotas
  async renderAdminServersTab(container) {
    this.servers = await window.api.getServers();

    container.innerHTML = `
      <div class="panel-section-box">
        <div class="section-head-row">
          <h2 class="section-title"><i class="fa-solid fa-server" style="color: var(--brand-cyan);"></i> All Cluster Servers (${this.servers.length})</h2>
          <button class="btn-primary" onclick="app.openCreateServerModal()"><i class="fa-solid fa-plus"></i> New Server</button>
        </div>

        <div style="overflow-x: auto; margin-top: 1rem;">
          <table class="activity-table">
            <thead>
              <tr>
                <th>Server Name</th>
                <th>Node</th>
                <th>Status</th>
                <th>RAM Quota</th>
                <th>CPU Quota</th>
                <th>Disk</th>
                <th style="text-align: right;">Build & Actions</th>
              </tr>
            </thead>
            <tbody>
              ${this.servers.map(s => {
                const node = this.nodes.find(n => n.id === s.nodeId) || { name: 'Node' };
                return `
                  <tr class="activity-row">
                    <td>
                      <div style="font-weight: 700; color: var(--text-main);">${this.escapeHtml(s.name)}</div>
                      <div style="font-size: 0.72rem; color: var(--text-dim);">${s.uuid.substring(0, 8)}</div>
                    </td>
                    <td><span>${node.name}</span></td>
                    <td><span class="status-badge ${s.isSuspended ? 'offline' : s.status}">${s.isSuspended ? 'SUSPENDED' : s.status}</span></td>
                    <td><span style="font-family: var(--font-mono);">${s.limits.memory} MB</span></td>
                    <td><span style="font-family: var(--font-mono);">${s.limits.cpu}%</span></td>
                    <td><span style="font-family: var(--font-mono);">${s.limits.disk} MB</span></td>
                    <td style="text-align: right;">
                      <div style="display:flex; justify-content: flex-end; gap: 6px;">
                        <button class="file-action-btn edit-build" data-srv-id="${s.id}" title="Build Configuration"><i class="fa-solid fa-sliders"></i></button>
                        <button class="file-action-btn toggle-suspend" data-srv-id="${s.id}" title="${s.isSuspended ? 'Unsuspend Server' : 'Suspend Server'}">
                          <i class="fa-solid ${s.isSuspended ? 'fa-unlock' : 'fa-ban'}" style="color: ${s.isSuspended ? '#10b981' : '#f59e0b'};"></i>
                        </button>
                        <a class="file-action-btn" href="#server/${s.id}/console" title="Open Console"><i class="fa-solid fa-terminal"></i></a>
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.querySelectorAll('.file-action-btn.edit-build').forEach(btn => {
      btn.onclick = () => {
        const sId = btn.getAttribute('data-srv-id');
        const s = this.servers.find(srv => srv.id === sId);
        if (s) this.openServerBuildModal(s);
      };
    });

    container.querySelectorAll('.file-action-btn.toggle-suspend').forEach(btn => {
      btn.onclick = async () => {
        const sId = btn.getAttribute('data-srv-id');
        const res = await window.api.toggleServerSuspension(sId);
        this.showToast(`Server ${res.isSuspended ? 'Suspended' : 'Unsuspended'}`, 'info');
        await this.renderAdminServersTab(container);
      };
    });
  }

  openServerBuildModal(server) {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    const build = server.build || { memory: server.limits.memory, cpu: server.limits.cpu, disk: server.limits.disk, swap: 256, io: 500, oomKiller: true };

    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <div class="modal-title"><i class="fa-solid fa-microchip" style="color: var(--brand-cyan);"></i> Modify Build Limits: ${this.escapeHtml(server.name)}</div>
          <button class="modal-close-btn" onclick="this.closest('.modal-backdrop').remove()">&times;</button>
        </div>
        <div class="modal-body">
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-group">
              <label class="form-label">Memory Limit (MB)</label>
              <input type="number" class="form-input" id="build-mem" value="${build.memory}">
            </div>
            <div class="form-group">
              <label class="form-label">Swap (MB)</label>
              <input type="number" class="form-input" id="build-swap" value="${build.swap || 0}">
            </div>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-group">
              <label class="form-label">CPU Limit (%)</label>
              <input type="number" class="form-input" id="build-cpu" value="${build.cpu}">
            </div>
            <div class="form-group">
              <label class="form-label">NVMe Storage (MB)</label>
              <input type="number" class="form-input" id="build-disk" value="${build.disk}">
            </div>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-group">
              <label class="form-label">Block IO Weight</label>
              <input type="number" class="form-input" id="build-io" value="${build.io || 500}">
            </div>
            <div class="form-group" style="display:flex; align-items:center; margin-top: 1.5rem;">
              <label class="perm-item-label" style="background:transparent; padding:0;">
                <input type="checkbox" id="build-oom" ${build.oomKiller !== false ? 'checked' : ''}>
                <span style="font-weight: 500; color: var(--text-main);">Enable OOM Killer</span>
              </label>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="this.closest('.modal-backdrop').remove()">Cancel</button>
          <button class="btn-primary" id="btn-save-build"><i class="fa-solid fa-floppy-disk"></i> Update Build</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('btn-save-build').onclick = async () => {
      const memory = Number(document.getElementById('build-mem').value);
      const swap = Number(document.getElementById('build-swap').value);
      const cpu = Number(document.getElementById('build-cpu').value);
      const disk = Number(document.getElementById('build-disk').value);
      const io = Number(document.getElementById('build-io').value);
      const oomKiller = document.getElementById('build-oom').checked;

      modal.remove();
      try {
        await window.api.updateServerBuild(server.id, { memory, swap, cpu, disk, io, oomKiller });
        this.showToast('Build limits updated', 'success');
        this.renderAdminView();
      } catch (err) {
        this.showToast(err.message, 'error');
      }
    };
  }

  // Admin Nests & Eggs
  async renderAdminEggsTab(container) {
    this.eggs = await window.api.getEggs();

    container.innerHTML = `
      <div class="panel-section-box">
        <div class="section-head-row">
          <h2 class="section-title"><i class="fa-solid fa-egg" style="color: #f59e0b;"></i> Supported Nests & Egg Templates (${this.eggs.length})</h2>
          <div style="display:flex; gap: 8px;">
            <button class="btn-secondary" id="btn-import-egg"><i class="fa-solid fa-file-import"></i> Import JSON</button>
            <button class="btn-primary" id="btn-create-egg"><i class="fa-solid fa-plus"></i> New Egg</button>
          </div>
        </div>

        <div class="items-grid">
          ${this.eggs.map(e => `
            <div class="item-card">
              <div class="item-card-title">
                <span><i class="fa-solid ${e.icon}" style="color: ${e.color}; margin-right: 6px;"></i> ${this.escapeHtml(e.name)}</span>
                <span class="status-badge running" style="font-size: 0.7rem;">${e.nest}</span>
              </div>
              <div class="item-field-list" style="margin-top: 10px;">
                <div class="item-field"><span class="field-label">Primary Docker</span><span class="field-val" style="font-size: 0.72rem;">${e.dockerImage}</span></div>
                <div class="item-field"><span class="field-label">Available Images</span><span class="field-val">${(e.dockerImages || []).length} registered</span></div>
                <div class="item-field"><span class="field-label">Variables</span><span class="field-val">${(e.variables || []).length} configured</span></div>
              </div>
              <div style="display:flex; gap: 8px; margin-top: 12px;">
                <a class="btn-secondary" href="/api/eggs/${e.id}/export" style="flex:1; justify-content:center; text-decoration:none;"><i class="fa-solid fa-download"></i> Export JSON</a>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    document.getElementById('btn-import-egg')?.addEventListener('click', () => this.openImportEggModal());
    document.getElementById('btn-create-egg')?.addEventListener('click', () => this.openCreateEggModal());
  }

  openCreateEggModal() {
    const nest = prompt('Nest Name (e.g. Minecraft, Discord Bots, Steam Games):', 'Minecraft');
    if (!nest) return;
    const name = prompt('Egg Display Name (e.g. Spigot 1.20, Purpur):');
    if (!name) return;
    const startup = prompt('Startup Command:', 'java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar server.jar nogui');
    if (!startup) return;

    window.api.createEgg({ nest, name, startup })
      .then(() => {
        this.showToast('Egg created successfully', 'success');
        this.renderAdminView();
      })
      .catch(err => this.showToast(err.message, 'error'));
  }

  openImportEggModal() {
    const jsonStr = prompt('Paste Pterodactyl Egg JSON contents here:');
    if (!jsonStr) return;

    try {
      const parsed = JSON.parse(jsonStr);
      window.api.importEgg(parsed)
        .then(() => {
          this.showToast('Egg imported successfully', 'success');
          this.renderAdminView();
        })
        .catch(err => this.showToast(err.message, 'error'));
    } catch (e) {
      this.showToast('Invalid JSON provided: ' + e.message, 'error');
    }
  }

  // Admin Users
  async renderAdminUsersTab(container) {
    const users = await window.api.getAdminUsers();

    container.innerHTML = `
      <div class="panel-section-box">
        <div class="section-head-row">
          <h2 class="section-title"><i class="fa-solid fa-user-gear" style="color: #10b981;"></i> Panel Accounts & Role Management (${users.length})</h2>
          <button class="btn-primary" id="btn-create-admin-user"><i class="fa-solid fa-user-plus"></i> Create User</button>
        </div>

        <div style="overflow-x: auto; margin-top: 1rem;">
          <table class="activity-table">
            <thead>
              <tr>
                <th>User / Avatar</th>
                <th>Email</th>
                <th>Role</th>
                <th>2FA</th>
                <th>Registered</th>
                <th style="text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${users.map(u => `
                <tr class="activity-row">
                  <td>
                    <div style="display:flex; align-items:center; gap: 8px;">
                      <div class="user-avatar" style="width: 26px; height: 26px; font-size: 0.72rem;">${u.avatar || 'US'}</div>
                      <span style="font-weight: 700; color: var(--text-main);">${this.escapeHtml(u.username)}</span>
                    </div>
                  </td>
                  <td><span>${this.escapeHtml(u.email)}</span></td>
                  <td>
                    <span class="badge-role" style="${u.rootAdmin ? '' : 'background:rgba(255,255,255,0.06); color:var(--text-main); border-color:transparent;'}">
                      ${u.rootAdmin ? '<i class="fa-solid fa-crown"></i>' : ''} ${u.role}
                    </span>
                  </td>
                  <td><span style="color: ${u.twoFactorEnabled ? '#10b981' : '#f59e0b'}; font-size: 0.8rem;">${u.twoFactorEnabled ? 'Enabled' : 'Disabled'}</span></td>
                  <td><span style="font-size: 0.8rem; color: var(--text-dim);">${new Date(u.createdAt).toLocaleDateString()}</span></td>
                  <td style="text-align: right;">
                    <button class="file-action-btn delete btn-delete-user" data-user-id="${u.id}"><i class="fa-solid fa-trash-can"></i></button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('btn-create-admin-user')?.addEventListener('click', () => {
      const email = prompt('Enter new user email:');
      if (!email) return;
      const username = prompt('Enter username:', email.split('@')[0]);
      if (!username) return;
      const rootAdmin = confirm('Grant Root Administrator privileges?');

      window.api.createAdminUser({ email, username, rootAdmin })
        .then(() => {
          this.showToast('User created successfully', 'success');
          this.renderAdminUsersTab(container);
        })
        .catch(err => this.showToast(err.message, 'error'));
    });

    container.querySelectorAll('.btn-delete-user').forEach(btn => {
      btn.onclick = async () => {
        const uId = btn.getAttribute('data-user-id');
        if (confirm('Delete this user account?')) {
          try {
            await window.api.deleteAdminUser(uId);
            this.showToast('User deleted', 'success');
            await this.renderAdminUsersTab(container);
          } catch (err) {
            this.showToast(err.message, 'error');
          }
        }
      };
    });
  }

  // Admin API Keys
  async renderAdminApiKeysTab(container) {
    const keys = await window.api.getApplicationApiKeys();

    container.innerHTML = `
      <div class="panel-section-box">
        <div class="section-head-row">
          <div>
            <h2 class="section-title"><i class="fa-solid fa-key" style="color: var(--brand-cyan);"></i> Application API Credentials</h2>
            <p style="font-size: 0.85rem; color: var(--text-dim); margin-top: 4px;">Tokens for WHMCS, Discord bots, and external orchestration</p>
          </div>
          <button class="btn-primary" id="btn-create-app-key"><i class="fa-solid fa-plus"></i> Generate Token</button>
        </div>

        <div class="items-grid" style="margin-top: 1rem;">
          ${keys.map(k => `
            <div class="item-card">
              <div class="item-card-title">
                <span><i class="fa-solid fa-key" style="color: var(--brand-cyan); margin-right: 6px;"></i> ${this.escapeHtml(k.description)}</span>
                <button class="file-action-btn delete btn-delete-app-key" data-key-id="${k.id}"><i class="fa-solid fa-trash-can"></i></button>
              </div>
              <div class="item-field-list" style="margin-top: 10px;">
                <div class="item-field"><span class="field-label">Token Identifier</span><span class="field-val" style="font-family: var(--font-mono);">${k.identifier}</span></div>
                <div class="item-field"><span class="field-label">Allowed IPs</span><span class="field-val">${k.allowedIps && k.allowedIps.length ? k.allowedIps.join(', ') : 'Any IP'}</span></div>
                <div class="item-field"><span class="field-label">Last Used</span><span class="field-val" style="color: var(--text-muted);">${k.lastUsed}</span></div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    document.getElementById('btn-create-app-key')?.addEventListener('click', () => {
      const desc = prompt('Token Description (e.g. Discord Bot, WHMCS):', 'Automation Integration');
      if (!desc) return;
      window.api.createApplicationApiKey({ description: desc })
        .then(() => {
          this.showToast('Application API token generated', 'success');
          this.renderAdminApiKeysTab(container);
        })
        .catch(err => this.showToast(err.message, 'error'));
    });

    container.querySelectorAll('.btn-delete-app-key').forEach(btn => {
      btn.onclick = async () => {
        const kId = btn.getAttribute('data-key-id');
        await window.api.deleteApplicationApiKey(kId);
        this.showToast('Token revoked', 'success');
        await this.renderAdminApiKeysTab(container);
      };
    });
  }

  // ======================== USER ACCOUNT CENTER ======================== //

  async renderAccountView() {
    const mainView = document.getElementById('main-content-view');
    if (!mainView) return;

    this.accountUser = await window.api.getAccount();

    mainView.innerHTML = `
      <div style="margin-bottom: 1.5rem;">
        <h1 style="font-size: 1.8rem; font-weight: 800; color: var(--text-main); margin-bottom: 4px;">
          <i class="fa-solid fa-user-gear" style="color: var(--brand-cyan); margin-right: 8px;"></i> User Account Settings
        </h1>
        <p style="font-size: 0.9rem; color: var(--text-dim);">Profile details, password security, 2-Factor Authentication, and Client API keys</p>
      </div>

      <div class="admin-sub-tabs">
        <button class="admin-tab-btn ${this.accountSubTab === 'profile' ? 'active' : ''}" data-acc="profile"><i class="fa-solid fa-id-card"></i> Profile & Security</button>
        <button class="admin-tab-btn ${this.accountSubTab === 'api-keys' ? 'active' : ''}" data-acc="api-keys"><i class="fa-solid fa-key"></i> Client API Keys</button>
        <button class="admin-tab-btn ${this.accountSubTab === 'ssh-keys' ? 'active' : ''}" data-acc="ssh-keys"><i class="fa-solid fa-terminal"></i> SSH Keys (SFTP)</button>
      </div>

      <div id="account-subview-content"></div>
    `;

    document.querySelectorAll('.admin-tab-btn[data-acc]').forEach(btn => {
      btn.onclick = () => {
        const sub = btn.getAttribute('data-acc');
        this.navigate(`#account/${sub}`);
      };
    });

    const subContent = document.getElementById('account-subview-content');
    if (this.accountSubTab === 'profile') this.renderAccountProfileTab(subContent);
    else if (this.accountSubTab === 'api-keys') this.renderAccountApiKeysTab(subContent);
    else if (this.accountSubTab === 'ssh-keys') this.renderAccountSshKeysTab(subContent);
  }

  renderAccountProfileTab(container) {
    const u = this.accountUser || { username: 'admin', email: 'admin@smoothhost.cloud' };

    container.innerHTML = `
      <div class="panel-section-box">
        <h2 class="section-title"><i class="fa-solid fa-user-pen" style="color: var(--brand-cyan);"></i> Profile Information</h2>
        <div class="settings-group" style="margin-top: 1rem;">
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-group">
              <label class="form-label">Username</label>
              <input type="text" class="form-input" id="acc-username" value="${this.escapeHtml(u.username)}">
            </div>
            <div class="form-group">
              <label class="form-label">Email Address</label>
              <input type="email" class="form-input" id="acc-email" value="${this.escapeHtml(u.email)}">
            </div>
          </div>
          <button class="btn-primary" id="btn-save-profile" style="width: fit-content;">Save Profile</button>
        </div>
      </div>

      <div class="panel-section-box">
        <h2 class="section-title"><i class="fa-solid fa-shield-halved" style="color: #10b981;"></i> Update Account Password</h2>
        <div class="settings-group" style="margin-top: 1rem;">
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-group">
              <label class="form-label">Current Password</label>
              <input type="password" class="form-input" id="acc-curr-pass" placeholder="••••••••••••">
            </div>
            <div class="form-group">
              <label class="form-label">New Password</label>
              <input type="password" class="form-input" id="acc-new-pass" placeholder="At least 8 characters">
            </div>
          </div>
          <button class="btn-primary" id="btn-save-password" style="width: fit-content;">Update Password</button>
        </div>
      </div>

      <div class="panel-section-box">
        <div class="section-head-row">
          <div>
            <h2 class="section-title"><i class="fa-solid fa-lock" style="color: #f59e0b;"></i> Two-Factor Authentication (2FA)</h2>
            <p style="font-size: 0.85rem; color: var(--text-dim); margin-top: 4px;">
              ${u.twoFactorEnabled ? 'Two-factor authentication is active on this account.' : 'Enhance your security by enabling TOTP 2FA authentication.'}
            </p>
          </div>
          <button class="btn-primary" id="btn-toggle-2fa">
            <i class="fa-solid ${u.twoFactorEnabled ? 'fa-lock-open' : 'fa-qrcode'}"></i>
            ${u.twoFactorEnabled ? 'Disable 2FA' : 'Enable 2FA'}
          </button>
        </div>
      </div>
    `;

    document.getElementById('btn-save-profile').onclick = async () => {
      const username = document.getElementById('acc-username').value;
      const email = document.getElementById('acc-email').value;
      await window.api.updateAccount({ username, email });
      this.showToast('Profile updated', 'success');
    };

    document.getElementById('btn-save-password').onclick = async () => {
      const newPassword = document.getElementById('acc-new-pass').value;
      try {
        await window.api.updatePassword({ newPassword });
        this.showToast('Password updated successfully', 'success');
        document.getElementById('acc-curr-pass').value = '';
        document.getElementById('acc-new-pass').value = '';
      } catch (err) {
        this.showToast(err.message, 'error');
      }
    };

    document.getElementById('btn-toggle-2fa').onclick = () => this.open2FASetupModal(u.twoFactorEnabled);
  }

  async open2FASetupModal(currentlyEnabled) {
    if (currentlyEnabled) {
      if (confirm('Disable Two-Factor Authentication for your account?')) {
        await window.api.verify2FA('000000');
        this.showToast('2FA Disabled', 'info');
        this.renderAccountView();
      }
      return;
    }

    const res = await window.api.generate2FA();
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';

    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <div class="modal-title"><i class="fa-solid fa-qrcode" style="color: #f59e0b;"></i> Setup 2-Factor Authentication</div>
          <button class="modal-close-btn" onclick="this.closest('.modal-backdrop').remove()">&times;</button>
        </div>
        <div class="modal-body" style="text-align:center;">
          <p style="font-size: 0.85rem; color: var(--text-dim); margin-bottom: 1rem;">
            Scan this QR code with Google Authenticator, Authy, or 1Password:
          </p>
          <div class="qr-container">
            ${res.qrSvg}
          </div>
          <p style="font-family: var(--font-mono); font-size: 0.88rem; color: var(--brand-cyan); margin-top: 1rem;">
            Secret Key: ${res.secret}
          </p>

          <div class="form-group" style="margin-top: 1.25rem; text-align: left;">
            <label class="form-label">Enter 6-Digit TOTP Code</label>
            <input type="text" class="form-input" id="totp-code-inp" placeholder="123456" maxlength="6" style="letter-spacing: 4px; font-size: 1.1rem; text-align: center;">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="this.closest('.modal-backdrop').remove()">Cancel</button>
          <button class="btn-primary" id="btn-submit-totp"><i class="fa-solid fa-check"></i> Verify & Enable</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('btn-submit-totp').onclick = async () => {
      const code = document.getElementById('totp-code-inp').value.trim();
      try {
        await window.api.verify2FA(code);
        modal.remove();
        this.showToast('Two-Factor Authentication Enabled!', 'success');
        this.renderAccountView();
      } catch (err) {
        this.showToast(err.message, 'error');
      }
    };
  }

  async renderAccountApiKeysTab(container) {
    const keys = await window.api.getClientApiKeys();

    container.innerHTML = `
      <div class="panel-section-box">
        <div class="section-head-row">
          <div>
            <h2 class="section-title"><i class="fa-solid fa-key" style="color: var(--brand-cyan);"></i> Account Client API Keys</h2>
            <p style="font-size: 0.85rem; color: var(--text-dim); margin-top: 4px;">Manage client tokens for mobile apps and CLI tools</p>
          </div>
          <button class="btn-primary" id="btn-create-client-key"><i class="fa-solid fa-plus"></i> Create API Key</button>
        </div>

        <div class="items-grid" style="margin-top: 1rem;">
          ${keys.map(k => `
            <div class="item-card">
              <div class="item-card-title">
                <span><i class="fa-solid fa-key" style="color: var(--brand-cyan); margin-right: 6px;"></i> ${this.escapeHtml(k.description)}</span>
                <button class="file-action-btn delete btn-delete-client-key" data-key-id="${k.id}"><i class="fa-solid fa-trash-can"></i></button>
              </div>
              <div class="item-field-list" style="margin-top: 10px;">
                <div class="item-field"><span class="field-label">Token Identifier</span><span class="field-val" style="font-family: var(--font-mono);">${k.identifier}</span></div>
                <div class="item-field"><span class="field-label">Last Used</span><span class="field-val" style="color: var(--text-muted);">${k.lastUsed}</span></div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    document.getElementById('btn-create-client-key')?.addEventListener('click', () => {
      const desc = prompt('Token Description (e.g. My Phone, Python Script):', 'Client Token');
      if (!desc) return;
      window.api.createClientApiKey({ description: desc })
        .then(() => {
          this.showToast('Client API key generated', 'success');
          this.renderAccountApiKeysTab(container);
        })
        .catch(err => this.showToast(err.message, 'error'));
    });

    container.querySelectorAll('.btn-delete-client-key').forEach(btn => {
      btn.onclick = async () => {
        const kId = btn.getAttribute('data-key-id');
        await window.api.deleteClientApiKey(kId);
        this.showToast('Key revoked', 'success');
        await this.renderAccountApiKeysTab(container);
      };
    });
  }

  async renderAccountSshKeysTab(container) {
    const keys = await window.api.getSshKeys();

    container.innerHTML = `
      <div class="panel-section-box">
        <div class="section-head-row">
          <div>
            <h2 class="section-title"><i class="fa-solid fa-terminal" style="color: #10b981;"></i> Public SSH Keys (SFTP Access)</h2>
            <p style="font-size: 0.85rem; color: var(--text-dim); margin-top: 4px;">Authenticate seamlessly with SFTP using your public SSH keys</p>
          </div>
          <button class="btn-primary" id="btn-add-ssh-key"><i class="fa-solid fa-plus"></i> Add SSH Key</button>
        </div>

        <div class="items-grid" style="margin-top: 1rem;">
          ${keys.map(k => `
            <div class="item-card">
              <div class="item-card-title">
                <span><i class="fa-solid fa-key" style="color: #10b981; margin-right: 6px;"></i> ${this.escapeHtml(k.name)}</span>
                <button class="file-action-btn delete btn-delete-ssh-key" data-key-id="${k.id}"><i class="fa-solid fa-trash-can"></i></button>
              </div>
              <div class="item-field-list" style="margin-top: 10px;">
                <div class="item-field"><span class="field-label">Fingerprint</span><span class="field-val" style="font-family: var(--font-mono); font-size: 0.74rem;">${k.fingerprint}</span></div>
                <div class="item-field"><span class="field-label">Added</span><span class="field-val" style="color: var(--text-muted);">${new Date(k.createdAt).toLocaleDateString()}</span></div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    document.getElementById('btn-add-ssh-key')?.addEventListener('click', () => {
      const name = prompt('SSH Key Name (e.g. MacBook Pro, Workstation):');
      if (!name) return;
      const publicKey = prompt('Public Key (ssh-rsa ... or ssh-ed25519 ...):');
      if (!publicKey) return;

      window.api.addSshKey({ name, publicKey })
        .then(() => {
          this.showToast('SSH Key registered', 'success');
          this.renderAccountSshKeysTab(container);
        })
        .catch(err => this.showToast(err.message, 'error'));
    });

    container.querySelectorAll('.btn-delete-ssh-key').forEach(btn => {
      btn.onclick = async () => {
        const kId = btn.getAttribute('data-key-id');
        await window.api.deleteSshKey(kId);
        this.showToast('SSH Key removed', 'success');
        await this.renderAccountSshKeysTab(container);
      };
    });
  }

  // ======================== MODAL: CREATE SERVER WIZARD ======================== //

  openCreateServerModal() {
    this.playSound('click');
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.id = 'modal-create-server';

    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <div class="modal-title">
            <i class="fa-solid fa-server" style="color: var(--brand-cyan);"></i> Deploy New Server Instance
          </div>
          <button class="modal-close-btn" id="btn-close-create-modal">&times;</button>
        </div>

        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Server Name</label>
            <input type="text" class="form-input" id="new-srv-name" placeholder="e.g. Pixelmon Adventure, Production Bot" value="Survival Network #1">
          </div>

          <div class="form-group">
            <label class="form-label">Select Node / Cluster</label>
            <select class="form-input" id="new-srv-node">
              ${this.nodes.map(n => `<option value="${n.id}">${n.name} (${n.location})</option>`).join('')}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Game / Application Egg</label>
            <select class="form-input" id="new-srv-egg">
              ${this.eggs.map(e => `<option value="${e.id}">${e.nest} - ${e.name}</option>`).join('')}
            </select>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-group">
              <label class="form-label">Memory Limit (MB)</label>
              <input type="number" class="form-input" id="new-srv-mem" value="4096" step="512">
            </div>
            <div class="form-group">
              <label class="form-label">CPU Limit (%)</label>
              <input type="number" class="form-input" id="new-srv-cpu" value="200" step="50">
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Disk Storage (MB)</label>
            <input type="number" class="form-input" id="new-srv-disk" value="15360" step="1024">
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-secondary" id="btn-cancel-create">Cancel</button>
          <button class="btn-primary" id="btn-submit-create"><i class="fa-solid fa-rocket"></i> Deploy Instance</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('btn-close-create-modal').onclick = () => modal.remove();
    document.getElementById('btn-cancel-create').onclick = () => modal.remove();

    document.getElementById('btn-submit-create').onclick = async () => {
      const name = document.getElementById('new-srv-name').value.trim();
      const nodeId = document.getElementById('new-srv-node').value;
      const eggId = document.getElementById('new-srv-egg').value;
      const memory = Number(document.getElementById('new-srv-mem').value);
      const cpu = Number(document.getElementById('new-srv-cpu').value);
      const disk = Number(document.getElementById('new-srv-disk').value);

      if (!name) {
        this.showToast('Please specify a server name', 'warn');
        return;
      }

      this.playSound('power');
      modal.remove();
      this.showToast(`Deploying ${name}...`, 'info');

      try {
        const created = await window.api.createServer({ name, nodeId, eggId, memory, cpu, disk });
        this.servers.push(created);
        this.showToast(`Server "${created.name}" deployed successfully!`, 'success');
        this.navigate(`#server/${created.id}/console`);
      } catch (err) {
        this.showToast(`Deployment error: ${err.message}`, 'error');
      }
    };
  }

  // ======================== COMMAND PALETTE (CTRL+K) ======================== //

  openCommandPalette() {
    this.playSound('click');
    const existing = document.getElementById('command-palette-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.id = 'command-palette-modal';

    modal.innerHTML = `
      <div class="modal-card" style="max-width: 650px;">
        <div style="padding: 1.25rem 1.5rem; display: flex; align-items:center; gap: 12px; border-bottom: 1px solid var(--border-subtle);">
          <i class="fa-solid fa-magnifying-glass" style="color: var(--brand-cyan); font-size: 1.1rem;"></i>
          <input type="text" id="palette-search-input" placeholder="Type a server name, navigate, or action..." style="flex:1; background:transparent; border:none; outline:none; color: var(--text-main); font-size: 1.05rem;" autofocus>
          <span class="search-shortcut-pill">ESC</span>
        </div>
        <div id="palette-results" style="max-height: 380px; overflow-y:auto; padding: 0.5rem;"></div>
      </div>
    `;

    document.body.appendChild(modal);

    const input = document.getElementById('palette-search-input');
    const results = document.getElementById('palette-results');
    input.focus();

    const renderResults = (query) => {
      const q = query.toLowerCase();
      const matchedServers = this.servers.filter(s => s.name.toLowerCase().includes(q) || (s.allocation && s.allocation.alias && s.allocation.alias.includes(q)));

      let html = '';
      if (matchedServers.length > 0) {
        html += `<div style="padding: 6px 12px; font-size: 0.72rem; color: var(--text-dim); text-transform:uppercase; font-weight:700;">Servers</div>`;
        matchedServers.forEach(s => {
          html += `
            <div class="palette-item" data-hash="#server/${s.id}/console" style="display:flex; align-items:center; justify-content:space-between; padding: 10px 14px; border-radius: 8px; cursor:pointer; color: var(--text-main); transition: background var(--trans-fast);">
              <div style="display:flex; align-items:center; gap: 10px;">
                <i class="fa-solid fa-server" style="color: var(--brand-cyan);"></i>
                <div>
                  <div style="font-weight:600; font-size:0.9rem;">${this.escapeHtml(s.name)}</div>
                  <div style="font-size:0.75rem; color: var(--text-dim);">${s.allocation ? s.allocation.alias : ''}</div>
                </div>
              </div>
              <span class="status-badge ${s.status}" style="font-size: 0.7rem;">${s.status}</span>
            </div>
          `;
        });
      }

      html += `
        <div style="padding: 6px 12px; font-size: 0.72rem; color: var(--text-dim); text-transform:uppercase; font-weight:700; margin-top:8px;">Navigation</div>
        <div class="palette-item" data-hash="#servers" style="display:flex; align-items:center; gap: 10px; padding: 10px 14px; border-radius: 8px; cursor:pointer; color: var(--text-main);">
          <i class="fa-solid fa-grip" style="color: #38bdf8;"></i> All Servers Dashboard
        </div>
        <div class="palette-item" data-hash="#admin" style="display:flex; align-items:center; gap: 10px; padding: 10px 14px; border-radius: 8px; cursor:pointer; color: var(--text-main);">
          <i class="fa-solid fa-shield-halved" style="color: #a855f7;"></i> Admin Wings Control
        </div>
        <div class="palette-item" data-hash="#activity" style="display:flex; align-items:center; gap: 10px; padding: 10px 14px; border-radius: 8px; cursor:pointer; color: var(--text-main);">
          <i class="fa-solid fa-clock-rotate-left" style="color: #10b981;"></i> Cluster Audit Logs
        </div>
        <div class="palette-item" data-hash="#account" style="display:flex; align-items:center; gap: 10px; padding: 10px 14px; border-radius: 8px; cursor:pointer; color: var(--text-main);">
          <i class="fa-solid fa-user-gear" style="color: #f59e0b;"></i> Account Profile & Security
        </div>
      `;

      results.innerHTML = html;

      results.querySelectorAll('.palette-item').forEach(item => {
        item.onmouseenter = () => item.style.background = 'rgba(255,255,255,0.06)';
        item.onmouseleave = () => item.style.background = 'transparent';
        item.onclick = () => {
          modal.remove();
          this.navigate(item.getAttribute('data-hash'));
        };
      });
    };

    renderResults('');
    input.oninput = (e) => renderResults(e.target.value);
    modal.onclick = (e) => {
      if (e.target === modal) modal.remove();
    };
  }

  closeModals() {
    document.querySelectorAll('.modal-backdrop, .code-editor-modal').forEach(m => m.remove());
  }

  // ======================== POWER ACTIONS ======================== //

  async triggerPowerAction(serverId, action) {
    this.playSound('power');
    this.showToast(`Server action "${action.toUpperCase()}" triggered`, 'info');
    try {
      await window.api.sendPowerAction(serverId, action);
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  }

  // ======================== WEBSOCKET HANDLERS ======================== //

  onServerStats(data) {
    const target = this.servers.find(s => s.id === data.serverId);
    if (target) {
      target.stats = data.stats;
      target.uptime = data.uptime;
    }

    if (this.activeServerId === data.serverId && this.activeTab === 'console') {
      const cpuNum = document.getElementById('stat-cpu-num');
      const memNum = document.getElementById('stat-mem-num');
      const diskNum = document.getElementById('stat-disk-num');
      const netNum = document.getElementById('stat-net-num');

      if (cpuNum) cpuNum.textContent = `${data.stats.cpu}%`;
      if (memNum) memNum.textContent = `${(data.stats.memory / 1024).toFixed(2)} GB`;
      if (diskNum) diskNum.textContent = `${(data.stats.disk / 1024).toFixed(2)} GB`;
      if (netNum) netNum.textContent = `${data.stats.netRx} KB/s`;

      if (this.charts.cpu) this.charts.cpu.push(data.stats.cpu);
      if (this.charts.mem) this.charts.mem.push(data.stats.memory);
      if (this.charts.disk) this.charts.disk.push(data.stats.disk);
      if (this.charts.net) this.charts.net.push(data.stats.netRx);

      const upTag = document.getElementById('hero-uptime-tag');
      if (upTag) upTag.innerHTML = `<i class="fa-regular fa-clock"></i> Uptime: ${this.formatUptime(data.uptime)}`;
    }

    const cardCpu = document.getElementById(`card-cpu-${data.serverId}`);
    const cardCpuBar = document.getElementById(`card-cpubar-${data.serverId}`);
    const cardMem = document.getElementById(`card-mem-${data.serverId}`);
    const cardMemBar = document.getElementById(`card-membar-${data.serverId}`);

    if (cardCpu && target) cardCpu.textContent = `${data.stats.cpu}% / ${target.limits.cpu}%`;
    if (cardCpuBar && target) cardCpuBar.style.width = `${Math.min(100, Math.round((data.stats.cpu / target.limits.cpu) * 100))}%`;
    if (cardMem && target) cardMem.textContent = `${data.stats.memory} MB / ${target.limits.memory} MB`;
    if (cardMemBar && target) cardMemBar.style.width = `${Math.min(100, Math.round((data.stats.memory / target.limits.memory) * 100))}%`;
  }

  onServerConsole(data) {
    if (this.activeServerId === data.serverId && this.terminal) {
      this.terminal.appendLine(data.line);
    }
  }

  onServerBacklog(data) {
    if (this.activeServerId === data.serverId && this.terminal) {
      this.terminal.clear();
      (data.logs || []).forEach(line => this.terminal.appendLine(line));
    }
  }

  onServerStatus(data) {
    const target = this.servers.find(s => s.id === data.serverId);
    if (target) {
      target.status = data.status;
      if (data.isSuspended !== undefined) target.isSuspended = data.isSuspended;
    }

    if (this.activeServerId === data.serverId) {
      const heroBadge = document.getElementById('hero-status-badge');
      const heroText = document.getElementById('hero-status-text');
      if (heroBadge && heroText) {
        heroBadge.className = `status-badge ${data.isSuspended ? 'offline' : data.status}`;
        heroText.textContent = data.isSuspended ? 'SUSPENDED' : data.status;
      }
    }

    const card = document.querySelector(`.server-card[data-id="${data.serverId}"] .status-badge`);
    if (card) {
      card.className = `status-badge ${data.isSuspended ? 'offline' : data.status}`;
      card.querySelector('span').textContent = data.isSuspended ? 'SUSPENDED' : data.status;
    }
  }

  // ======================== UTILITIES ======================== //

  getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    switch (ext) {
      case 'json':
      case 'yml':
      case 'yaml':
      case 'properties':
      case 'cfg':
      case 'conf':
      case 'env':
        return 'fa-file-lines config';
      case 'js':
      case 'ts':
      case 'py':
      case 'sh':
      case 'bat':
        return 'fa-file-code code';
      case 'jar':
      case 'zip':
      case 'tar':
      case 'gz':
        return 'fa-file-zipper archive';
      default:
        return 'fa-file code';
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  formatUptime(seconds = 0) {
    if (!seconds) return 'Offline';
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

function pathJoin(base, sub) {
  let joined = `${base}/${sub}`.replace(/\/+/g, '/');
  if (!joined.startsWith('/')) joined = '/' + joined;
  return joined;
}

// Instantiate App
window.addEventListener('DOMContentLoaded', () => {
  window.app = new SmoothHostApp();
});
