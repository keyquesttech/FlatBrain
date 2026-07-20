#!/usr/bin/env bash
#
# FlatBrain - Raspberry Pi installer
# ----------------------------------------------------------------------------
# Installs Node.js, installs dependencies, builds the web app, and configures a
# systemd service so the app starts automatically on boot. Also sets the Pi's
# mDNS hostname so it is reachable at http://flatbrain.local on the LAN.
#
# Usage (from inside the cloned repo):
#     sudo bash install.sh
#
# The script is idempotent - it is safe to run again to update an existing
# install. Behaviour can be tuned with environment variables, e.g.:
#     sudo PORT=8080 APP_HOSTNAME=myflat bash install.sh
# ----------------------------------------------------------------------------
set -euo pipefail

# ----- Configuration (override via environment variables) -------------------
SERVICE_NAME="${SERVICE_NAME:-flatbrain}"      # systemd service name
PORT="${PORT:-80}"                              # port the app listens on
NODE_MAJOR="${NODE_MAJOR:-22}"                  # Node.js major version to install
APP_HOSTNAME="${APP_HOSTNAME:-flatbrain}"       # mDNS name -> http://<name>.local (empty to skip)
LEGACY_SERVICE="billsplitter"                   # pre-FlatBrain service name, migrated away if present

# ----- Re-run with root privileges if needed --------------------------------
if [ "$(id -u)" -ne 0 ]; then
  echo "==> Root privileges required; re-running with sudo..."
  exec sudo -E bash "$0" "$@"
fi

# Absolute path to this repo (directory containing this script)
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# The non-root user the service should run as (the one who invoked sudo)
RUN_USER="${SUDO_USER:-$(logname 2>/dev/null || echo pi)}"

echo "=================================================================="
echo " FlatBrain installer"
echo "   Repo directory : $APP_DIR"
echo "   Run as user     : $RUN_USER"
echo "   Listen port     : $PORT"
echo "   Service name    : $SERVICE_NAME"
echo "   mDNS hostname   : ${APP_HOSTNAME:-<disabled>}"
echo "=================================================================="

# ----- 1. Base system packages ----------------------------------------------
echo "==> Installing base packages (curl, git, avahi)..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates git avahi-daemon avahi-utils

# ----- 2. Node.js ------------------------------------------------------------
# We install the official Node.js binaries straight from nodejs.org on ARM
# systems (both 32-bit armhf and 64-bit arm64/aarch64) since they are highly
# compatible, stable, and don't require adding external apt repositories.
# Only amd64 still uses NodeSource.
install_node=1
if command -v node >/dev/null 2>&1; then
  current_major="$(node -v | sed 's/v\([0-9]*\).*/\1/')"
  if [ "$current_major" -ge 18 ]; then
    echo "==> Node.js $(node -v) already installed (>= 18). Skipping."
    install_node=0
  else
    echo "==> Node.js $(node -v) is too old; installing ${NODE_MAJOR}.x."
  fi
fi

install_node_from_nodesource() {
  echo "==> Installing Node.js ${NODE_MAJOR}.x via NodeSource ($1)..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
}

install_node_tarball() {
  # $1 = node arch (armv7l / armv6l / arm64). Installs official (or unofficial for v6)
  # prebuilt binaries into /usr/local.
  node_arch="$1"
  apt-get install -y xz-utils
  if [ "$node_arch" = "armv6l" ]; then
    # Official builds dropped ARMv6; use the community "unofficial-builds".
    base="https://unofficial-builds.nodejs.org/download/release"
    ver="$(curl -fsSL "$base/index.json" | tr ',{' '\n' | grep -m1 '"version":"v'"${NODE_MAJOR}" | sed 's/.*"v/v/;s/"//g')" || true
    [ -z "${ver:-}" ] && { echo "ERROR: could not find an ARMv6 Node ${NODE_MAJOR} build."; exit 1; }
    url="$base/$ver/node-$ver-linux-armv6l.tar.xz"
  else
    base="https://nodejs.org/dist/latest-v${NODE_MAJOR}.x"
    file="$(curl -fsSL "$base/SHASUMS256.txt" | grep "linux-${node_arch}.tar.xz" | awk '{print $2}' | head -n1)" || true
    [ -z "${file:-}" ] && { echo "ERROR: could not find a linux-${node_arch} build for Node ${NODE_MAJOR}."; exit 1; }
    url="$base/$file"
  fi
  echo "==> Installing Node.js ${NODE_MAJOR}.x from: $url"
  curl -fsSL "$url" -o /tmp/node-dl.tar.xz
  tar -xJf /tmp/node-dl.tar.xz -C /usr/local --strip-components=1
  rm -f /tmp/node-dl.tar.xz
}

