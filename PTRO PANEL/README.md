# SMOOTH x HOST &bull; Enterprise Game Server Management Panel

A high-performance, modern Pterodactyl-inspired game and application server management panel engineered with a sleek cybernetic dark aesthetic, real-time WebSocket console streaming, dynamic canvas resource sparklines, in-browser code editor, and complete daemon simulation engine.

---

## ⚡ Complete Pterodactyl Feature Suite

### 1. Brand & Design
- **Branding**: **SMOOTH x HOST** Enterprise Panel
- **Aesthetic**: Pterodactyl dark palette (`#0a0d14`, `#0f1420`), cyan (`#00e5ff`) and violet neon accents, glassmorphic card containers, and smooth CSS micro-animations.
- **Typography**: Inter for UI controls and JetBrains Mono for monospace code & terminal output.
- **Audio Feedback**: Built-in sound effects via Web Audio API with audio mute toggle in top navigation.

### 2. Live Cluster Dashboard
- **Resource Ribbon**: Live aggregate metrics for Active Instances, Memory Allocated, NVMe Storage, and Anycast Network Throughput across all connected Wings nodes.
- **Dynamic Search & Filters**: Instant fuzzy search across server names, IDs, and IP addresses. Quick filter pills (`All`, `Running`, `Offline`, `Minecraft`, `Node.js`, `Games`).
- **Server Cards**:
  - Live pulsing status dots (`Running`, `Starting`, `Stopping`, `Offline`, `Suspended`).
  - Real-time animated CPU, Memory, and Disk usage meters.
  - 1-click IP and direct connect copy.
  - Hover power controls (▶ Start, 🔄 Restart, ⏹ Stop).
- **Deploy Server Wizard**: Interactive modal to deploy new game/app servers with custom egg templates, node assignment, and resource quotas.

### 3. Server Management Interface
- **Interactive Terminal / Console**:
  - Live ANSI color rendering (`[Wings Daemon]`, `[Server thread/INFO]`, `[WARN]`, `[ERROR]`).
  - Working command execution (e.g. `/help`, `/tps`, `/op <player>`, `/say <message>`, `/status`, `/plugins`, `/save-all`).
  - Command history navigation with Up/Down arrow keys.
  - Quick command chips for 1-click execution.
  - Auto-scroll lock toggle, console clear, and `.log` file download.
- **Real-Time Canvas Charts**:
  - 4 real-time animated line charts: CPU load, Memory usage, Disk space, and Network I/O RX/TX.
- **File Manager (Full Pterodactyl Capability)**:
  - Full directory tree navigation with file type icons, sizes, modified dates, and permissions.
  - **File Upload**: Upload single or multiple files directly from your computer.
  - **File Download**: 1-click download of any file.
  - **Mass Actions**: Checkbox selection with bulk delete and archive (.tar.gz).
  - **File Archiving & Extraction**: Compress selected files or extract existing `.zip` / `.tar.gz` archives.
  - **File Renaming & Duplication**: Rename or duplicate any file or folder.
  - **Permissions (Chmod)**: Inspect and change octal permissions (e.g., `0644`, `0755`).
  - **In-Browser Code Editor**: Live syntax editor with line counter and instant save.
- **Databases**:
  - MySQL/MariaDB database provisioning with password reveal, direct credentials, and connection strings.
  - **Password Rotation**: Instant 1-click database password reset.
  - **Allowed Connections**: Configure remote access mask (`%` or specific IP).
- **Schedules (Automated Cron & Tasks)**:
  - Task scheduler supporting cron expressions with presets ("Every day at 04:00", "Every 6h", "Every 30m").
  - **Task Timeline Pipeline**: Sequential task execution (Console Command, Power Action, Backup Snapshot) with custom delay offsets.
  - **Manual Trigger**: "Run Schedule Now" to execute all tasks in real-time.
  - **Pause / Activate**: Toggle schedule state.
- **Sub-Users & Granular Permissions**:
  - Teammate management with full 8-category Pterodactyl permission matrix:
    - Server Control (start, stop, restart)
    - Console (view stream, send commands)
    - File Manager (view, create, edit, delete, upload, archive)
    - Sub-Users (view, invite, edit, revoke)
    - Backups (view, create, restore, download, delete)
    - Databases (view, create, rotate passwords, delete)
    - Schedules (view, create, trigger, delete)
    - Settings (rename, reinstall)
- **Backups & Snapshots**:
  - Point-in-time disk archives with SHA-256 integrity simulation.
  - **Lock / Unlock**: Protect critical backups from deletion.
  - **Restore**: 1-click restore sequence with console extraction logs.
  - **Download**: Export backup archive.
  - **Ignored Files**: Exclude specific files/directories (e.g. `logs/*, *.tmp`).
- **Network & Port Allocations**:
  - Multiple port allocations per server (Game, Query, RCON, Web Map).
  - Assign additional ports from node's free port pool.
  - Set Primary allocation toggle.
  - Custom allocation notes & aliases.
- **Startup Parameters & Docker Engine**:
  - Docker container image selector (switch between Java 8/11/17/21, Node 16/18/20, Python, Rust, FiveM, Source).
  - Editable startup command with template variables (`{{SERVER_MEMORY}}`, `{{SERVER_PORT}}`, `{{SERVER_JARFILE}}`).
  - Configurable egg environment variables.
