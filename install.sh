#!/usr/bin/env bash
#
# One-click installer for the Shadowsocks-rust ssmanager web panel.
#
# What it does:
#   1. Installs Node.js (>=18) and a C build toolchain if missing.
#   2. Downloads and installs shadowsocks-rust (ssserver/ssmanager/sslocal/ssservice)
#      from the official GitHub releases, unless --skip-ssrust is given.
#   3. Installs backend deps, generates backend/.env with random secrets on first
#      run, seeds the admin account, builds the frontend.
#   4. Registers the panel as a systemd service (ssmanager-panel) so it survives
#      reboots and restarts on crash.
#
# Usage:
#   sudo ./install.sh [--skip-ssrust] [--force-ssrust] [--port 3000]
#
# Safe to re-run: it will not overwrite an existing backend/.env or re-seed the
# admin account, and skips the shadowsocks-rust download if already installed.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
PANEL_PORT="${PANEL_PORT:-3000}"
SKIP_SSRUST=0
FORCE_SSRUST=0

log()  { echo -e "\033[1;32m[install]\033[0m $*"; }
warn() { echo -e "\033[1;33m[install]\033[0m $*"; }
die()  { echo -e "\033[1;31m[install]\033[0m $*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-ssrust) SKIP_SSRUST=1; shift ;;
    --force-ssrust) FORCE_SSRUST=1; shift ;;
    --port) PANEL_PORT="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,20p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *) die "unknown option: $1 (see --help)" ;;
  esac
done

[[ $EUID -eq 0 ]] || die "please run as root (sudo ./install.sh)"
[[ -d "$BACKEND_DIR" && -d "$FRONTEND_DIR" ]] || die "expected backend/ and frontend/ next to this script"

# ---------------------------------------------------------------------------
log "step 1/6: system packages"
# ---------------------------------------------------------------------------

if command -v apt-get >/dev/null; then
  PKG_MANAGER=apt
  apt-get update -qq
  apt-get install -y curl tar xz-utils gcc g++ make python3 openssl
elif command -v dnf >/dev/null; then
  PKG_MANAGER=dnf
  dnf install -y curl tar xz gcc gcc-c++ make python3 openssl
elif command -v yum >/dev/null; then
  PKG_MANAGER=yum
  yum install -y curl tar xz gcc gcc-c++ make python3 openssl
else
  die "unsupported OS: no apt-get/dnf/yum found. Install Node.js >=18, curl, tar, xz, gcc/make yourself and re-run."
fi

NODE_OK=0
if command -v node >/dev/null; then
  NODE_MAJOR="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
  [[ "$NODE_MAJOR" -ge 18 ]] && NODE_OK=1
fi

