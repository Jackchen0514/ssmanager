#!/usr/bin/env bash
#
# Updates an existing Shadowsocks-rust ssmanager web panel install (set up by
# install.sh) to the latest code, without touching your data.
#
# What it never touches: backend/.env (JWT secret, admin password, manager
# config), backend/data/ (the SQLite DB -- every port, its traffic history,
# API tokens), or an already-installed shadowsocks-rust binary. Those are
# either left alone in a git checkout, or, in a standalone install (see
# below), copied forward unchanged into the freshly-fetched source before
# anything else happens.
#
# Usage:
#   sudo ./update.sh [any install.sh flag, e.g. --force-ssrust / --no-autostart]
#
# What it does:
#   1. Fetches the latest source:
#        - git checkout (this directory has a .git folder): `git pull --ff-only`.
#          Does nothing and exits with an error if that's not possible (local
#          edits, diverged branch) -- resolve manually (git status/git stash)
#          and re-run rather than risk clobbering something.
#        - standalone install (no .git, e.g. installed via `curl | bash`):
#          re-downloads the source tarball from GitHub into a scratch
#          directory, copies backend/.env, backend/data and frontend/dist
#          forward into it first, then swaps it into place.
#   2. Hands off to install.sh, which on a re-run only refreshes backend
#      deps, the frontend build, and the systemd service -- it already never
#      overwrites backend/.env, never re-seeds the admin account, and never
#      reinstalls shadowsocks-rust unless you pass --force-ssrust.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
SSMANAGER_REPO="${SSMANAGER_REPO:-Jackchen0514/ssmanager}"

log()  { echo -e "\033[1;32m[update]\033[0m $*"; }
warn() { echo -e "\033[1;33m[update]\033[0m $*"; }
die()  { echo -e "\033[1;31m[update]\033[0m $*" >&2; exit 1; }

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  sed -n '2,25p' "${BASH_SOURCE[0]}"
  exit 0
fi

[[ $EUID -eq 0 ]] || die "please run as root (sudo ./update.sh)"
[[ -d "$BACKEND_DIR" && -d "$FRONTEND_DIR" ]] || die "no existing install found next to this script -- run install.sh first"
[[ -x "$SCRIPT_DIR/install.sh" ]] || die "install.sh not found next to update.sh"

OLD_VERSION="$(cat "$SCRIPT_DIR/VERSION" 2>/dev/null || echo unknown)"

if [[ -d "$SCRIPT_DIR/.git" ]]; then
  log "git checkout detected, pulling latest (fast-forward only)"
  git -C "$SCRIPT_DIR" pull --ff-only \
    || die "git pull failed -- likely local changes or a diverged branch. Resolve manually (git status/git stash) and re-run."
else
  log "standalone install detected, re-downloading source from github.com/${SSMANAGER_REPO} (main)"
  command -v curl >/dev/null || die "curl is required (apt-get install -y curl), then re-run"
  command -v tar  >/dev/null || die "tar is required (apt-get install -y tar), then re-run"

  # Extracted into a scratch directory first, never written in place: this
  # script is itself running from inside $SCRIPT_DIR, and in-place-overwriting
  # a running script's own file content can corrupt the interpreter mid-read.
  # rm -rf + mv (below) is safe instead -- Unix keeps a still-open file's data
  # alive until the last file descriptor closes, so unlinking the directory
  # entry from under this running process doesn't disturb it.
  SRC_TMP="$(mktemp -d)"
  curl -fsSL "https://github.com/${SSMANAGER_REPO}/archive/refs/heads/main.tar.gz" \
    | tar -xz -C "$SRC_TMP" --strip-components=1

  for keep in backend/.env backend/data frontend/dist; do
    if [[ -e "$SCRIPT_DIR/$keep" ]]; then
      mkdir -p "$SRC_TMP/$(dirname "$keep")"
      rm -rf "${SRC_TMP:?}/$keep"
      cp -a "$SCRIPT_DIR/$keep" "$SRC_TMP/$keep"
    fi
  done

  rm -rf "${SCRIPT_DIR:?}"
  mv "$SRC_TMP" "$SCRIPT_DIR"
fi

NEW_VERSION="$(cat "$SCRIPT_DIR/VERSION" 2>/dev/null || echo unknown)"
if [[ "$OLD_VERSION" != "$NEW_VERSION" ]]; then
  log "version ${OLD_VERSION} -> ${NEW_VERSION}"
else
  log "already on the latest fetched version (${NEW_VERSION})"
fi

log "handing off to install.sh to refresh dependencies/frontend/service"
exec "$SCRIPT_DIR/install.sh" "$@"
