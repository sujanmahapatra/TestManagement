"""Picks up GROQ_API_KEY (and APP_PASSWORD) from server/.env when they are not
already set, so the key lives in one place and never has to be retyped."""

import os
from pathlib import Path

os.environ.setdefault("DEEPEVAL_TELEMETRY_OPT_OUT", "YES")

env_file = Path(__file__).parent.parent / "server" / ".env"
if env_file.exists():
    for line in env_file.read_text(encoding="utf-8").splitlines():
        key, sep, value = line.partition("=")
        if sep and key.strip() in ("GROQ_API_KEY", "APP_PASSWORD") and value.strip():
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
