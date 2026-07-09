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
#   sudo ./install.sh [--skip-ssrust] [--force-ssrust] [--port 3000] [--no-swap] [--build-frontend] [--no-autostart]
#
# After the panel comes up, install.sh logs in with the admin account and
# calls the panel's own "start ssmanager process" API so shadowsocks-rust is
# actually running when the script finishes, not just installed. Pass
# --no-autostart to skip this and start it yourself from the Settings page.
#
# Safe to re-run: it will not overwrite an existing backend/.env or re-seed the
# admin account, and skips the shadowsocks-rust download if already installed.
#
# Frontend: by default the installer tries to download a prebuilt frontend/dist
# from the repo's GitHub Releases (built by .github/workflows/build-frontend.yml
# on GitHub's own runners) instead of running `npm run build` locally, since
# that build can OOM on small/low-RAM VPS boxes. Pass --build-frontend to force
# a local build (e.g. you changed frontend/ code and want to test it).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
PANEL_PORT="${PANEL_PORT:-3000}"
SKIP_SSRUST=0
FORCE_SSRUST=0
NO_SWAP=0
BUILD_FRONTEND=0
NO_AUTOSTART=0

log()  { echo -e "\033[1;32m[install]\033[0m $*"; }
warn() { echo -e "\033[1;33m[install]\033[0m $*"; }
die()  { echo -e "\033[1;31m[install]\033[0m $*" >&2; exit 1; }

# Parses "git@github.com:owner/repo.git" or "https://github.com/owner/repo.git"
# (or without ".git") into "owner/repo". Empty output if origin isn't GitHub.
detect_repo_slug() {
  local url
  url="$(git -C "$SCRIPT_DIR" remote get-url origin 2>/dev/null || true)"
  if [[ "$url" =~ github\.com[:/]([^/]+)/([^/]+)$ ]]; then
    echo "${BASH_REMATCH[1]}/${BASH_REMATCH[2]%.git}"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-ssrust) SKIP_SSRUST=1; shift ;;
    --force-ssrust) FORCE_SSRUST=1; shift ;;
    --port) PANEL_PORT="$2"; shift 2 ;;
    --no-swap) NO_SWAP=1; shift ;;
    --build-frontend) BUILD_FRONTEND=1; shift ;;
    --no-autostart) NO_AUTOSTART=1; shift ;;
    -h|--help)
      sed -n '2,29p' "${BASH_SOURCE[0]}"
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

# npm install (better-sqlite3 compile) and `vite build` (bundling ~2000+
# modules, echarts + element-plus pull in a lot) can both use enough memory to
# get OOM-killed on small VPS boxes with little or no swap. Add a swapfile as
# a safety net if there's none and RAM is tight.
if [[ "$NO_SWAP" -eq 0 ]]; then
  TOTAL_MEM_MB="$(free -m | awk '/^Mem:/{print $2}')"
  TOTAL_SWAP_MB="$(free -m | awk '/^Swap:/{print $2}')"
  if [[ "$TOTAL_SWAP_MB" -eq 0 && "$TOTAL_MEM_MB" -lt 2048 ]]; then
    AVAIL_DISK_MB="$(df -m "$SCRIPT_DIR" | awk 'NR==2{print $4}')"
    SWAP_SIZE_MB=2048
    if [[ "$AVAIL_DISK_MB" -gt $((SWAP_SIZE_MB + 1024)) ]]; then
      log "low memory (${TOTAL_MEM_MB}MB) and no swap found, adding a ${SWAP_SIZE_MB}MB swapfile at /swapfile so npm/vite builds don't get OOM-killed"
      fallocate -l "${SWAP_SIZE_MB}M" /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count="$SWAP_SIZE_MB" status=none
      chmod 600 /swapfile
      mkswap /swapfile >/dev/null
      swapon /swapfile
      grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    else
      warn "low memory (${TOTAL_MEM_MB}MB) and no swap, but not enough free disk space to add one safely — the build below may get OOM-killed. Free up disk space or add swap manually, then re-run."
    fi
  fi
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
  # Fetched to a file rather than a shell variable: the release JSON is
  # several hundred KB (dozens of asset entries), and under `bash -x` a
  # variable that large gets dumped in full into the trace output.
  RELEASE_JSON_FILE="$(mktemp)"
  curl -fsSL https://api.github.com/repos/shadowsocks/shadowsocks-rust/releases/latest -o "$RELEASE_JSON_FILE"
  TAG="$(grep -m1 '"tag_name"' "$RELEASE_JSON_FILE" | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')"
  rm -f "$RELEASE_JSON_FILE"
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
log "step 4/6: frontend"
# ---------------------------------------------------------------------------

