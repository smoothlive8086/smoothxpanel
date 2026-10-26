#!/usr/bin/env bash

# ==============================================================================
# SMOOTH x HOST - Enterprise Game Server Panel & Wings Auto-Installer
# Inspired by pterodactyl-installer.se
#
# Supported OS:
#   - Ubuntu 20.04, 22.04, 24.04 LTS
#   - Debian 11, 12
#   - AlmaLinux 8, 9 / Rocky Linux 8, 9 / CentOS Stream
# ==============================================================================

set -e

# ANSI Color Codes
RESET="\033[0m"
BOLD="\033[1m"
RED="\033[38;5;196m"
GREEN="\033[38;5;46m"
YELLOW="\033[38;5;226m"
BLUE="\033[38;5;39m"
CYAN="\033[38;5;51m"
PURPLE="\033[38;5;141m"
DIM="\033[2m"

# Default Variables
INSTALL_DIR="/var/www/smooth-panel"
WINGS_DIR="/etc/pterodactyl"
PANEL_PORT=3000
WINGS_PORT=8080
SFTP_PORT=2022
NODE_VERSION="20"

print_banner() {
  clear
  echo -e "${CYAN}${BOLD}"
  cat << "EOF"
  ███████╗███╗   ███╗ ██████╗  ██████╗ ████████╗██╗  ██╗
  ██╔════╝████╗ ████║██╔═══██╗██╔═══██╗╚══██╔══╝██║  ██║
  ███████╗██╔████╔██║██║   ██║██║   ██║   ██║   ███████║
  ╚════██║██║╚██╔╝██║██║   ██║██║   ██║   ██║   ██╔══██║
  ███████║██║ ╚═╝ ██║╚██████╔╝╚██████╔╝   ██║   ██║  ██║
  ╚══════╝╚═╝     ╚═╝ ╚═════╝  ╚═════╝    ╚═╝   ╚═╝  ╚═╝
EOF
  echo -e "${PURPLE}${BOLD}   Enterprise Game & Application Server Management Panel${RESET}"
  echo -e "${DIM}   Automated VPS Cloud Deployer • Wings Daemon Connector${RESET}"
  echo -e "${BLUE}===================================================================${RESET}"
  echo ""
}

log_info() {
  echo -e "${BLUE}[INFO]${RESET} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${RESET} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${RESET} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${RESET} $1"
}

check_root() {
  if [[ $EUID -ne 0 ]]; then
    log_error "This script must be executed as root! Run with sudo or login as root user."
    exit 1
  fi
}

detect_os() {
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    VER=$VERSION_ID
  else
    log_error "Unable to detect Linux distribution from /etc/os-release."
    exit 1
  fi

  case "$OS" in
    ubuntu|debian)
      PKG_MANAGER="apt-get"
      ;;
    almalinux|rocky|centos|rhel)
      PKG_MANAGER="dnf"
      ;;
    *)
      log_warn "Your OS ($OS) is not officially tested, but we will proceed using generic Linux methods."
      PKG_MANAGER="apt-get"
      ;;
  esac
  log_info "Detected Operating System: ${GREEN}${OS} ${VER}${RESET} (Package Manager: ${PKG_MANAGER})"
}

install_dependencies() {
  log_info "Updating system packages and installing required dependencies..."

  if [ "$PKG_MANAGER" = "apt-get" ]; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y
    apt-get install -y curl wget git tar unzip jq ufw software-properties-common ca-certificates gnupg
  else
    dnf update -y
    dnf install -y curl wget git tar unzip jq firewalld ca-certificates gnupg
  fi

  # Install Node.js 20 LTS if not present
  if ! command -v node > /dev/null 2>&1 || [ "$(node -v | cut -d'.' -f1 | tr -d 'v')" -lt 18 ]; then
    log_info "Installing Node.js ${NODE_VERSION}.x LTS runtime..."
    if [ "$PKG_MANAGER" = "apt-get" ]; then
      mkdir -p /etc/apt/keyrings
      curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg --yes
      echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_VERSION}.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
      apt-get update -y
      apt-get install -y nodejs
    else
      curl -fsSL https://rpm.nodesource.com/setup_${NODE_VERSION}.x | bash -
      dnf install -y nodejs
    fi
  fi

  log_success "Node.js $(node -v) and npm $(npm -v) are ready!"
}

