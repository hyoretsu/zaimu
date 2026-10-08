#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";

interface PackageJson {
	name: string;
	workspaces?: string[];
	scripts?: Record<string, string>;
}

const [baseRef, ...tasks] = process.argv.slice(2);
if (tasks.length === 0) {
	console.error("usage: affected-packages.ts <baseRef> <task...>");
	process.exit(1);
}

const planAll = !baseRef || /^0+$/.test(baseRef);
const root: PackageJson = JSON.parse(readFileSync("package.json", "utf8"));

const workspaceDirs = () => {
	const dirs = new Set<string>();
	for (const pattern of root.workspaces ?? []) {
		if (pattern.endsWith("/*")) {
			const base = pattern.slice(0, -2);
			for (const entry of readdirSync(base, { withFileTypes: true })) {
				if (entry.isDirectory() && existsSync(`${base}/${entry.name}/package.json`)) {
					dirs.add(`${base}/${entry.name}`);
				}
			}
		} else if (existsSync(`${pattern}/package.json`)) {
			dirs.add(pattern);
		}
	}
	return [...dirs];
};

const packages = workspaceDirs().map(dir => {
	const pkg: PackageJson = JSON.parse(readFileSync(`${dir}/package.json`, "utf8"));
	return { name: pkg.name, scripts: pkg.scripts ?? {} };
});

interface DryRun {
	tasks: { package: string; task: string }[];
}

const stdout = execFileSync(
	"bun",
	planAll
		? ["turbo", "run", ...tasks, "--dry-run=json"]
		: ["turbo", "run", ...tasks, "--affected", "--dry-run=json"],
	{
		encoding: "utf8",
		env: (planAll
			? process.env
			: { ...process.env, TURBO_SCM_BASE: baseRef }) as unknown as NodeJS.ProcessEnv,
	},
);

const affected: DryRun = JSON.parse(stdout);
const byTask = Object.fromEntries(
	tasks.map(task => [
		task,
		packages
			.filter(
				pkg =>
					affected.tasks.some(entry => entry.package === pkg.name && entry.task === task) &&
					pkg.scripts[task],
			)
			.map(pkg => pkg.name),
	]),
);

console.log(JSON.stringify(byTask));