cd "$FRONTEND_DIR"
FRONTEND_READY=0

# Let an operator pre-place a build (e.g. built on a bigger machine and scp'd
# over) and skip both the network fetch and the local build entirely.
if [[ "$BUILD_FRONTEND" -eq 0 && -f dist/index.html ]]; then
  log "frontend/dist already present, using it as-is (pass --build-frontend to force a rebuild)"
  FRONTEND_READY=1
fi

if [[ "$BUILD_FRONTEND" -eq 0 && "$FRONTEND_READY" -eq 0 ]]; then
  REPO_SLUG="$(detect_repo_slug)"
  if [[ -n "$REPO_SLUG" ]]; then
    BASE_URL="https://github.com/${REPO_SLUG}/releases/download/frontend-dist-latest"
    PREBUILT_DIR="$(mktemp -d)"
    log "checking for a prebuilt frontend at ${BASE_URL}/frontend-dist.tar.gz"
    # --connect-timeout/--max-time so a slow/blocked CDN path (common when
    # github.com/api.github.com are reachable but the release-asset CDN,
    # objects.githubusercontent.com, is throttled) fails fast instead of
    # hanging for an unbounded time before falling back to a local build.
    # stderr is kept (not redirected to /dev/null) so the actual reason
    # (timeout, DNS, TLS, 404) is visible in the install log.
    if curl -fSL --connect-timeout 10 --max-time 60 -o "$PREBUILT_DIR/frontend-dist.tar.gz" "$BASE_URL/frontend-dist.tar.gz" \
       && curl -fSL --connect-timeout 10 --max-time 30 -o "$PREBUILT_DIR/frontend-dist.tar.gz.sha256" "$BASE_URL/frontend-dist.tar.gz.sha256"; then
      if (cd "$PREBUILT_DIR" && sha256sum -c frontend-dist.tar.gz.sha256 >/dev/null 2>&1); then
        rm -rf dist
        mkdir -p dist
        tar -xzf "$PREBUILT_DIR/frontend-dist.tar.gz" -C dist --strip-components=1
        log "using prebuilt frontend from GitHub Releases (skipped local npm/vite build)"
        FRONTEND_READY=1
      else
        warn "prebuilt frontend checksum mismatch, falling back to local build"
      fi
    else
      warn "couldn't download prebuilt frontend (see curl error above), falling back to local build." \
           "If your network can't reach GitHub's release CDN reliably, build frontend/dist on another" \
           "machine and copy it to $FRONTEND_DIR/dist before re-running to skip this entirely."
    fi
    rm -rf "$PREBUILT_DIR"
  fi
fi

if [[ "$FRONTEND_READY" -eq 0 ]]; then
  npm install

  # Node's default V8 heap-size heuristic is derived from total system RAM and
  # can self-limit to a heap far smaller than what's actually available (e.g.
  # ~250MB on a 512MB-RAM box), causing `vite build` to hit "JavaScript heap
  # out of memory" even with plenty of swap present. Give it an explicit,
  # generous heap based on RAM+swap actually available so it uses the swap
  # safety net above instead of self-limiting.
  BUILD_MEM_MB="$(free -m | awk '/^Mem:/{mem=$2} /^Swap:/{swap=$2} END{print mem+swap}')"
  NODE_HEAP_MB=$(( BUILD_MEM_MB * 70 / 100 ))
  [[ "$NODE_HEAP_MB" -lt 512 ]] && NODE_HEAP_MB=512
  log "building frontend with NODE_OPTIONS=--max-old-space-size=${NODE_HEAP_MB} (detected ${BUILD_MEM_MB}MB RAM+swap)"
  NODE_OPTIONS="--max-old-space-size=${NODE_HEAP_MB}" npm run build
