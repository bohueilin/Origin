#!/usr/bin/env bash
# Grade a control solution inside an ephemeral mongo:7.0 container.
set -euo pipefail

APP_DIR="${1:?app dir required}"
if [[ ! -f "${APP_DIR}/query.py" ]]; then
  echo "missing query.py in ${APP_DIR}" >&2
  exit 2
fi

docker run --rm \
  -v "${APP_DIR}:/app" \
  mongo:7.0 \
  bash -lc '
    apt-get update -qq && apt-get install -y -qq python3 python3-pip >/dev/null
    pip3 install -q pymongo "pytest==8.4.1"
    mongod --fork --logpath /var/log/mongodb.log --dbpath /data/db
    sleep 2
    cd /app
    python3 -m pytest task_assets/test_outputs.py -rA -q
  '
