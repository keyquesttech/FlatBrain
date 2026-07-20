#!/usr/bin/env bash
#
# FlatBrain - uninstaller
# ----------------------------------------------------------------------------
# Stops and removes the systemd service (including the pre-FlatBrain
# 'billsplitter' unit if it still exists). By default it leaves your data
# (draft.json, history.json, password.txt) and node_modules/dist in place.
#
# Usage:
#     sudo bash uninstall.sh
# ----------------------------------------------------------------------------
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-flatbrain}"
LEGACY_SERVICE="billsplitter"
TAILSCALE_DNS_SERVICE="${TAILSCALE_DNS_SERVICE:-billsplitter-dns}"

if [ "$(id -u)" -ne 0 ]; then
  echo "==> Root privileges required; re-running with sudo..."
  exec sudo -E bash "$0" "$@"
fi

SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

echo "==> Stopping and disabling ${SERVICE_NAME}..."
systemctl stop "${SERVICE_NAME}.service" 2>/dev/null || true
systemctl disable "${SERVICE_NAME}.service" 2>/dev/null || true
systemctl disable --now "${LEGACY_SERVICE}.service" 2>/dev/null || true
rm -f "/etc/systemd/system/${LEGACY_SERVICE}.service"
systemctl stop "${TAILSCALE_DNS_SERVICE}.service" 2>/dev/null || true
systemctl disable "${TAILSCALE_DNS_SERVICE}.service" 2>/dev/null || true

if [ -f "$SERVICE_FILE" ]; then
  echo "==> Removing $SERVICE_FILE"
  rm -f "$SERVICE_FILE"
fi

DNS_SERVICE_FILE="/etc/systemd/system/${TAILSCALE_DNS_SERVICE}.service"
if [ -f "$DNS_SERVICE_FILE" ]; then
  echo "==> Removing $DNS_SERVICE_FILE"
  rm -f "$DNS_SERVICE_FILE"
fi

rm -f /etc/billsplitter/tailscale-dns.conf 2>/dev/null || true
rmdir /etc/billsplitter 2>/dev/null || true

systemctl daemon-reload
systemctl reset-failed "${SERVICE_NAME}.service" 2>/dev/null || true

echo ""
echo "FlatBrain service removed."
echo "Your data files (password.txt / draft.json / history.json) and the app"
echo "code were left untouched. Delete the repo folder to remove them."