install_docker() {
  if command -v docker > /dev/null 2>&1; then
    log_success "Docker is already installed: $(docker --version)"
    return
  fi

  log_info "Installing Docker Engine for Wings container isolation..."
  curl -fsSL https://get.docker.com | bash
  systemctl enable --now docker
  log_success "Docker successfully installed and started!"
}

install_panel() {
  print_banner
  echo -e "${CYAN}${BOLD}>>> Starting SMOOTH x HOST Panel Installation${RESET}"
  echo ""

  install_dependencies

  mkdir -p "$INSTALL_DIR"
  cd "$INSTALL_DIR"

  log_info "Deploying panel application to ${INSTALL_DIR}..."

  # If files exist locally where installer is run, copy them; otherwise pull from repository
  SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
  if [ -f "$SCRIPT_DIR/server.js" ] && [ -d "$SCRIPT_DIR/public" ]; then
    if [ "$SCRIPT_DIR" != "$INSTALL_DIR" ]; then
      log_info "Copying project files from current workspace directory: ${SCRIPT_DIR}..."
      cp -r "$SCRIPT_DIR/"* "$INSTALL_DIR/"
    else
      log_info "Project files are already in ${INSTALL_DIR}."
    fi
  else
    log_info "Cloning latest panel files from official source..."
    # Clone or download bundle
    git clone https://github.com/smoothlive8086/smoothxpanel.git "$INSTALL_DIR" || git clone https://github.com/smooth-x-host/ptro-panel.git "$INSTALL_DIR" || true

    # If repository was uploaded with a nested 'PTRO PANEL' folder, move files up
    if [ -d "$INSTALL_DIR/PTRO PANEL" ]; then
      log_info "Detected nested 'PTRO PANEL' folder, extracting files to ${INSTALL_DIR}..."
      cp -r "$INSTALL_DIR/PTRO PANEL/"* "$INSTALL_DIR/"
      rm -rf "$INSTALL_DIR/PTRO PANEL"
    fi
  fi

  # Install npm dependencies
  log_info "Installing production npm packages..."
  cd "$INSTALL_DIR"
  npm install --production

  # ==========================================================
  # Interactive Admin Account & Configuration (Like Pterodactyl)
  # ==========================================================
  echo ""
  echo -e "${YELLOW}${BOLD}--- Initial Administrator Account Setup (Like Pterodactyl) ---${RESET}"
  read -p "Enter Administrator Email [admin@smoothhost.cloud]: " ADMIN_EMAIL
  ADMIN_EMAIL=${ADMIN_EMAIL:-"admin@smoothhost.cloud"}

  read -p "Enter Administrator Username [admin]: " ADMIN_USER
  ADMIN_USER=${ADMIN_USER:-"admin"}

  read -p "Enter First Name [Root]: " ADMIN_FIRSTNAME
  ADMIN_FIRSTNAME=${ADMIN_FIRSTNAME:-"Root"}

  read -p "Enter Last Name [Administrator]: " ADMIN_LASTNAME
  ADMIN_LASTNAME=${ADMIN_LASTNAME:-"Administrator"}

  read -p "Enter Panel Web Port [3000]: " USER_PORT
  PANEL_PORT=${USER_PORT:-3000}

  # Update users.json with custom administrator credentials
  USERS_FILE="$INSTALL_DIR/data/users.json"
  if [ -f "$USERS_FILE" ] && command -v jq > /dev/null 2>&1; then
    jq --arg email "$ADMIN_EMAIL" \
       --arg username "$ADMIN_USER" \
       --arg first "$ADMIN_FIRSTNAME" \
       --arg last "$ADMIN_LASTNAME" \
       'map(if .id == "usr-admin" then .email = $email | .username = $username | .firstName = $first | .lastName = $last else . end)' \
       "$USERS_FILE" > "${USERS_FILE}.tmp" && mv "${USERS_FILE}.tmp" "$USERS_FILE"
    log_success "Administrator account configured: ${ADMIN_EMAIL}"
  fi

  # Create default systemd service
  log_info "Configuring systemd background service (smooth-panel.service)..."
  cat << EOF > /etc/systemd/system/smooth-panel.service
[Unit]
Description=SMOOTH x HOST Enterprise Game Server Panel
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
ExecStart=$(which node) server.js
Restart=always
RestartSec=5
Environment=PORT=${PANEL_PORT}
Environment=NODE_ENV=production
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable --now smooth-panel

  # Configure firewall
  configure_firewall_panel

  # Get Public IP
  SERVER_IP=$(curl -s -4 https://icanhazip.com || echo "YOUR_VPS_IP")

  echo ""
  echo -e "${GREEN}${BOLD}===================================================================${RESET}"
  echo -e "${GREEN}${BOLD}  ✔ SMOOTH x HOST PANEL INSTALLED SUCCESSFULLY!                   ${RESET}"
  echo -e "${GREEN}${BOLD}===================================================================${RESET}"
  echo -e "  Web Panel URL  : ${CYAN}http://${SERVER_IP}:${PANEL_PORT}${RESET}"
  echo -e "  WebSocket Sync : ${CYAN}ws://${SERVER_IP}:${PANEL_PORT}/ws${RESET}"
  echo -e "  Root User      : ${YELLOW}${ADMIN_EMAIL}${RESET} (${ADMIN_USER})"
  echo -e "  Default Pass   : ${YELLOW}password${RESET}"
  echo -e "  Service Status : ${GREEN}systemctl status smooth-panel${RESET}"
  echo -e "${GREEN}===================================================================${RESET}"
  echo ""
}

install_wings() {
  print_banner
  echo -e "${CYAN}${BOLD}>>> Starting Wings Daemon (VPS Node Connector)${RESET}"
  echo ""

  install_dependencies
  install_docker

  mkdir -p "$WINGS_DIR"
  mkdir -p /var/log/pterodactyl
  mkdir -p /var/lib/pterodactyl/volumes

  if [ -z "$INPUT_PANEL_URL" ] || [ -z "$INPUT_NODE_ID" ] || [ -z "$INPUT_TOKEN" ]; then
    echo ""
    echo -e "${YELLOW}${BOLD}Connect this VPS to your SMOOTH x HOST Panel:${RESET}"
    [ -z "$INPUT_PANEL_URL" ] && read -p "Enter Panel Web URL (e.g. http://${SERVER_IP:-YOUR_PANEL_IP}:3000): " INPUT_PANEL_URL
    [ -z "$INPUT_NODE_ID" ] && read -p "Enter Node ID (e.g. node-us-east or from Admin -> Nodes): " INPUT_NODE_ID
    [ -z "$INPUT_TOKEN" ] && read -p "Enter Node Token / API Key (from Admin panel): " INPUT_TOKEN
  fi

  if [ -z "$INPUT_PANEL_URL" ]; then
    INPUT_PANEL_URL="http://localhost:3000"
  fi
  if [ -z "$INPUT_NODE_ID" ]; then
    INPUT_NODE_ID="node-vps-$(hostname | tr -cd 'a-zA-Z0-9' | tr '[:upper:]' '[:lower:]')"
  fi

  # Create config.yml
  cat << EOF > "$WINGS_DIR/config.yml"
debug: false
uuid: ${INPUT_NODE_ID}
token: ${INPUT_TOKEN:-"smooth_wings_token_auto"}
api:
  host: 0.0.0.0
  port: ${WINGS_PORT}
  ssl:
    enabled: false
  upload_limit: 100
system:
  root_directory: /var/lib/pterodactyl
  log_directory: /var/log/pterodactyl
  data: /var/lib/pterodactyl/volumes
  sftp:
    bind_port: ${SFTP_PORT}
allowed_mounts: []
remote: ${INPUT_PANEL_URL}
EOF

  # Deploy Node Wings Agent script
  SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
  if [ -f "$SCRIPT_DIR/wings-daemon.js" ]; then
    cp "$SCRIPT_DIR/wings-daemon.js" "$WINGS_DIR/wings-daemon.js"
  else
    # Pull or create daemon agent inline
    cat << 'EOF' > "$WINGS_DIR/wings-daemon.js"
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

const configPath = '/etc/pterodactyl/config.yml';
let panelUrl = 'http://localhost:3000';
let nodeId = 'node-vps';

try {
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const uMatch = raw.match(/uuid:\s*([^\r\n]+)/);
    const rMatch = raw.match(/remote:\s*([^\r\n]+)/);
    if (uMatch) nodeId = uMatch[1].trim();
    if (rMatch) panelUrl = rMatch[1].trim();
  }
} catch (e) {}

console.log(`[Wings Node Daemon] Running for node [${nodeId}] pointing to [${panelUrl}]`);

function sendHeartbeat() {
  const cpus = os.cpus();
  const totalMem = Math.round(os.totalmem() / 1024 / 1024);
  const freeMem = Math.round(os.freemem() / 1024 / 1024);
  const usedMem = totalMem - freeMem;

  const payload = JSON.stringify({
    nodeId,
    status: 'online',
    memoryTotal: totalMem,
    memoryAllocated: usedMem,
    uptime: os.uptime(),
    platform: `${os.type()} ${os.release()}`
  });

  try {
    const parsed = new URL(`${panelUrl}/api/wings/heartbeat`);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {});
    req.on('error', () => {});
    req.write(payload);
    req.end();
  } catch (e) {}
}

