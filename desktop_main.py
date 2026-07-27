"""
Desktop entry point for PyInstaller-packaged application.
Starts FastAPI backend and opens the browser.
"""
import sys
import os
import io
import traceback

# Determine base dir for logging: next to exe (frozen) or next to this file (dev)
if getattr(sys, 'frozen', False):
    _LOG_DIR = os.path.dirname(sys.executable)
else:
    _LOG_DIR = os.path.dirname(os.path.abspath(__file__))

_STARTUP_LOG = os.path.join(_LOG_DIR, 'startup_errors.log')


def _log_error(msg: str):
    try:
        with open(_STARTUP_LOG, 'a', encoding='utf-8') as f:
            f.write(msg + '\n')
    except Exception:
        pass


try:
    # Windowed mode (console=False): sys.stdout/stderr are None -> redirect to file
    if sys.stdout is None:
        sys.stdout = io.StringIO()
    if sys.stderr is None:
        sys.stderr = io.StringIO()

    import webbrowser
    from backend.app import app
    from backend.batch.scheduler import init as batch_init
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

        port = 8766
        batch_init(port)
        import threading
        def _open_browser():
            import time
            time.sleep(1)
            webbrowser.open(f"http://localhost:{port}")
        threading.Thread(target=_open_browser, daemon=True).start()
        uvicorn.run(app, host="0.0.0.0", port=port, log_config=log_config)
    except Exception as e:
        _log_error(f'Runtime error: {e}\n{traceback.format_exc()}')


if __name__ == '__main__':
    main()
