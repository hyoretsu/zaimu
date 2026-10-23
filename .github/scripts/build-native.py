"""Build one native target and collect only distributable artifacts."""
import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import tarfile
from pathlib import Path

root = Path.cwd()
frontend = root / "frontend"
native = frontend / "src-tauri"
platform = os.environ["PLATFORM"]
variant = os.environ.get("VARIANT", "")
output = root / "native-artifacts"
output.mkdir()
public = output / "release"
public.mkdir()
bun = shutil.which("bun")

def run(*args, cwd=frontend):
    subprocess.run(args, cwd=cwd, check=True)

def tauri(*args):
    run(bun, "run", "tauri", *args)

config = json.loads((native / "tauri.conf.json").read_text(encoding="utf-8"))
if config["version"] != os.environ["EXPECTED_VERSION"]:
    raise ValueError("Prepared variant version differs from release version")
# Source commit time is NOT unique or monotonic. A rerun also needs a new store code.
attempt = int(os.environ["GITHUB_RUN_ATTEMPT"])
if not 1 <= attempt <= 99:
    raise ValueError("At most 99 attempts per run; start a new workflow dispatch")
# Offset keeps codes above the old commit-timestamp/minute scheme.
build_number = 100_000_000 + int(os.environ["GITHUB_RUN_NUMBER"]) * 100 + attempt
if build_number > 2_100_000_000:
    raise ValueError("Android versionCode exceeds Google Play limit")
override = {"build": {"beforeBuildCommand": ""}, "bundle": {
    "android": {"versionCode": build_number},
    "iOS": {"bundleVersion": str(build_number)}}}
ci_config = Path(os.environ["RUNNER_TEMP"]) / "tauri-ci.json"
ci_config.write_text(json.dumps(override), encoding="utf-8")
signed = False

def collect(pattern, destination=public):
    files = [p for p in native.glob(pattern) if p.is_file()]
    if not files:
        raise ValueError(f"No artifacts matched {pattern}")
    for file in files:
        # Prevent cross-platform or cross-variant name collisions in the release.
        name = f"{platform}-{variant or 'default'}-{file.name}"
        dest = destination / name
        if dest.exists():
            raise ValueError(f"Duplicate artifact: {name}")
        shutil.copy2(file, dest)

if platform == "android":
    os.environ["NDK_HOME"] = os.environ["ANDROID_NDK_LATEST_HOME"]
    run("rustup", "target", "add", "aarch64-linux-android", "armv7-linux-androideabi",
        "i686-linux-android", "x86_64-linux-android")
    # Initialize after branding; generated package paths must use the actual identifier.
    if not (native / "gen/android/app/build.gradle.kts").exists():
        tauri("android", "init", "--ci")
    gradle = native / "gen/android/app/build.gradle.kts"
    text = gradle.read_text(encoding="utf-8")
    # Existing generated projects may carry an obsolete Play target SDK.
    # Keep changes ephemeral; release build configuration belongs to this pipeline.
    sdk = int(os.environ.get("ANDROID_TARGET_SDK", "36"))
    if sdk < 35:
        raise ValueError("Android release target SDK must be at least 35")
    text = re.sub(r"compileSdk\s*=\s*\d+", f"compileSdk = {sdk}", text)
    text = re.sub(r"targetSdk\s*=\s*\d+", f"targetSdk = {sdk}", text)
    gradle.write_text(text, encoding="utf-8")
    # API 36 requires AGP >= 8.9.1; old checked-in projects use AGP 8.5.1.
    # Pin a compatible wrapper together, rather than upgrading only targetSdk.
    project_gradle = native / "gen/android/build.gradle.kts"
    if project_gradle.exists():
        project_text = project_gradle.read_text(encoding="utf-8")
        project_text = re.sub(r"com\.android\.tools\.build:gradle:[0-9.]+",
                              "com.android.tools.build:gradle:8.9.1", project_text)
        project_gradle.write_text(project_text, encoding="utf-8")
    wrapper = native / "gen/android/gradle/wrapper/gradle-wrapper.properties"
    if wrapper.exists():
        wrapper_text = re.sub(r"gradle-[0-9.]+-(bin|all)\.zip", "gradle-8.11.1-bin.zip",
                              wrapper.read_text(encoding="utf-8"))
        wrapper.write_text(wrapper_text, encoding="utf-8")
    keystore = os.environ.get("ANDROID_KEYSTORE_BASE64", "")
    signed = bool(keystore)
    if signed:
        password = os.environ["ANDROID_KEYSTORE_PASSWORD"]
        alias = os.environ["ANDROID_KEY_ALIAS"]
        if not password or not alias:
            raise ValueError("Missing Android signing password or alias")
        key_path = Path(os.environ["RUNNER_TEMP"]) / "release.p12"
        key_path.write_bytes(base64.b64decode(keystore, validate=True))
        key_path.chmod(0o600)
        # A generated template project needs the signing block; Zaimu already has it.
        if 'rootProject.file("keystore.properties")' not in text:
            marker = "android {"
            signing = """
val releaseKeystore = java.util.Properties().apply {
    rootProject.file("keystore.properties").inputStream().use { load(it) }
}
android {
    signingConfigs {
        create("release") {
            storeFile = file(releaseKeystore.getProperty("storeFile"))
            storePassword = releaseKeystore.getProperty("password")
            keyAlias = releaseKeystore.getProperty("keyAlias")
            keyPassword = releaseKeystore.getProperty("password")
            storeType = "PKCS12"
        }
    }
"""
            if marker not in text:
                raise ValueError("Unknown generated Android Gradle layout")
            text = text.replace(marker, signing, 1)
            # Separate DSL block avoids relying on the generated release block layout.
            text += '\nandroid.buildTypes.getByName("release").signingConfig = android.signingConfigs.getByName("release")\n'
            gradle.write_text(text, encoding="utf-8")
        def property_value(value):
            return value.replace("\\", "\\\\").replace("\r", "\\r").replace("\n", "\\n").replace(" ", "\\ ")
        props = native / "gen/android/keystore.properties"
        props.write_text("\n".join(f"{k}={property_value(v)}" for k, v in {
            "storeFile": str(key_path), "password": password,
            "keyAlias": alias, "storeType": "PKCS12"}.items()) + "\n", encoding="utf-8")
        props.chmod(0o600)
        tauri("android", "build", "--apk", "--aab", "--ci", "--config", str(ci_config))
        collect("gen/android/app/build/outputs/apk/**/*-release.apk")
        store = output / "store"
        store.mkdir()
        collect("gen/android/app/build/outputs/bundle/**/*.aab", store)
    else:
        tauri("android", "build", "--debug", "--apk", "--ci", "--config", str(ci_config))
        collect("gen/android/app/build/outputs/apk/**/*-debug.apk")