- **Settings & Danger Zone**:
  - Server rename & description.
  - SFTP credentials (Host, Port, Username) + 1-click `sftp://` client launcher.
  - **Node Transfer Wizard**: Migrate server container to another node with live transfer simulation.
  - Reinstall server trigger & Delete server with confirmation.
- **Server Audit & Activity Log**:
  - Dedicated log for every power change, file modification, backup creation, and command execution.

### 4. Admin Control Center
- **Overview & Diagnostics**: Aggregate cluster resources, commit vs capacity, health diagnostics.
- **Node Infrastructure**:
  - Real-time Wings node health for Virginia (US East), Frankfurt (EU Central), and Singapore (AP South).
  - **Wings Configuration Generator**: Auto-generates `config.yml` for daemon setup.
  - **Port Range Allocator**: Bulk-assign IP and port pools (e.g., `25570-25580`).
  - Create, edit, and delete Wings nodes.
- **Servers & Build Quotas**:
  - Master server inventory across all nodes.
  - **Build Quota Editor**: Modify CPU %, RAM limit (MB), Disk limit (MB), Swap (MB), IO weight, and OOM killer on the fly.
  - **Suspend / Unsuspend Server**: Administrative server suspension locks containers.
- **Nests & Eggs Catalog**:
  - Pre-configured game engines: Minecraft Paper, Node.js, Rust Dedicated, FiveM, Python, CS:GO Source, TeamSpeak 3.
  - **Pterodactyl Egg Import/Export**: Import or export standard Pterodactyl JSON egg templates.
- **User Accounts Management**:
  - Manage all panel accounts, roles (Root Admin, Staff, Client), and admin flags.
- **Application API Tokens**:
  - Generate external application API keys with IP whitelists for WHMCS, Discord bots, and billing pipelines.

### 5. User Account Center
- **Profile & Password**: Update username, email address, and change password.
- **Two-Factor Authentication (2FA)**: Interactive setup with SVG QR Code generator, secret key, and 6-digit TOTP verification.
- **Client API Keys**: Manage user tokens for CLI tools and client automation.
- **SSH Public Keys**: Add public keys (`ssh-rsa`, `ssh-ed25519`) for passwordless SFTP access.
- **Global Audit Trail**: Cluster-wide audit log of all activities with IP and timestamps.

---

## 🚀 Getting Started & 1-Line VPS Installation

### ⚡ 1-Line Auto-Installer (Like `pterodactyl-installer.se`)
Run this single command on **any clean Linux VPS** (Ubuntu 20/22/24, Debian 11/12, AlmaLinux/Rocky Linux):

```bash
bash <(curl -sSL "https://raw.githubusercontent.com/smoothlive8086/smoothxpanel/main/PTRO%20PANEL/install.sh")
```

*(Or universal fallback that works whether files are at repo root or in `PTRO PANEL`)*:
```bash
bash <(curl -sSL https://raw.githubusercontent.com/smoothlive8086/smoothxpanel/main/install.sh 2>/dev/null || curl -sSL "https://raw.githubusercontent.com/smoothlive8086/smoothxpanel/main/PTRO%20PANEL/install.sh")
```

#### What happens during installation:
1. Installs Node.js 20 LTS, Docker CE, and production packages.
2. Prompts for Admin username and password.
3. Auto-detects public VPS IP, CPU, RAM, and Disk space.
4. Auto-configures Location (`loc-local`), Host Wings Node, and port allocations (`25565-25600`).
5. Starts `smooth-panel.service` and `smooth-wings.service` with automatic boot restart.
6. Opens firewall ports (`3000`, `8080`, `2022`, `25565-25600`).

---

### Starting the Panel Locally
If running on your local development machine:
```bash
npm install
npm start
```

The panel will be live at:
- **Web UI**: [http://localhost:3000](http://localhost:3000)
- **Live WebSocket**: `ws://localhost:3000/ws`
- **1-Line VPS Script**: `http://localhost:3000/install.sh`
- **Hosting Manual**: [HOSTING_GUIDE.md](file:///e:/PTRO%20PANEL/HOSTING_GUIDE.md)

---

## 📁 Directory Structure
```
e:/PTRO PANEL/
├── package.json            # Scripts and dependencies
├── server.js               # Express + WebSocket backend & Wings simulation engine
├── README.md               # Documentation
├── data/                   # Persistent local storage
│   ├── config.json         # Panel settings
│   ├── nodes.json          # Node cluster definitions
│   ├── eggs.json           # Game templates & variables
│   ├── servers.json        # Server instances database
│   ├── users.json          # Panel user accounts database
│   ├── allocations.json    # Port pools database
│   ├── api_keys.json       # Application & client API keys
│   ├── activity.json       # Audit activity logs
│   └── servers_files/      # Actual virtual file systems for each server
└── public/                 # Frontend SPA
    ├── index.html          # Panel application shell
    ├── css/
    │   ├── theme.css       # Design tokens, variables, glowing mesh
    │   └── main.css        # Layout, components, terminal, cards, modals
    └── js/
        ├── api.js          # REST & WebSocket client
        ├── charts.js       # Real-time HTML5 Canvas charts
        ├── terminal.js     # ANSI terminal engine & log formatter
        └── app.js          # SPA router, state manager, audio SFX, UI renderer
```
