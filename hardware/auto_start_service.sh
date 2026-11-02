#!/usr/bin/env bash

set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-face-detection-ai}"
APP_USER="${APP_USER:-${SUDO_USER:-$USER}}"
PROJECT_DIR="${PROJECT_DIR:-/home/${APP_USER}/face-detection/ai-service}"
VENV_PYTHON="${VENV_PYTHON:-${PROJECT_DIR}/.venv/bin/python}"
MAIN_FILE="${MAIN_FILE:-${PROJECT_DIR}/main.py}"
UNIT_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
START_NOW="${START_NOW:-true}"

log() {
  printf '[auto-start] %s\n' "$1"
}

fail() {
  printf '[auto-start] ERROR: %s\n' "$1" >&2
  exit 1
}

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    log "Re-running with sudo..."
    exec sudo -E bash "$0" "$@"
  fi
}

check_prerequisites() {
  command -v systemctl >/dev/null 2>&1 || fail "systemctl not found. This script requires systemd."
  [[ -d "${PROJECT_DIR}" ]] || fail "Project directory not found: ${PROJECT_DIR}"
  [[ -f "${MAIN_FILE}" ]] || fail "Main file not found: ${MAIN_FILE}"
  [[ -x "${VENV_PYTHON}" ]] || fail "Virtualenv Python not found/executable: ${VENV_PYTHON}"
  id "${APP_USER}" >/dev/null 2>&1 || fail "User not found: ${APP_USER}"
}

write_unit_file() {
  log "Creating systemd unit: ${UNIT_FILE}"
  cat > "${UNIT_FILE}" <<EOF
[Unit]
Description=Face Detection AI Service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${PROJECT_DIR}
Environment=PYTHONUNBUFFERED=1
ExecStart=${VENV_PYTHON} ${MAIN_FILE}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
}

enable_service() {
  log "Reloading systemd daemon..."
  systemctl daemon-reload

  log "Enabling ${SERVICE_NAME} on boot..."
  systemctl enable "${SERVICE_NAME}"

  if [[ "${START_NOW}" == "true" ]]; then
    log "Starting ${SERVICE_NAME} now..."
    systemctl restart "${SERVICE_NAME}"
  fi

  log "Service status:"
  systemctl --no-pager --full status "${SERVICE_NAME}" || true
}

print_next_steps() {
  cat <<EOF

Done.

Useful commands:
  sudo systemctl status ${SERVICE_NAME}
  sudo journalctl -u ${SERVICE_NAME} -f
  sudo systemctl restart ${SERVICE_NAME}
  sudo systemctl disable --now ${SERVICE_NAME}

Configured values:
  SERVICE_NAME=${SERVICE_NAME}
  APP_USER=${APP_USER}
  PROJECT_DIR=${PROJECT_DIR}
  VENV_PYTHON=${VENV_PYTHON}
EOF
}

main() {
  require_root "$@"
  check_prerequisites
  write_unit_file
  enable_service
  print_next_steps
}

main "$@"