elif platform == "ios":
    signed = os.environ.get("IOS_SIGNING_ENABLED") == "true"
    if signed:
        for key in ("APPLE_DEVELOPMENT_TEAM", "IOS_CERTIFICATE", "IOS_CERTIFICATE_PASSWORD", "IOS_MOBILE_PROVISION"):
            if not os.environ.get(key):
                raise ValueError(f"{key} required for a signed IPA")
    else:
        # Never pass partially configured signing material to an unsigned build.
        for key in ("IOS_CERTIFICATE", "IOS_CERTIFICATE_PASSWORD", "IOS_MOBILE_PROVISION", "APPLE_DEVELOPMENT_TEAM"):
            os.environ.pop(key, None)
    run("rustup", "target", "add", "aarch64-apple-ios", "aarch64-apple-ios-sim")
    if not (native / "gen/apple").exists():
        tauri("ios", "init", "--ci")
    if signed:
        tauri("ios", "build", "--ci", "--target", "aarch64", "--export-method", "app-store-connect", "--config", str(ci_config))
        collect("gen/apple/build/**/*.ipa")
    else:
        tauri("ios", "build", "--ci", "--target", "aarch64-sim", "--no-sign", "--config", str(ci_config))
        apps = [p for p in native.glob("gen/apple/build/**/*.app") if p.is_dir()]
        if not apps:
            raise ValueError("iOS simulator build produced no .app bundle")
        archive = public / f"ios-{variant or 'default'}-simulator.tar.gz"
        with tarfile.open(archive, "w:gz") as tar:
            for app in apps:
                tar.add(app, arcname=app.name)
else:
    tauri("build", "--ci", "--config", str(ci_config))
    patterns = {
        "windows": ["target/release/bundle/nsis/*.exe", "target/release/bundle/msi/*.msi"],
        "linux": ["target/release/bundle/deb/*.deb", "target/release/bundle/rpm/*.rpm", "target/release/bundle/appimage/*.AppImage"],
        "macos": ["target/release/bundle/dmg/*.dmg"],
    }
    for pattern in patterns[platform]:
        collect(pattern)

metadata = {"platform": platform, "variant": variant, "version": config["version"],
            "identifier": config["identifier"], "commit": os.environ["GITHUB_SHA"],
            "signed": signed, "buildNumber": build_number}
metadata["storeSHA256"] = {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                           for p in (output / "store").glob("*.aab")}
(output / "metadata.json").write_text(json.dumps(metadata), encoding="utf-8")
with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as summary:
    summary.write(f"Built {platform}/{variant or 'default'} `{config['version']}` from `{metadata['commit']}`.\n\n")
    if platform == "ios":
        summary.write("Signed IPA.\n" if signed else "Unsigned ARM64 iOS Simulator bundle (not installable on devices).\n")