setInterval(sendHeartbeat, 2500);
sendHeartbeat();
EOF
  fi

  # Create systemd service for Wings
  cat << EOF > /etc/systemd/system/smooth-wings.service
[Unit]
Description=SMOOTH x HOST Wings Node Daemon
After=docker.service network.target
Requires=docker.service

[Service]
Type=simple
User=root
WorkingDirectory=${WINGS_DIR}
ExecStart=$(which node) ${WINGS_DIR}/wings-daemon.js
Restart=always
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable --now smooth-wings

  # Configure firewall for Wings
  configure_firewall_wings

  echo ""
  echo -e "${GREEN}${BOLD}===================================================================${RESET}"
  echo -e "${GREEN}${BOLD}  ✔ WINGS NODE DAEMON CONNECTED SUCCESSFULLY!                     ${RESET}"
  echo -e "${GREEN}${BOLD}===================================================================${RESET}"
  echo -e "  Wings Node ID  : ${CYAN}${INPUT_NODE_ID}${RESET}"
  echo -e "  Daemon Port    : ${CYAN}${WINGS_PORT}${RESET}"
  echo -e "  SFTP Port      : ${CYAN}${SFTP_PORT}${RESET}"
  echo -e "  Linked Panel   : ${YELLOW}${INPUT_PANEL_URL}${RESET}"
  echo -e "  Service Status : ${GREEN}systemctl status smooth-wings${RESET}"
  echo -e "${GREEN}===================================================================${RESET}"
  echo ""
}