fi

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

# Auto-start the ssmanager process the panel supervises, via the panel's own
# API (not systemd -- the panel manages it as a child process, so starting it
# separately via systemd would just conflict). The panel process always
# restarts fresh above, so its in-memory "is ssmanager running" state is
# always reset; this makes install.sh actually leave shadowsocks-rust running
# instead of just installed.
SSMANAGER_AUTOSTARTED=0
if [[ "$NO_AUTOSTART" -eq 0 ]] && systemctl is-active --quiet ssmanager-panel; then
  PANEL_UP=0
  for i in $(seq 1 15); do
    CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PANEL_PORT}/api/auth/me" 2>/dev/null || true)"
    if [[ -n "$CODE" && "$CODE" != "000" ]]; then
      PANEL_UP=1
      break
    fi
    sleep 1
  done

  if [[ "$PANEL_UP" -eq 1 ]]; then
    ADMIN_USER_ENV="$(grep -m1 '^ADMIN_USERNAME=' "$BACKEND_DIR/.env" | cut -d= -f2-)"
    ADMIN_PASS_ENV="$(grep -m1 '^ADMIN_PASSWORD=' "$BACKEND_DIR/.env" | cut -d= -f2-)"
    LOGIN_BODY="$(python3 -c "import json,sys; print(json.dumps({'username': sys.argv[1], 'password': sys.argv[2]}))" "$ADMIN_USER_ENV" "$ADMIN_PASS_ENV")"
    LOGIN_RESP="$(curl -fsS -X POST "http://127.0.0.1:${PANEL_PORT}/api/auth/login" \
      -H 'Content-Type: application/json' -d "$LOGIN_BODY" 2>/dev/null || true)"
    TOKEN="$(printf '%s' "$LOGIN_RESP" | python3 -c 'import sys,json
try:
    print(json.load(sys.stdin).get("token",""))
except Exception:
    pass' 2>/dev/null || true)"

    if [[ -n "$TOKEN" ]]; then
      START_CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:${PANEL_PORT}/api/process/start" \
        -H "Authorization: Bearer ${TOKEN}" 2>/dev/null || true)"
      if [[ "$START_CODE" == "200" ]]; then
        log "ssmanager process started via panel"
        SSMANAGER_AUTOSTARTED=1
      else
        warn "couldn't auto-start ssmanager (panel API returned HTTP $START_CODE) -- check the binary path/args in Settings and click 启动 manually"
      fi
    else
      warn "couldn't log in to auto-start ssmanager (check ADMIN_USERNAME/ADMIN_PASSWORD in $BACKEND_DIR/.env) -- click 启动 manually from Settings"
    fi
  else
    warn "panel API didn't respond within 15s, skipping ssmanager auto-start -- start it manually from Settings once it's up"
  fi
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
echo " ssmanager 可执行文件路径后点击「启动」。"
else
echo " shadowsocks-rust 已安装到 ${SSRUST_BIN_DIR}。"
fi
if [[ "$SSMANAGER_AUTOSTARTED" -eq 1 ]]; then
echo " ssmanager 进程已自动启动。"
elif [[ "$NO_AUTOSTART" -eq 1 ]]; then
echo " 已跳过自动启动（--no-autostart）。登录面板后进入「设置」页面点击「启动」。"
else
echo " ssmanager 未能自动启动，见上方警告。登录面板后进入「设置」页面确认配置后点击「启动」。"
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
