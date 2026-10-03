#!/usr/bin/env python3
"""Build matching 9.4.0 assets, restoring Grunt's source version counters."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
env = dict(os.environ, PRODUCT_VERSION="9.4.0", BUILD_NUMBER="129")
subprocess.run(["python", "build/build.py"], cwd=root / "sdkjs", env=env, check=True)
build = root / "web-apps/build"
grunt = str(build / "node_modules/.bin/grunt")
subprocess.run([grunt, "prebuild-icons-sprite"], cwd=build, env=env, check=True)
subprocess.run([grunt, "init-build-common", "apps-common-init", "copy", "inline"], cwd=build, env=env, check=True)
for product in ("documenteditor", "spreadsheeteditor", "presentationeditor", "pdfeditor"):
    config = build / (product + ".json")
    original = config.read_bytes()
    try:
        subprocess.run([grunt, "init-build-" + product, "increment-build", "main-app-init",
            "requirejs", "less", "copy", "inline", "json-minify", "replace:writeVersion",
            "replace:prepareHelp"], cwd=build, env=env, check=True)
    finally:
        config.write_bytes(original)
