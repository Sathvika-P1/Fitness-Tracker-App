import os
import urllib.error
import urllib.request
from http.server import HTTPServer, SimpleHTTPRequestHandler

WEB_ROOT = os.path.join(os.path.dirname(__file__), "public")
REPO_ROOT = os.path.dirname(os.path.dirname(__file__))
API_ORIGIN = os.environ.get("API_ORIGIN", "http://localhost:8001")


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        self.directory = REPO_ROOT if path.startswith("/design-system/") else WEB_ROOT
        return super().translate_path(path)

    def do_GET(self):
        if self.path.startswith("/api/"):
            return self._proxy("GET")
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"):
            return self._proxy("POST")
        return super().do_POST()

    def _proxy(self, method):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length else None

        forward_headers = {
            key: value
            for key, value in self.headers.items()
            if key.lower() not in ("host", "content-length")
        }

        request = urllib.request.Request(
            API_ORIGIN + self.path,
            data=body,
            headers=forward_headers,
            method=method,
        )
        try:
            with urllib.request.urlopen(request) as response:
                self._relay_response(response)
        except urllib.error.HTTPError as error:
            self._relay_response(error)

    def _relay_response(self, response):
        self.send_response(response.status if hasattr(response, "status") else response.code)
        for key, value in response.headers.items():
            if key.lower() == "transfer-encoding":
                continue
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(response.read())


if __name__ == "__main__":
    port = int(os.environ.get("ARC_WEB_PORT", 3001))
    HTTPServer(("0.0.0.0", port), Handler).serve_forever()
