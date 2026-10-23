"""Verify downloaded AAB bytes against the published release manifest."""
import hashlib
import json
import os
from pathlib import Path

expected = json.loads(os.environ["EXPECTED_METADATA"])
actual = json.loads(Path("android/metadata.json").read_text())
if actual != expected:
    raise ValueError("Downloaded artifact is not the published Android build")
hashes = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in Path("android/store").glob("*.aab")}
if not hashes or hashes != expected["storeSHA256"]:
    raise ValueError("Store bundles differ from the published release manifest")
