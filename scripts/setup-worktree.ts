import {
	cpSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	rmdirSync,
	statSync,
	symlinkSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

/**
 * Prepares a git worktree so it is usable in seconds instead of running a full install in each one:
 * 1. installs with `bun install --frozen-lockfile`, which hardlinks from the Bun cache (cheap on btrfs metadata,
 *    unlike reflink-cloning `node_modules`), serialized through a few `flock` slots so several worktrees
 *    created at once do not fight over disk and CPU (`WORKTREE_INSTALL_SLOTS`, default 2);
 * 2. shares the main checkout's Turbo cache so builds and type-checks are not repeated per worktree.
 *
 * Usage: `bun scripts/setup-worktree.ts [worktree-dir]` (defaults to the current directory). Idempotent.
 */

const git = (cwd: string, ...args: string[]) => {
	const result = Bun.spawnSync(["git", ...args], { cwd, stderr: "pipe", stdout: "pipe" });
	if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr.toString().trim()}`);
	return result.stdout.toString();
};

const target = resolve(process.argv[2] ?? process.cwd());
const top = git(target, "rev-parse", "--show-toplevel").trim();
const main = git(top, "worktree", "list", "--porcelain")
	.split("\n")[0]
	?.replace(/^worktree /, "");
if (!main) throw new Error("Could not find the main worktree.");
const isMain = resolve(main) === resolve(top);
const startedAt = performance.now();

const warnIfCacheCrossesFilesystems = () => {
	const cache =
		process.env.BUN_INSTALL_CACHE_DIR ??
		join(process.env.BUN_INSTALL ?? join(homedir(), ".bun"), "install", "cache");
	if (existsSync(cache) && statSync(cache).dev !== statSync(top).dev) {
		console.warn(
			`Bun cache (${cache}) is on another filesystem than the worktree: Bun copies instead of hardlinking. ` +
				"Point BUN_INSTALL_CACHE_DIR to the worktrees' disk.",
		);
	}
};

const install = async () => {
	const command = ["bun", "install", "--frozen-lockfile"];
	const slots = Math.max(1, Number(process.env.WORKTREE_INSTALL_SLOTS) || 2);
	if (!Bun.which("flock")) {
		console.warn("`flock` not found: installing without a concurrency limit.");
		return Bun.spawn(command, { cwd: top, stderr: "inherit", stdout: "inherit" }).exited;
	}
	const lockDir = join(process.env.XDG_RUNTIME_DIR ?? tmpdir(), "worktree-install-locks");
	mkdirSync(lockDir, { recursive: true });
	const busy = 99;
	for (;;) {
		for (let slot = 0; slot < slots; slot++) {
			const lock = join(lockDir, `slot-${slot}.lock`);
			const code = await Bun.spawn(["flock", "-n", "-E", String(busy), lock, ...command], {
				cwd: top,
				stderr: "inherit",
				stdout: "inherit",
			}).exited;
			if (code !== busy) return code;
		}
		await Bun.sleep(1000);
	}
};

const shareTurboCache = () => {
	const shared = join(main, ".turbo", "cache");
	const local = join(top, ".turbo", "cache");
	mkdirSync(shared, { recursive: true });
	mkdirSync(dirname(local), { recursive: true });
	const current = lstatSync(local, { throwIfNoEntry: false });
	if (current?.isSymbolicLink()) return;
	if (current?.isDirectory()) {
		if (readdirSync(local).length) return;
		rmdirSync(local);
	}
	symlinkSync(shared, local, "dir");
	console.log("Linked the Turbo cache to the main checkout.");
};

if (!isMain) {
	const hooks = ".githooks";
	if (existsSync(join(main, hooks)) && !existsSync(join(top, hooks))) {
		cpSync(join(main, hooks), join(top, hooks), { recursive: true });
	}
	shareTurboCache();
}

warnIfCacheCrossesFilesystems();
const code = await install();
console.log(`Worktree ready in ${((performance.now() - startedAt) / 1000).toFixed(1)}s.`);
process.exit(code);