if [[ "$NODE_OK" -eq 0 ]]; then
  log "installing Node.js 20.x via NodeSource"
  if [[ "$PKG_MANAGER" == apt ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  else
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    "$PKG_MANAGER" install -y nodejs
  fi
else
  log "Node.js $(node -v) already installed, skipping"
fi

# ---------------------------------------------------------------------------
log "step 2/6: shadowsocks-rust (ssserver/ssmanager)"
# ---------------------------------------------------------------------------

SSRUST_BIN_DIR="/usr/local/bin"

if [[ "$SKIP_SSRUST" -eq 1 ]]; then
  log "skipping shadowsocks-rust install (--skip-ssrust)"
elif command -v ssmanager >/dev/null && [[ "$FORCE_SSRUST" -eq 0 ]]; then
  log "ssmanager already installed at $(command -v ssmanager), skipping (use --force-ssrust to reinstall)"
else
  ARCH="$(uname -m)"
  case "$ARCH" in
    x86_64) TARGET="x86_64-unknown-linux-gnu" ;;
    aarch64|arm64) TARGET="aarch64-unknown-linux-gnu" ;;
    armv7l) TARGET="armv7-unknown-linux-gnueabihf" ;;
    *) die "unsupported architecture for shadowsocks-rust auto-install: $ARCH (use --skip-ssrust and install it manually)" ;;
  esac

  log "fetching latest shadowsocks-rust release info for $TARGET"
  RELEASE_JSON="$(curl -fsSL https://api.github.com/repos/shadowsocks/shadowsocks-rust/releases/latest)"
  TAG="$(echo "$RELEASE_JSON" | grep -m1 '"tag_name"' | sed -E 's/.*"tag_name": "([^"]+)".*/\1/')"
  [[ -n "$TAG" ]] || die "could not determine latest shadowsocks-rust release (GitHub API unreachable?)"
  ASSET="shadowsocks-${TAG}.${TARGET}.tar.xz"
  URL="https://github.com/shadowsocks/shadowsocks-rust/releases/download/${TAG}/${ASSET}"

  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TMP_DIR"' EXIT
  log "downloading $ASSET"
  curl -fsSL -o "$TMP_DIR/$ASSET" "$URL"
  curl -fsSL -o "$TMP_DIR/$ASSET.sha256" "$URL.sha256"
  (cd "$TMP_DIR" && sha256sum -c "$ASSET.sha256") || die "checksum verification failed for $ASSET"

  tar -xf "$TMP_DIR/$ASSET" -C "$TMP_DIR"
  for bin in ssserver ssmanager sslocal ssservice; do
    install -m 755 "$TMP_DIR/$bin" "$SSRUST_BIN_DIR/$bin"
  done
  rm -rf "$TMP_DIR"
  trap - EXIT
  log "installed shadowsocks-rust $TAG to $SSRUST_BIN_DIR"
fi

# ---------------------------------------------------------------------------
log "step 3/6: backend dependencies"
# ---------------------------------------------------------------------------

cd "$BACKEND_DIR"
npm install --omit=dev

ADMIN_PASSWORD_GENERATED=""
if [[ ! -f .env ]]; then
  log "generating backend/.env with random secrets"
  JWT_SECRET="$(openssl rand -hex 32)"
  ADMIN_PASSWORD_GENERATED="$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | head -c 16)"
  SSMANAGER_PATH="$(command -v ssmanager || echo /usr/local/bin/ssmanager)"

  cat > .env <<EOF
PORT=${PANEL_PORT}
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=12h
DB_PATH=./data/ssmanager.db
ADMIN_USERNAME=admin
ADMIN_PASSWORD=${ADMIN_PASSWORD_GENERATED}
MANAGER_HOST=127.0.0.1
MANAGER_PORT=6100
SSMANAGER_BIN=${SSMANAGER_PATH}
SSMANAGER_ARGS=--manager-addr 127.0.0.1:6100 -s 0.0.0.0 -m aes-256-gcm
EOF
else
  log "backend/.env already exists, leaving it untouched"
fi

npm run seed

# ---------------------------------------------------------------------------
log "step 4/6: frontend build"
# ---------------------------------------------------------------------------

cd "$FRONTEND_DIR"
npm install
npm run build

# ---------------------------------------------------------------------------
log "step 5/6: systemd service"
# ---------------------------------------------------------------------------

NODE_BIN="$(command -v node)"
cat > /etc/systemd/system/ssmanager-panel.service <<EOF
[Unit]
Description=Shadowsocks ssmanager Web Panel
After=network.target

[Service]
Type=simple
WorkingDirectory=${BACKEND_DIR}
EnvironmentFile=${BACKEND_DIR}/.env
ExecStart=${NODE_BIN} src/index.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now ssmanager-panel
systemctl restart ssmanager-panel

# ---------------------------------------------------------------------------
log "step 6/6: done"
# ---------------------------------------------------------------------------

sleep 1
if systemctl is-active --quiet ssmanager-panel; then
  log "ssmanager-panel is running"
else
  warn "ssmanager-panel did not start cleanly, check: journalctl -u ssmanager-panel -e"
fi

SERVER_IP="$(curl -fsSL --max-time 3 https://api.ipify.org 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo YOUR_SERVER_IP)"

echo
echo "=============================================================="
echo " 面板地址:   http://${SERVER_IP}:${PANEL_PORT}"
if [[ -n "$ADMIN_PASSWORD_GENERATED" ]]; then
echo " 管理员账号: admin"
echo " 管理员密码: ${ADMIN_PASSWORD_GENERATED}"
echo " (完整配置见 ${BACKEND_DIR}/.env，请妥善保存密码)"
else
echo " backend/.env 已存在，未重新生成账号密码"
fi
echo
if [[ "$SKIP_SSRUST" -eq 1 ]]; then
echo " 已跳过 shadowsocks-rust 安装（--skip-ssrust）。请在「设置」页面填写你自己的"
echo " ssmanager 可执行文件路径。"
else
echo " shadowsocks-rust 已安装到 ${SSRUST_BIN_DIR}（尚未启动）。"
echo " 登录面板后进入「设置」页面，确认可执行文件路径后点击「启动」即可拉起 ssmanager。"
fi
echo
echo " 常用命令:"
echo "   systemctl status ssmanager-panel"
echo "   journalctl -u ssmanager-panel -f"
echo "   systemctl restart ssmanager-panel"
echo
echo " 别忘了在防火墙/安全组放行 ${PANEL_PORT} 端口（面板本身）以及后续在面板里"
echo " 新增的 shadowsocks 端口。"
echo "=============================================================="
