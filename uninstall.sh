#!/usr/bin/env bash
#
# Uninstalls the Shadowsocks-rust ssmanager web panel that install.sh set up.
#
# By default this only stops/removes the systemd service (ssmanager-panel).
# Data (backend/.env, the SQLite database with all your ports/admin account),
# the shadowsocks-rust binaries, and the swapfile install.sh may have created
# are all KEPT unless you explicitly ask for them to go, since those are the
# hard-to-recreate/destructive parts.
#
# Usage:
#   sudo ./uninstall.sh [--purge-data] [--remove-ssrust] [--remove-swap] [--all]
#
#   --purge-data    also delete backend/.env and backend/data/ (admin account
#                    and every port you've configured -- cannot be undone)
#   --remove-ssrust  also delete /usr/local/bin/{ssserver,ssmanager,sslocal,ssservice}
#   --remove-swap    also remove /swapfile if install.sh created it (checked
#                     via the /etc/fstab entry install.sh adds)
#   --all            shorthand for all three of the above
#
# The repo checkout itself (this directory) is never touched; remove it
# yourself afterwards if you want (rm -rf).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
SSRUST_BIN_DIR="/usr/local/bin"

PURGE_DATA=0
REMOVE_SSRUST=0
REMOVE_SWAP=0

log()  { echo -e "\033[1;32m[uninstall]\033[0m $*"; }
warn() { echo -e "\033[1;33m[uninstall]\033[0m $*"; }
die()  { echo -e "\033[1;31m[uninstall]\033[0m $*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --purge-data) PURGE_DATA=1; shift ;;
    --remove-ssrust) REMOVE_SSRUST=1; shift ;;
    --remove-swap) REMOVE_SWAP=1; shift ;;
    --all) PURGE_DATA=1; REMOVE_SSRUST=1; REMOVE_SWAP=1; shift ;;
    -h|--help)
      sed -n '2,22p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *) die "unknown option: $1 (see --help)" ;;
  esac
done

[[ $EUID -eq 0 ]] || die "please run as root (sudo ./uninstall.sh)"

log "stopping and disabling ssmanager-panel service"
# KillMode defaults to control-group, so this also kills the ssmanager child
# process the panel spawned (they share the service's cgroup).
systemctl stop ssmanager-panel 2>/dev/null || true
systemctl disable ssmanager-panel 2>/dev/null || true
rm -f /etc/systemd/system/ssmanager-panel.service
systemctl daemon-reload

if [[ "$REMOVE_SWAP" -eq 1 ]]; then
  if grep -q '^/swapfile ' /etc/fstab 2>/dev/null; then
    log "removing /swapfile (added by install.sh)"
    swapoff /swapfile 2>/dev/null || true
    sed -i '\#^/swapfile #d' /etc/fstab
    rm -f /swapfile
  else
    log "no /swapfile entry in /etc/fstab, nothing to remove"
  fi
fi

if [[ "$REMOVE_SSRUST" -eq 1 ]]; then
  log "removing shadowsocks-rust binaries from $SSRUST_BIN_DIR"
  rm -f "$SSRUST_BIN_DIR/ssserver" "$SSRUST_BIN_DIR/ssmanager" "$SSRUST_BIN_DIR/sslocal" "$SSRUST_BIN_DIR/ssservice"
fi

if [[ "$PURGE_DATA" -eq 1 ]]; then
  warn "deleting backend/.env and backend/data (admin account + all ports, irreversible)"
  rm -f "$BACKEND_DIR/.env"
  rm -rf "$BACKEND_DIR/data"
fi

echo
echo "=============================================================="
echo " ssmanager-panel 服务已停止并移除。"
[[ "$PURGE_DATA" -eq 0 ]] && echo " 数据保留在 ${BACKEND_DIR}/.env 和 ${BACKEND_DIR}/data/（如需彻底删除加 --purge-data）"
[[ "$REMOVE_SSRUST" -eq 0 ]] && echo " shadowsocks-rust 二进制保留在 ${SSRUST_BIN_DIR}（如需删除加 --remove-ssrust）"
[[ "$REMOVE_SWAP" -eq 0 ]] && echo " swapfile（如果有）保留（如需删除加 --remove-swap）"
echo " 仓库代码本身未删除，如需彻底清理: rm -rf ${SCRIPT_DIR}"
echo "=============================================================="
