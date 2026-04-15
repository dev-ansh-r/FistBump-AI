"""
DLC parser stub — wraps Qualcomm snpe-dlc-info CLI output.
Only activates if snpe-dlc-info is found on PATH.
Phase 3 implementation.
"""

import subprocess
import shutil


def dlc_available() -> bool:
    return shutil.which("snpe-dlc-info") is not None


def parse_dlc(path: str, state) -> dict:
    """
    Run snpe-dlc-info and parse its text output into
    the same NodeDetail/ModelSummary structure as the ONNX parser.
    Phase 3: not yet implemented.
    """
    if not dlc_available():
        return {"error": "snpe-dlc-info not found. Install Qualcomm SNPE SDK."}

    result = subprocess.run(
        ["snpe-dlc-info", "-i", path],
        capture_output=True,
        text=True,
        check=False,
    )

    if result.returncode != 0:
        return {"error": f"snpe-dlc-info failed: {result.stderr}"}

    # TODO Phase 3: parse result.stdout into NodeDetail/ModelSummary
    raise NotImplementedError("DLC parsing is Phase 3.")
