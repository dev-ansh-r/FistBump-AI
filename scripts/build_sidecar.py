#!/usr/bin/env python3
"""
Bundle the Python backend as a standalone executable for Tauri sidecar use.

Produces:
  rocky/ui/src-tauri/binaries/rocky-backend-<rust-target-triple>[.exe]

The suffix matters — Tauri's externalBin matcher looks for exactly that name
on each platform. Run from the repo root:

    pip install pyinstaller
    python scripts/build_sidecar.py
"""

from __future__ import annotations

import argparse
import platform
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT_DIR = REPO / "rocky" / "ui" / "src-tauri" / "binaries"
ENTRY = REPO / "rocky" / "cli.py"


def rust_target_triple() -> str:
    """Ask rustc directly; fall back to platform heuristics if rustc missing."""
    try:
        r = subprocess.run(["rustc", "-vV"], capture_output=True, text=True, check=True)
        for line in r.stdout.splitlines():
            if line.startswith("host:"):
                return line.split(":", 1)[1].strip()
    except (FileNotFoundError, subprocess.CalledProcessError):
        pass

    machine = platform.machine().lower()
    arch_map = {"x86_64": "x86_64", "amd64": "x86_64", "arm64": "aarch64", "aarch64": "aarch64"}
    arch = arch_map.get(machine, machine)
    system = platform.system().lower()
    if system == "windows":
        return f"{arch}-pc-windows-msvc"
    if system == "darwin":
        return f"{arch}-apple-darwin"
    return f"{arch}-unknown-linux-gnu"


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the rocky-backend sidecar binary.")
    parser.add_argument(
        "--target",
        help="Rust target triple to name the output for (defaults to rustc host). "
             "CI should pass this explicitly to avoid host/target mismatch surprises.",
    )
    args = parser.parse_args()
    triple = args.target or rust_target_triple()
    is_windows = sys.platform.startswith("win")
    ext = ".exe" if is_windows else ""
    final_name = f"rocky-backend-{triple}{ext}"

    print(f"[sidecar] target triple: {triple}")
    print(f"[sidecar] output: {OUT_DIR / final_name}")

    # Clean previous PyInstaller temp
    for p in (REPO / "build", REPO / "dist"):
        if p.exists():
            shutil.rmtree(p)
    for spec in REPO.glob("*.spec"):
        spec.unlink()

    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onefile",
        "--noconfirm",
        "--name", f"rocky-backend-{triple}",
        # Grab sub-packages PyInstaller can't introspect on its own
        "--collect-all", "onnx",
        "--collect-submodules", "fastapi",
        "--collect-submodules", "uvicorn",
        "--collect-submodules", "httpx",
        "--collect-submodules", "pydantic",
        "--collect-submodules", "rocky",
        str(ENTRY),
    ]
    if is_windows:
        # No terminal window flashes when Tauri spawns the sidecar
        cmd.append("--noconsole")

    print("[sidecar] running PyInstaller…")
    result = subprocess.run(cmd, cwd=REPO)
    if result.returncode != 0:
        print("[sidecar] PyInstaller failed", file=sys.stderr)
        return result.returncode

    src = REPO / "dist" / final_name
    if not src.exists():
        print(f"[sidecar] expected {src} not found", file=sys.stderr)
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    dst = OUT_DIR / final_name
    if dst.exists():
        dst.unlink()
    shutil.move(str(src), str(dst))

    # PyInstaller build artifacts
    for p in (REPO / "build", REPO / "dist"):
        if p.exists():
            shutil.rmtree(p)
    for spec in REPO.glob("*.spec"):
        spec.unlink()

    print(f"[sidecar] done: {dst}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
