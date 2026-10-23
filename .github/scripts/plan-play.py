"""Resolve Play targets only from a completed release's immutable build manifest."""
import json
import os
import re
import subprocess
from pathlib import Path

tag = os.environ["RELEASE_TAG"]
run_id = os.environ["SOURCE_RUN_ID"]
if not re.fullmatch(r"v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?", tag) or not run_id.isdigit():
    raise ValueError("Expected a semantic version tag and numeric workflow run ID")
repo = os.environ["GITHUB_REPOSITORY"]
def api(path):
    return json.loads(subprocess.check_output(["gh", "api", f"repos/{repo}/{path}"], text=True))
release = api(f"releases/tags/{tag}")
if release["draft"]:
    raise ValueError("Cannot promote a draft release")
run = api(f"actions/runs/{run_id}")
if run["path"] != ".github/workflows/apps.yml" or run["conclusion"] != "success":
    raise ValueError("Source must be a successful apps workflow run")
subprocess.run(["gh", "release", "download", tag, "--pattern", "builds.json", "--dir", "provenance"], check=True)
builds = json.loads(Path("provenance/builds.json").read_text())
android = [b for b in builds if b["platform"] == "android"]
if not android:
    raise ValueError("Release has no Android builds")
if len({b["identifier"] for b in android}) != len(android):
    raise ValueError("Each Android variant must use a distinct package identifier")
matrix = []
for build in android:
    if build["commit"] != run["head_sha"] or tag != "v" + build["version"] or not build["signed"] or not build["storeSHA256"]:
        raise ValueError("Source run/version/signature does not match release provenance")
    variant = build["variant"]
    if variant and not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", variant):
        raise ValueError("Invalid variant in release manifest")
    matrix.append({"suffix": "-" + variant if variant else "", "metadata": build})
with open(os.environ["GITHUB_OUTPUT"], "a") as output:
    output.write("matrix=" + json.dumps(matrix, separators=(",", ":")) + "\n")
