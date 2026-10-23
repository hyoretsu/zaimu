"""Reject incomplete/mixed artifacts before any GitHub release mutation."""
import hashlib
import json
import os
import shutil
from pathlib import Path

matrix = json.loads(os.environ["MATRIX"])
output = Path("release-assets")
output.mkdir()
records = []
for item in matrix:
    artifact = Path("downloaded") / f"app-{item['platform']}{item['variant']['suffix']}"
    metadata = json.loads((artifact / "metadata.json").read_text())
    expected = {"version": os.environ["EXPECTED_VERSION"], "commit": os.environ["GITHUB_SHA"],
                "platform": item["platform"], "variant": item["variant"]["slug"]}
    if any(metadata[key] != value for key, value in expected.items()):
        raise ValueError(f"Mismatched artifact metadata: {artifact}")
    if item["platform"] == "android" and not metadata["signed"]:
        raise ValueError("Cannot publish an unsigned Android release")
    files = list((artifact / "release").iterdir())
    if not files:
        raise ValueError(f"Empty artifact: {artifact}")
    for file in files:
        destination = output / file.name
        if destination.exists():
            raise ValueError(f"Duplicate asset: {file.name}")
        shutil.copy2(file, destination)
    records.append(metadata)
(output / "builds.json").write_text(json.dumps(records, indent=2) + "\n")
with (output / "SHA256SUMS").open("w") as checksums:
    for file in sorted(output.iterdir()):
        if file.name != "SHA256SUMS":
            checksums.write(f"{hashlib.sha256(file.read_bytes()).hexdigest()}  {file.name}\n")
