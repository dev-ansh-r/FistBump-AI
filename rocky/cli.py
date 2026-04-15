"""Rocky backend entry point — runs as a sidecar process for the Tauri desktop app."""

import os
import sys
import typer
import uvicorn
from rich.console import Console

if os.name == "nt":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except AttributeError:
        pass

console = Console(stderr=True)
app = typer.Typer(name="rocky-backend", add_completion=False)


@app.command()
def main(
    port: int = typer.Option(6070, "--port", help="Backend HTTP port"),
    host: str = typer.Option("127.0.0.1", "--host", help="Backend bind host"),
):
    """Start Rocky's local HTTP backend (used by the Tauri desktop app)."""
    from rocky.server.rest_api import app as api_app
    console.print(f"[cyan]Rocky backend[/cyan] listening on http://{host}:{port}")
    uvicorn.run(api_app, host=host, port=port, log_level="warning")


if __name__ == "__main__":
    app()
