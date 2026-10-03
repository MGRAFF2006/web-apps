#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
image='onlyoffice/documentserver:9.4.0@sha256:e3da62a847b9a5d51a11f73cfea1d9c13c3be3809614490d4edddcf01dcf919b'
mkdir -p runtime/files
cp fixtures/* runtime/files/
if docker container inspect onlyoffice-smartart-before >/dev/null 2>&1; then
    docker start onlyoffice-smartart-before
else
    docker run -d --name onlyoffice-smartart-before --cpus=2 --shm-size=512m \
        -p 127.0.0.1:8780:80 --add-host host.docker.internal:host-gateway \
        -e JWT_ENABLED=false -e ALLOW_PRIVATE_IP_ADDRESS=true "$image"
fi
if [[ ! -d runtime/after/sdkjs/common ]]; then
    bash scripts/stage.sh
fi
if docker container inspect onlyoffice-smartart-after >/dev/null 2>&1; then
    docker start onlyoffice-smartart-after
else
    docker run -d --name onlyoffice-smartart-after --cpus=2 --shm-size=512m \
        -p 127.0.0.1:8781:80 --add-host host.docker.internal:host-gateway \
        -e JWT_ENABLED=false -e ALLOW_PRIVATE_IP_ADDRESS=true \
        --mount "type=bind,src=$PWD/runtime/after/sdkjs,dst=/var/www/onlyoffice/documentserver/sdkjs" \
        --mount "type=bind,src=$PWD/runtime/after/web-apps,dst=/var/www/onlyoffice/documentserver/web-apps" "$image"
fi
if ! tmux has-session -t onlyoffice-demo-host 2>/dev/null; then
    tmux new-session -d -s onlyoffice-demo-host -c "$PWD" \
        'python scripts/serve.py >runtime/host.log 2>&1'
fi
printf '%s\n' 'Preview: http://127.0.0.1:8782/demo?product=word&build=after&fixture=seed' \
    'Wait for both DocumentServers to finish startup (their /healthcheck endpoints return true).'
