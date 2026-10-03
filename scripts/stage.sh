#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p runtime/after/{sdkjs,web-apps}
if docker container inspect onlyoffice-smartart-after >/dev/null 2>&1; then
    docker exec --user 0 onlyoffice-smartart-after chown -R "$(id -u):$(id -g)" \
        /var/www/onlyoffice/documentserver/web-apps /var/www/onlyoffice/documentserver/sdkjs
fi
chmod -R u+rwX runtime/after
for component in web-apps sdkjs; do
    docker cp "onlyoffice-smartart-before:/var/www/onlyoffice/documentserver/$component/." - |
        tar -xf - --no-same-owner -C "runtime/after/$component"
done
chmod -R u+rwX runtime/after
python - <<'PY'
from pathlib import Path
import shutil
root = Path.cwd()
for component in ('web-apps', 'sdkjs'):
    shutil.copytree(root.parent / component / 'deploy' / component,
                    root / 'runtime/after' / component, dirs_exist_ok=True)
    # nginx must not serve a packaged gzip sidecar instead of a rebuilt asset.
    for sidecar in (root / 'runtime/after' / component).rglob('*.gz'):
        if sidecar.with_suffix('').is_file():
            sidecar.unlink()
PY