install_all_in_one() {
  install_panel
  INPUT_PANEL_URL="http://localhost:${PANEL_PORT}"
  install_wings
}

configure_nginx_ssl() {
  print_banner
  echo -e "${CYAN}${BOLD}>>> Configuring Nginx Reverse Proxy with Free Let's Encrypt SSL${RESET}"
  echo ""

  read -p "Enter your Domain Name (e.g. panel.yourdomain.com): " DOMAIN
  if [ -z "$DOMAIN" ]; then
    log_error "Domain name cannot be empty!"
    return
  fi

  read -p "Enter your Email for SSL notifications (Certbot): " SSL_EMAIL
  if [ -z "$SSL_EMAIL" ]; then
    SSL_EMAIL="admin@${DOMAIN}"
  fi

  if [ "$PKG_MANAGER" = "apt-get" ]; then
    apt-get install -y nginx certbot python3-certbot-nginx
  else
    dnf install -y nginx certbot python3-certbot-nginx
  fi

  # Create Nginx site config
  cat << EOF > /etc/nginx/conf.d/smooth-panel.conf
server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:${PANEL_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        client_max_body_size 100M;
    }

    location /ws {
        proxy_pass http://127.0.0.1:${PANEL_PORT}/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF

  nginx -t && systemctl reload nginx || systemctl restart nginx

  log_info "Acquiring Let's Encrypt SSL certificate..."
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$SSL_EMAIL" --redirect || {
    log_warn "Certbot auto-configuration had an issue. Please ensure your DNS A-Record points to this VPS IP!"
  }

  echo ""
  log_success "Nginx reverse proxy with SSL is configured for https://${DOMAIN}!"
}

