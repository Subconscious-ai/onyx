"""Test runs cannot reuse an inherited runtime Sentry destination."""

import os
import subprocess
import sys
from pathlib import Path


def test_pytest_does_not_use_an_inherited_sentry_destination(tmp_path: Path) -> None:
    backend = Path(__file__).resolve().parents[4]
    probe = tmp_path / "test_destination.py"
    probe.write_text(
        "import os\n"
        "from shared_configs import configs\n"
        "def test_destination():\n"
        "    assert not os.environ.get('SENTRY_DSN')\n"
        "    assert not configs.SENTRY_DSN\n"
    )
    env = {
        **os.environ,
        "SENTRY_DSN": "https://test@127.0.0.1/1",
        "PYTHONPATH": str(backend),
        "PYTEST_DISABLE_PLUGIN_AUTOLOAD": "1",
    }
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "pytest",
            "-p",
            "tests.conftest",
            "-c",
            str(backend / "pytest.ini"),
            "-q",
            str(probe),
        ],
        cwd=backend,
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
