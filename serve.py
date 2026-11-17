#!/usr/bin/env python3
"""Local dev server: like `python3 -m http.server` but tells the browser never
to cache, so edits to the JS show up on a plain reload. Usage: python3 serve.py [port]"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
print(f'Tendie Town at http://localhost:{port}/  (walk test: /walk/, controllers: /pad/)')
ThreadingHTTPServer(('', port), NoCache).serve_forever()
