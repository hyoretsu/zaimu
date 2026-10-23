"""Reject missing production endpoints before Vite can inline a localhost fallback."""
import os
from urllib.parse import urlparse

for key in ("VITE_API_URL", "VITE_APP_URL"):
    url = urlparse(os.environ.get(key, ""))
    if url.scheme != "https" or not url.hostname or url.hostname in ("localhost", "127.0.0.1", "::1"):
        raise ValueError(f"{key} must point to the HTTPS production service")