configure_firewall_panel() {
  log_info "Configuring firewall ports for Panel..."
  if command -v ufw > /dev/null 2>&1; then
    ufw allow 80/tcp > /dev/null 2>&1 || true
    ufw allow 443/tcp > /dev/null 2>&1 || true
    ufw allow ${PANEL_PORT}/tcp > /dev/null 2>&1 || true
    ufw allow 22/tcp > /dev/null 2>&1 || true
  elif command -v firewall-cmd > /dev/null 2>&1; then
    firewall-cmd --permanent --add-port=80/tcp > /dev/null 2>&1 || true
    firewall-cmd --permanent --add-port=443/tcp > /dev/null 2>&1 || true
    firewall-cmd --permanent --add-port=${PANEL_PORT}/tcp > /dev/null 2>&1 || true
    firewall-cmd --reload > /dev/null 2>&1 || true
  fi
}

configure_firewall_wings() {
  log_info "Configuring firewall ports for Wings Daemon & Game Allocations..."
  if command -v ufw > /dev/null 2>&1; then
    ufw allow ${WINGS_PORT}/tcp > /dev/null 2>&1 || true
    ufw allow ${SFTP_PORT}/tcp > /dev/null 2>&1 || true
    ufw allow 25565:25600/tcp > /dev/null 2>&1 || true
    ufw allow 25565:25600/udp > /dev/null 2>&1 || true
  elif command -v firewall-cmd > /dev/null 2>&1; then
    firewall-cmd --permanent --add-port=${WINGS_PORT}/tcp > /dev/null 2>&1 || true
    firewall-cmd --permanent --add-port=${SFTP_PORT}/tcp > /dev/null 2>&1 || true
    firewall-cmd --permanent --add-port=25565-25600/tcp > /dev/null 2>&1 || true
    firewall-cmd --permanent --add-port=25565-25600/udp > /dev/null 2>&1 || true
    firewall-cmd --reload > /dev/null 2>&1 || true
  fi
}

show_status() {
  print_banner
  echo -e "${CYAN}${BOLD}>>> System Diagnostics & Service Status${RESET}"
  echo ""
  echo -e "${YELLOW}Panel Service:${RESET}"
  systemctl status smooth-panel --no-pager || echo "Panel is not installed or inactive."
  echo ""
  echo -e "${YELLOW}Wings Service:${RESET}"
  systemctl status smooth-wings --no-pager || echo "Wings daemon is not installed or inactive."
  echo ""
}

show_menu() {
  print_banner
  echo -e "${BOLD}Please select an installation action:${RESET}"
  echo ""
  echo -e "  ${CYAN}[1]${RESET} Install SMOOTH x HOST Panel ${DIM}(Web UI, API, Core Engine)${RESET}"
  echo -e "  ${CYAN}[2]${RESET} Install Wings Node Daemon ${DIM}(Connect this VPS to a Panel)${RESET}"
  echo -e "  ${CYAN}[3]${RESET} Install Both Panel + Wings ${DIM}(All-in-One on this VPS)${RESET}"
  echo -e "  ${CYAN}[4]${RESET} Configure Nginx Reverse Proxy with Free Let's Encrypt SSL"
  echo -e "  ${CYAN}[5]${RESET} View Running Services & Diagnostics"
  echo -e "  ${CYAN}[6]${RESET} Exit"
  echo ""
  read -p "Enter choice [1-6]: " CHOICE

  case "$CHOICE" in
    1) install_panel ;;
    2) install_wings ;;
    3) install_all_in_one ;;
    4) configure_nginx_ssl ;;
    5) show_status ;;
    6) exit 0 ;;
    *) log_error "Invalid option selected!"; exit 1 ;;
  esac
}

# Parse CLI arguments and unattended execution flags
ACTION=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --panel)
      ACTION="panel"
      shift
      ;;
    --wings)
      ACTION="wings"
      shift
      ;;
    --all)
      ACTION="all"
      shift
      ;;
    --status)
      ACTION="status"
      shift
      ;;
    --panel-url)
      INPUT_PANEL_URL="$2"
      shift 2
      ;;
    --node-id)
      INPUT_NODE_ID="$2"
      shift 2
      ;;
    --token)
      INPUT_TOKEN="$2"
      shift 2
      ;;
    --domain)
      DOMAIN="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

check_root
detect_os

case "$ACTION" in
  panel)  install_panel ;;
  wings)  install_wings ;;
  all)    install_all_in_one ;;
  status) show_status ;;
  *)      show_menu ;;
esac
