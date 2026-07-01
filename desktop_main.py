"""
Desktop entry point for PyInstaller-packaged application.
Starts FastAPI backend and opens the browser.
"""
import webbrowser
from backend.app import app
import uvicorn


def main():
    port = 8766
    webbrowser.open(f"http://localhost:{port}")
    uvicorn.run(app, host="0.0.0.0", port=port)


if __name__ == '__main__':
    main()