if [ "$install_node" -eq 1 ]; then
  DPKG_ARCH="$(dpkg --print-architecture 2>/dev/null || echo '')"
  KERNEL_ARCH="$(uname -m)"
  echo "==> Detected architecture: dpkg='${DPKG_ARCH:-unknown}' kernel='$KERNEL_ARCH'"

  case "$DPKG_ARCH" in
    amd64)
      install_node_from_nodesource "$DPKG_ARCH"
      ;;
    arm64)
      install_node_tarball "arm64"
      ;;
    armhf)
      # 32-bit userland: pick ARMv6 vs ARMv7 based on the actual CPU. Note the
      # kernel may report aarch64 while the userland is armhf (common on Pi 4).
      if [ "$KERNEL_ARCH" = "armv6l" ]; then
        install_node_tarball "armv6l"
      else
        install_node_tarball "armv7l"
      fi
      ;;
    *)
      # Fall back to the kernel architecture if dpkg is unavailable/unknown.
      case "$KERNEL_ARCH" in
        x86_64)  install_node_from_nodesource "x86_64" ;;
        aarch64) install_node_tarball "arm64" ;;
        armv7l)  install_node_tarball "armv7l" ;;
        armv6l)  install_node_tarball "armv6l" ;;
        *) echo "ERROR: unsupported architecture (dpkg='$DPKG_ARCH', kernel='$KERNEL_ARCH')."; exit 1 ;;
      esac
      ;;
  esac
  hash -r
fi
echo "==> Using $(node -v) / npm $(npm -v)"

# ----- 3. Install runtime dependencies --------------------------------------
# The frontend is pre-built and committed in dist/, so the Pi only needs the
# production dependencies (express + cors, both pure JS). This avoids Vite's
# build toolchain, which has poor 32-bit ARM native-binary support.
echo "==> Installing runtime dependencies..."
sudo -u "$RUN_USER" bash -lc "cd '$APP_DIR' && (npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund)"

# Safety net: only build on-device if a prebuilt frontend is missing.
if [ ! -f "$APP_DIR/dist/index.html" ]; then
  echo "==> No prebuilt dist/ found; building on device (installing dev deps first)..."
  sudo -u "$RUN_USER" bash -lc "cd '$APP_DIR' && npm install --no-audit --no-fund && npm run build"
fi

# ----- 4. systemd service (auto-start on boot) ------------------------------
# Migrate away from the pre-FlatBrain service name so two units never race
# for the same port.
if [ "$SERVICE_NAME" != "$LEGACY_SERVICE" ] && [ -f "/etc/systemd/system/${LEGACY_SERVICE}.service" ]; then
  echo "==> Removing legacy '${LEGACY_SERVICE}' service (replaced by '${SERVICE_NAME}')..."
  systemctl disable --now "${LEGACY_SERVICE}.service" 2>/dev/null || true
  rm -f "/etc/systemd/system/${LEGACY_SERVICE}.service"
  systemctl daemon-reload
fi

SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
NODE_BIN="$(command -v node)"
echo "==> Writing systemd unit: $SERVICE_FILE"
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=FlatBrain flat admin panel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=PORT=$PORT
ExecStart=$NODE_BIN $APP_DIR/server.js
Restart=on-failure
RestartSec=5
# Allow binding to privileged ports (e.g. 80) without running as root.
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
EOF

echo "==> Enabling and starting the service..."
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}.service"
systemctl restart "${SERVICE_NAME}.service"

# ----- 5. mDNS hostname so http://<name>.local works across the LAN ---------
if [ -n "$APP_HOSTNAME" ]; then
  current_host="$(hostname)"
  if [ "$current_host" != "$APP_HOSTNAME" ]; then
    echo "==> Setting hostname to '$APP_HOSTNAME' (advertised as ${APP_HOSTNAME}.local via mDNS)..."
    hostnamectl set-hostname "$APP_HOSTNAME"
    if grep -q "^127.0.1.1" /etc/hosts; then
      sed -i "s/^127.0.1.1.*/127.0.1.1\t${APP_HOSTNAME}/" /etc/hosts
    else
      printf "127.0.1.1\t%s\n" "$APP_HOSTNAME" >> /etc/hosts
    fi
    systemctl restart avahi-daemon || true
  else
    echo "==> Hostname already '$APP_HOSTNAME'."
  fi
fi

# ----- Done ------------------------------------------------------------------
PORT_SUFFIX=""
if [ "$PORT" != "80" ]; then PORT_SUFFIX=":$PORT"; fi

echo ""
echo "=================================================================="
echo " FlatBrain is installed, running, and enabled on boot."
echo ""
echo "   On this Pi : http://localhost${PORT_SUFFIX}"
if [ -n "$APP_HOSTNAME" ]; then
  echo "   On the LAN : http://${APP_HOSTNAME}.local${PORT_SUFFIX}"
fi
echo ""
echo " Useful commands:"
echo "   Status : sudo systemctl status ${SERVICE_NAME}"
echo "   Logs   : journalctl -u ${SERVICE_NAME} -f"
echo "   Restart: sudo systemctl restart ${SERVICE_NAME}"
echo ""
echo " The login password is stored in: ${APP_DIR}/password.txt"
echo " (created on first run; edit that file to change it, then restart)."
echo "=================================================================="
