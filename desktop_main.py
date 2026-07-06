"""
Desktop entry point for PyInstaller-packaged application.
Starts FastAPI backend and opens the browser.
"""
import sys
import os
import io

# Windowed mode (console=False): sys.stdout/stderr are None → redirect to null
if sys.stdout is None:
    sys.stdout = io.StringIO()
if sys.stderr is None:
    sys.stderr = io.StringIO()

import webbrowser
from backend.app import app
import uvicorn


def main():
    log_config = uvicorn.config.LOGGING_CONFIG
    log_config["formatters"]["default"]["fmt"] = "%(asctime)s %(levelprefix)s %(message)s"
    log_config["formatters"]["access"]["fmt"] = '%(asctime)s %(levelprefix)s %(client_addr)s - "%(request_line)s" %(status_code)s'
    for _cfg in log_config.get("formatters", {}).values():
        if "()" in _cfg:
            del _cfg["()"]
        _cfg.setdefault("use_colors", False)

    port = 8766
    webbrowser.open(f"http://localhost:{port}")
    uvicorn.run(app, host="0.0.0.0", port=port, log_config=log_config)


if __name__ == '__main__':
    main()
