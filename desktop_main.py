"""
Desktop entry point for PyInstaller-packaged application.
Starts FastAPI backend and opens the browser.
Double-clicking again when already running just opens the browser.
"""
import sys
import os
import io
import traceback
import socket

# Determine base dir for logging: next to exe (frozen) or next to this file (dev)
if getattr(sys, 'frozen', False):
    _LOG_DIR = os.path.dirname(sys.executable)
    # Ensure SSL CA certificates are accessible for HTTPS requests
    import certifi
    os.environ['SSL_CERT_FILE'] = certifi.where()
    os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()
else:
    _LOG_DIR = os.path.dirname(os.path.abspath(__file__))

_STARTUP_LOG = os.path.join(_LOG_DIR, 'startup_errors.log')


def _log_error(msg: str):
    try:
        with open(_STARTUP_LOG, 'a', encoding='utf-8') as f:
            f.write(msg + '\n')
    except Exception:
        pass


def _port_in_use(port: int) -> bool:
    """Check if a port is already bound."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.5)
            return s.connect_ex(('127.0.0.1', port)) == 0
    except Exception:
        return False


PORT = 8766

# If already running, just open browser and exit
if _port_in_use(PORT):
    import webbrowser
    webbrowser.open(f'http://localhost:{PORT}')
    sys.exit(0)


try:
    # Windowed mode (console=False): sys.stdout/stderr are None -> redirect to file
    if sys.stdout is None:
        sys.stdout = io.StringIO()
    if sys.stderr is None:
        sys.stderr = io.StringIO()

    from backend.app import app
    from backend.app import SECRET_KEY
    from batch.scheduler import init as batch_init, set_jwt_secret
    import uvicorn
except Exception as e:
    _log_error(f'Import error: {e}\n{traceback.format_exc()}')
    sys.exit(1)


def main():
    try:
        log_config = uvicorn.config.LOGGING_CONFIG
        log_config["formatters"]["default"]["fmt"] = "%(asctime)s %(levelprefix)s %(message)s"
        log_config["formatters"]["access"]["fmt"] = '%(asctime)s %(levelprefix)s %(client_addr)s - "%(request_line)s" %(status_code)s'
        for _cfg in log_config.get("formatters", {}).values():
            if "()" in _cfg:
                del _cfg["()"]
            _cfg.setdefault("use_colors", False)

        set_jwt_secret(SECRET_KEY)
        batch_init(PORT)
        import threading
        def _open_browser():
            import time
            url = f"http://localhost:{PORT}"
            for i in range(5):
                time.sleep(0.5)
                try:
                    os.startfile(url)
                    return
                except Exception:
                    pass
            _log_error("Browser auto-open failed after 5 attempts")
        threading.Thread(target=_open_browser, daemon=True).start()
        uvicorn.run(app, host="0.0.0.0", port=PORT, log_config=log_config)
    except Exception as e:
        _log_error(f'Runtime error: {e}\n{traceback.format_exc()}')


if __name__ == '__main__':
    main()
