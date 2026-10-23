# Continuous delivery

`.github/workflows/cd.yml` publishes GHCR images on pushes to the deployment
branches. `.github/workflows/apps.yml` builds apps on version tags (`v1.2.3`)
or manual dispatch. Both use `.github/scripts/plan-cd.py` to emit explicit matrices.
Library packages never become container targets. No workflow deploys containers
to a server or runs database migrations.

## Images

Backend changes select API and worker; frontend changes select the web image.
Turbo detects transitive dependents. Manual dispatch selects `all`, `backend`,
`worker` or `frontend`. Builds run in parallel (maximum six), with separate layer
caches per service/variant. All images receive a full `sha-<commit>` tag;
only the repository default branch receives `latest`.

Workflow concurrency serializes publications per branch, without canceling a
partially published run. GitHub keeps at most one running and one pending run
per concurrency group; intermediate pending runs may be replaced. Do not rely on
this queue to publish every intermediate commit. Pin deployed images by digest
(printed in the job summary), not `latest`.

## App builds and releases

Set repository variables `VITE_API_URL` and `VITE_APP_URL` to HTTPS production
URLs. They reach both native/web builds and Turbo's frontend build cache key.
Set `DATABASE_URL` for the existing SQL/codegen build pipeline. Dependency install
uses the root `packageManager` Bun version and `--frozen-lockfile --ignore-scripts`;
the explicit build generates contracts. Docker stages use that same Bun version.
Rust compiler is pinned in `apps.yml`; update deliberately with Cargo.lock.
Third-party workflow actions are pinned to commit SHAs with version comments.

A push of `v<tauri version>` builds Windows, Linux, macOS, Android and iOS in
parallel (maximum five). Update the native Tauri version before creating the tag.
Manual dispatch can build only desktop, Android or iOS without publishing.
Publishing requires `platform=all`, `publish=true`, and selecting the matching
existing version tag as the workflow ref. Google Play promotion is a separate manual workflow.
A manual build on a branch only uploads Actions artifacts.

Each build uploads installers, metadata and optional store bundle to Actions
artifacts (14-day retention). One downstream job verifies every expected platform,
variant, version and source SHA, then uploads all public assets to a draft release
before publishing it. Assets include platform/variant prefixes, `builds.json` and
`SHA256SUMS`. AABs stay in Actions artifacts for the store job. Published versions
cannot be overwritten. A failed draft publication can be retried from the same
tag; builds that fail never publish a partial release.

Native desktop signing/notarization is not configured here. Windows/macOS
installers may prompt users because they are unsigned.

## Android signing and Play

Release builds require `ANDROID_KEYSTORE_BASE64` (base64 PKCS#12),
`ANDROID_KEYSTORE_PASSWORD` (store and key password), and `ANDROID_KEY_ALIAS`.
Without these, manual build-only runs create debug APKs; releases fail preflight.
Generated Android projects are initialized after applying branding. Signing files
are temporary and removed with an `always()` step.

The pipeline sets compile/target SDK from `ANDROID_TARGET_SDK` in `apps.yml`
(currently 36) in the runner-generated Gradle file, including older tracked projects.
Runner build also pins AGP 8.9.1 with Gradle 8.11.1, compatible with API 36.
Update these together as Google Play target policy evolves.

`versionCode` is `100000000 + GITHUB_RUN_NUMBER * 100 + GITHUB_RUN_ATTEMPT`,
supplied through a Tauri config overlay. The offset exceeds the old epoch-minute
scheme. Attempts 1-99 are supported. Preserve the workflow identity/run counter;
if migrating from another numbering scheme, verify the next number exceeds Play's
last uploaded version. Codes do not depend on Git commit timestamps.

To upload, run **CD - Google Play promotion** (`play.yml`), providing the published
release tag, its successful **CD - apps** run ID and an explicit track (`internal`,
`alpha`, `beta` or `production`). Configure `PLAY_SERVICE_ACCOUNT_JSON` in GitHub
environment `google-play-<track>` and add required reviewers for production.
The job downloads the original AAB, verifies its bytes against `builds.json` from
the public release and uses the built package identifier. No rebuild occurs.
Uploads serialize across version tags, while variant uploads run in parallel.
Artifacts expire after 14 days; promote before expiry. Retry failed promotion jobs
with the same source run; do not rebuild an already published app version.

## iOS

Default iOS build runs on macOS with Xcode, initializes `gen/apple` if missing,
and builds an unsigned ARM64 simulator `.app`, distributed as
`ios-<variant>-simulator.tar.gz`. This is a real iOS compile, not a device IPA;
use an Apple Silicon simulator to run it. It needs no Apple Developer credentials.

For a device IPA set repository variable `IOS_SIGNING_ENABLED=true` and
`APPLE_DEVELOPMENT_TEAM`, then provide secrets `IOS_CERTIFICATE` (base64 `.p12`),
`IOS_CERTIFICATE_PASSWORD` and `IOS_MOBILE_PROVISION` (base64 App Store provisioning
profile). The profile must match the app identifier and signing team. Tauri imports
temporary signing material and exports with `app-store-connect`. The build number
uses the same monotonic scheme as Android. IPA is attached to the GitHub release;
App Store Connect upload is not configured.

## Local verification

Validate workflows with `actionlint .github/workflows/cd.yml .github/workflows/apps.yml .github/workflows/play.yml`.
Planner and artifact assembly use Python's standard library and can be exercised
locally with temporary output/summary files and synthetic artifacts, without building
or publishing. Cross-platform signing, Xcode, Android SDK and real registry/store
uploads require their respective runners and configured credentials.
