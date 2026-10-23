"""Plan explicit deployment targets; do not turn library builds into images."""
import json
import os
import re
from pathlib import Path

def variants():
    if not Path("branding/defaults").exists():
        return [{"slug": "", "suffix": ""}]
    requested = os.environ.get("REQUESTED_VARIANTS", "").replace(",", "\n")
    configured = requested.strip() or os.environ.get("VARIANTS", "")
    slugs = list(dict.fromkeys(s.strip() for s in configured.splitlines() if s.strip()))
    if any(not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug) for slug in slugs):
        raise ValueError("Invalid variant slug")
    return [{"slug": s, "suffix": f"-{s}" if s else ""} for s in (slugs or [""])]

def plan():
    selected = variants()
    mode = os.environ.get("CD_MODE", "images")
    outputs = {"variants": selected}
    if mode == "images":
        affected = json.loads(os.environ["TASKS"]).get("build", [])
        target = os.environ.get("TARGET", "affected")
        services = [("backend", "backend", "backend/Dockerfile"),
                    ("worker", "backend", "backend/Dockerfile.worker"),
                    ("frontend", "frontend", "frontend/Dockerfile")]
        matrix = [dict(service=s, dockerfile=d, variant=v)
                  for s, p, d in services for v in selected
                  if (target in ("all", s) or target == "affected" and p in affected)]
    else:
        platform = os.environ.get("PLATFORM", "all")
        publish = os.environ.get("PUBLISH", "false") == "true"
        if publish and platform != "all":
            raise ValueError("Publishing requires every platform")
        config_path = "branding/defaults/tauri.conf.json" if Path("branding/defaults").exists() else "frontend/src-tauri/tauri.conf.json"
        config = json.loads(Path(config_path).read_text())
        version = config["version"]
        if not isinstance(version, str) or not re.fullmatch(r"\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?", version):
            raise ValueError("Use a literal semantic version in tauri.conf.json")
        tag = "v" + version
        if publish and os.environ.get("GITHUB_REF") != "refs/tags/" + tag:
            raise ValueError(f"Publishing requires the existing tag {tag}, matching the native app version")
        outputs.update(version=version, tag=tag, publish=publish, name=config["productName"])
        platforms = [("windows", "windows-latest", "desktop"),
                     ("linux", "ubuntu-latest", "desktop"),
                     ("macos", "macos-latest", "desktop"),
                     ("android", "ubuntu-latest", "android"),
                     ("ios", "macos-latest", "ios")]
        matrix = [dict(platform=p, runner=r, kind=k, variant=v)
                  for p, r, k in platforms for v in selected
                  if platform in ("all", p, k)]
    outputs["matrix"] = matrix
    return outputs

if __name__ == "__main__":
    result = plan()
    lines = [f"{key}={json.dumps(value, separators=(',', ':')) if not isinstance(value, str) else value}\n"
             for key, value in result.items()]
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
        output.writelines(lines)
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as summary:
        summary.write(f"Commit: `{os.environ['GITHUB_SHA']}`\n\n")
        summary.write("Planned builds:\n\n")
        for item in result["matrix"]:
            summary.write(f"- {item.get('service', item.get('platform'))}{item['variant']['suffix']}\n")
        if not result["matrix"]:
            summary.write("No affected deployment targets.\n")
