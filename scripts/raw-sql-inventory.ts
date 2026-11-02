/**
 * Inventory of handwritten SQL statements in application code, to track the Prisma 8 query-builder adoption.
 *
 *   bun scripts/raw-sql-inventory.ts [directory] [--list | --json]
 *
 * Defaults to `backend/src`. Test files, `tests/` folders and generated code are skipped. Statements are found
 * from the TypeScript AST: any string or template literal that reads as a complete SQL statement counts, wherever
 * it is passed or held, so aliases such as `query(...)` inside `withRawTransaction` are included. Tagged templates
 * (`functions.raw` typed expressions) are counted separately and are not statements.
 *
 * Tiers describe what blocks a conversion to the typed builder, not whether a conversion is advisable:
 * - blocked: needs a construct `@prisma/orm-postgres` 8.0.0-rc.22 cannot express (verified against its typings:
 *   no ON CONFLICT clause, no insert-from-select or insert-time expressions, no recursive CTE, no advisory locks).
 * - review: may be expressible (row locks, joins in updates, array membership, windows); check each one.
 * - typed-raw: expressible with a narrow typed `functions.raw` expression (JSON operators, database functions,
 *   COLLATE, clock functions).
 * - candidate: no PostgreSQL-specific construct detected.
 *
 * It is a static scan, so counts are approximate: SQL assembled from several fragments is seen as separate pieces.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";

type Tier = "blocked" | "candidate" | "review" | "typed-raw";
interface Finding {
	file: string;
	flags: string[];
	kind: string;
	line: number;
	tier: Tier;
}

const skippedDirectories = new Set(["dist", "generated", "node_modules", "tests"]);
const flagPatterns: [string, RegExp][] = [
	["on-conflict", /\bon\s+conflict\b/i],
	["recursive", /\bwith\s+recursive\b/i],
	["advisory-lock", /pg_(try_)?advisory/i],
	["insert-select", /\binsert\s+into\b[\s\S]*\bselect\b/i],
	["collate", /\bcollate\b/i],
	["json-operator", /->>?|#>>?|@>|\bjsonb?_|\bto_jsonb?\b|::jsonb?\b/i],
	[
		"database-function",
		/\bpublic\.\w+\s*\(|\bzaimu_\w+|\bset_config\b|\bdate_trunc\b|\bto_char\b|\binterval\b|\bextract\s*\(|\bregexp_|\s~\*?\s|\bstrpos\b/i,
	],
	["clock", /\bnow\s*\(\)|\bclock_timestamp\b|\bcurrent_timestamp\b/i],
	["cte", /^with\s/i],
	["row-lock", /\bfor\s+(no\s+key\s+)?(update|share)\b/i],
	["table-function", /\bunnest\b|\bgenerate_series\b/i],
	["any-array", /=\s*any\s*\(/i],
	["distinct-on", /\bdistinct\s+on\b/i],
	["window", /\bover\s*\(/i],
	["lateral", /\blateral\b/i],
	["update-from", /^update\b[\s\S]*\bfrom\b/i],
];
const blocked = new Set(["on-conflict", "recursive", "advisory-lock", "insert-select"]);
const typedRaw = new Set(["collate", "json-operator", "database-function", "clock"]);

const statementStart = /^(select|insert\s+into|update|delete\s+from|with)\s/i;
const statementEvidence = /"|\$\d|\bfrom\b|\binto\b|\bset\b|\bvalues\b/i;

function sourceFiles(directory: string): string[] {
	return readdirSync(directory).flatMap(name => {
		const path = join(directory, name);
		if (statSync(path).isDirectory()) return skippedDirectories.has(name) ? [] : sourceFiles(path);
		const isSource = path.endsWith(".ts") && !path.endsWith(".test.ts") && !path.endsWith(".d.ts");
		return isSource ? [path] : [];
	});
}

function literalText(node: ts.Node): string | undefined {
	if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
	if (ts.isTemplateExpression(node))
		return node.head.text + node.templateSpans.map(span => `$${span.literal.text}`).join("");
	return undefined;
}

function normalize(text: string) {
	return text
		.replace(/\/\*[\s\S]*?\*\//g, " ")
		.replace(/--[^\n]*/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function kindOf(node: ts.Node) {
	const parent = node.parent;
	if (ts.isCallExpression(parent) && parent.arguments[0] === node) {
		const callee = parent.expression;
		if (ts.isIdentifier(callee)) return `call:${callee.text}`;
		if (ts.isPropertyAccessExpression(callee)) return `call:${callee.name.text}`;
		return "call";
	}
	if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return `held:${parent.name.text}`;
	return "held";
}

function tierOf(flags: string[]): Tier {
	if (flags.some(flag => blocked.has(flag))) return "blocked";
	if (flags.some(flag => !typedRaw.has(flag))) return "review";
	return flags.length ? "typed-raw" : "candidate";
}

function scan(root: string, file: string, typedRawExpressions: { count: number }) {
	const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
	const findings: Finding[] = [];
	const visit = (node: ts.Node) => {
		if (ts.isTaggedTemplateExpression(node)) {
			if (ts.isPropertyAccessExpression(node.tag) && node.tag.name.text === "raw")
				typedRawExpressions.count++;
			// The template is a typed expression, not a statement; still visit interpolated expressions.
			if (ts.isTemplateExpression(node.template))
				for (const span of node.template.templateSpans) visit(span.expression);
			return;
		}
		const text = literalText(node);
		if (text !== undefined) {
			const sql = normalize(text);
			if (sql.length > 15 && statementStart.test(sql) && statementEvidence.test(sql)) {
				const flags = flagPatterns.filter(([, pattern]) => pattern.test(sql)).map(([name]) => name);
				findings.push({
					file: relative(root, file),
					flags,
					kind: kindOf(node),
					line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
					tier: tierOf(flags),
				});
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	return findings;
}

const args = process.argv.slice(2);
const directory = resolve(args.find(arg => !arg.startsWith("--")) ?? "backend/src");
const typedRawExpressions = { count: 0 };
const findings = sourceFiles(directory)
	.flatMap(file => scan(directory, file, typedRawExpressions))
	.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

if (args.includes("--json")) {
	console.log(JSON.stringify({ findings, typedRawExpressions: typedRawExpressions.count }, null, 2));
} else if (args.includes("--list")) {
	for (const item of findings)
		console.log(`${item.file}:${item.line}\t${item.tier}\t${item.kind}\t${item.flags.join(",")}`);
} else {
	const tiers = ["candidate", "typed-raw", "review", "blocked"] as const;
	console.log(`Scanned ${relative(process.cwd(), directory) || "."}: ${findings.length} SQL statements`);
	for (const tier of tiers)
		console.log(`  ${tier.padEnd(10)} ${findings.filter(item => item.tier === tier).length}`);
	console.log(`  typed raw expressions already in use: ${typedRawExpressions.count}`);
	const byFile = new Map<string, number>();
	for (const item of findings)
		if (item.tier !== "blocked") byFile.set(item.file, (byFile.get(item.file) ?? 0) + 1);
	console.log("Files with the most convertible or reviewable statements:");
	for (const [file, count] of [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 20))
		console.log(`  ${String(count).padStart(3)} ${file}`);
}
