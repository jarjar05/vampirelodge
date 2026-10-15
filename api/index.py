"""The backend as one Vercel Function. vercel.json sends every /api/... request here.

The backend's code lives in backend/app; this file only makes it importable and gets it ready. On Vercel the app
runs in its serverless mode (see backend/app/services/serverless.py).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.main import app, prepare  # noqa: E402

prepare()

__all__ = ["app"]
