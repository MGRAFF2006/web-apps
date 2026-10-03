#!/usr/bin/env python3
"""Serve synthetic fixtures and a real DocsAPI host page for local captures."""
import html
import http.server
import json
from pathlib import Path
import urllib.parse
import uuid

ROOT = Path(__file__).resolve().parents[1]
PRODUCTS = {"word": "docx", "cell": "xlsx", "slide": "pptx", "pdf": "pdf"}


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / "runtime"), **kwargs)

    def do_POST(self):
        if self.path != "/callback":
            self.send_error(404)
            return
        self.rfile.read(int(self.headers.get("Content-Length", 0)))
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"error":0}')

    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        if url.path != "/demo":
            return super().do_GET()
        query = urllib.parse.parse_qs(url.query)
        product = query.get("product", ["word"])[0]
        variant = query.get("build", ["after"])[0]
        if product not in PRODUCTS or variant not in ("before", "after"):
            self.send_error(400)
            return
        ext = PRODUCTS[product]
        fixture = query.get("fixture", ["blank"])[0]
        if fixture not in ("blank", "seed", "result"):
            self.send_error(400)
            return
        port = 8780 if variant == "before" else 8781
        config = {
            "documentType": product, "type": query.get("type", ["desktop"])[0],
            "width": "100%", "height": "100%",
            "document": {"fileType": ext, "key": uuid.uuid4().hex,
                "title": f"SmartArt demo.{ext}",
                "url": f"http://host.docker.internal:8782/files/{fixture}.{ext}",
                "permissions": {"edit": True, "download": True}},
            "editorConfig": {"mode": "edit", "lang": "en",
                "callbackUrl": "http://host.docker.internal:8782/callback",
                "user": {"id": "smartart-demo", "name": "SmartArt demo"},
                "customization": {"autosave": False, "forcesave": True,
                    "help": False, "uiTheme": "theme-light", "compactHeader": True}}
        }
        title = {"word": "Documents", "cell": "Spreadsheets", "slide": "Presentations", "pdf": "PDF"}[product]
        label = "BEFORE · ONLYOFFICE 9.4.0" if variant == "before" else "AFTER · SmartArt PR builds"
        page = f'''<!doctype html><html><head><meta charset="utf-8">
<title>{title} — SmartArt {variant}</title><style>
html,body{{margin:0;height:100%;font-family:Arial,sans-serif;background:#f2f3f5}}
header{{height:46px;padding:0 22px;display:flex;align-items:center;justify-content:space-between;box-sizing:border-box;background:#202632;color:white;font-size:15px}}
#editor{{height:calc(100vh - 46px)}}iframe{{border:0}}#status{{font-size:12px;color:#c8d2e2}}
</style></head><body><header><strong>{html.escape(title)} · {label}</strong><span id="status">Opening synthetic demo file…</span></header>
<div id="editor"></div><script src="http://127.0.0.1:{port}/web-apps/apps/api/documents/api.js"></script>
<script>const config={json.dumps(config)};window.demoReady=false;
config.events={{onDocumentReady:function(){{window.demoReady=true;document.querySelector('#status').textContent='Real editor · synthetic fixture';}},onError:function(e){{document.querySelector('#status').textContent=JSON.stringify(e.data);}}}};
window.demoEditor=new DocsAPI.DocEditor('editor',config);</script></body></html>'''
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(page.encode())


if __name__ == "__main__":
    http.server.ThreadingHTTPServer(("0.0.0.0", 8782), Handler).serve_forever()
