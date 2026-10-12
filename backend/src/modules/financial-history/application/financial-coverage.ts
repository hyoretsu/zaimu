import { HttpException } from "~/shared/errors";
import { queryRaw } from "~/shared/infra/sql";
import type { FinancialCoverageReturn } from "../infra/financial-coverage.dto";

type Account = FinancialCoverageReturn["accounts"][number];
type Item = FinancialCoverageReturn["items"][number];
type Metadata = Partial<
	Pick<Item, "countryCode" | "currency" | "institutionId" | "profileId" | "version" | "startDate" | "endDate">
>;
const day = (date: Date) => date.toISOString().slice(0, 10);
export function financialCoverageWindow(start?: string, end?: string) {
	const today = new Date();
	const startDate = start ?? `${today.getUTCFullYear()}-01-01`;
	const endDate = end ?? `${today.getUTCFullYear()}-12-31`;
	const from = new Date(`${startDate}T00:00:00Z`);
	const to = new Date(`${endDate}T00:00:00Z`);
	if (
		!Number.isFinite(from.getTime()) ||
		!Number.isFinite(to.getTime()) ||
		day(from) !== startDate ||
		day(to) !== endDate ||
		to < from ||
		to.getTime() - from.getTime() > 3660 * 86400000
	)
		throw new HttpException("Intervalo de cobertura inválido", 400);
	return { endDate, startDate };
}
export function coverageGaps(start: string, end: string, from: string | null, to: string | null) {
	const gaps: Item["gaps"] = [];
	if ((from && from > end) || (to && to < start)) return [{ endDate: end, startDate: start }];
	if (from && from > start)
		gaps.push({
			endDate: day(new Date(new Date(`${from}T00:00:00Z`).getTime() - 86400000)),
			startDate: start,
		});
	if (to && to < end)
		gaps.push({ endDate: end, startDate: day(new Date(new Date(`${to}T00:00:00Z`).getTime() + 86400000)) });
	return gaps;
}
export function uncoveredRanges(
	start: string,
	end: string,
	intervals: { startDate: string | null; endDate: string | null }[],
) {
	let cursor = start;
	const gaps: Item["gaps"] = [];
	for (const range of [...intervals].sort((a, b) =>
		(a.startDate ?? "0001-01-01").localeCompare(b.startDate ?? "0001-01-01"),
	)) {
		const from = range.startDate ?? start;
		const to = range.endDate ?? end;
		if (to < cursor || from > end) continue;
		if (from > cursor)
			gaps.push({
				endDate: day(new Date(new Date(`${from}T00:00:00Z`).getTime() - 86400000)),
				startDate: cursor,
			});
		if (to >= end) return gaps;
		cursor = day(new Date(new Date(`${to}T00:00:00Z`).getTime() + 86400000));
	}
	if (cursor <= end) gaps.push({ endDate: end, startDate: cursor });
	return gaps;
}
/** Read-only inventory. Scope personal identifiers before any aggregation. Never generates coverage. */
export async function getFinancialCoverage(
	userId: string,
	admin: boolean,
	start?: string,
	end?: string,
): Promise<FinancialCoverageReturn> {
	const window = financialCoverageWindow(start, end);
	const accounts = await queryRaw<Account & { userId: string }>(
		`SELECT "id","userId","name","countryCode","currency","institutionId" FROM "FinancialAccount" WHERE ($1::boolean OR "userId"=$2) ORDER BY "createdAt","id"`,
		[admin, userId],
	);
	const countries = [
		...new Set(accounts.flatMap(account => (account.countryCode ? [account.countryCode] : []))),
	];
	const currencies = [...new Set(accounts.map(account => account.currency))];
	const links = await queryRaw<{ institutionId: string }>(
		`SELECT "institutionId" FROM "UserFinancialInstitution" WHERE ($1::boolean OR "userId"=$2)`,
		[admin, userId],
	);
	const institutions = [
		...new Set([
			...links.map(link => link.institutionId),
			...accounts.flatMap(account => (account.institutionId ? [account.institutionId] : [])),
		]),
	];
	const [associations, calendars, taxes, policies, histories] = await Promise.all([
		queryRaw<{
			id: string;
			countryCode: string;
			currency: string;
			startDate: string | null;
			endDate: string | null;
			source: string;
			version: string;
		}>(
			`SELECT "id","countryCode","currency",to_char("effectiveFrom",'YYYY-MM-DD') AS "startDate",to_char("effectiveUntil",'YYYY-MM-DD') AS "endDate","source","sourceVersion" AS "version" FROM "CurrencyCountryAssociation" WHERE ($1::boolean OR ("currency"=ANY($2::text[]) AND "countryCode"=ANY($3::text[]))) ORDER BY "countryCode","currency","effectiveFrom"`,
			[admin, currencies, countries],
		),
		queryRaw<{ countryCode: string; year: number; status: string; source: string; version: string }>(
			`SELECT "countryCode","year","status","source","sourceVersion" AS "version" FROM "YieldCalendarCoverage" WHERE ($1::boolean OR "countryCode"=ANY($2::text[])) AND "year" BETWEEN $3 AND $4 ORDER BY "countryCode","year"`,
			[admin, countries, Number(window.startDate.slice(0, 4)), Number(window.endDate.slice(0, 4))],
		),
		queryRaw<{ id: string; name: string; startDate: string; endDate: string | null }>(
			`SELECT v."id",d."name",to_char(v."effectiveDate",'YYYY-MM-DD') AS "startDate",to_char(lead(v."effectiveDate") OVER (PARTITION BY v."taxDefinitionId" ORDER BY v."effectiveDate")-1,'YYYY-MM-DD') AS "endDate" FROM "taxDefinitionVersion" v JOIN "taxDefinition" d ON d."id"=v."taxDefinitionId" WHERE d."isActive" ORDER BY d."name",v."effectiveDate"`,
		),
		queryRaw<{
			id: string;
			institutionId: string;
			name: string;
			profileId: string | null;
			countryCode: string | null;
			currency: string;
			startDate: string;
			endDate: string | null;
			status: string;
			version: string;
		}>(
			`SELECT p."id",p."financialInstitutionId" AS "institutionId",i."name",p."profileId",p."countryCode",p."currency",to_char(p."effectiveDate",'YYYY-MM-DD') AS "startDate",to_char(LEAST(p."effectiveUntil",lead(p."effectiveDate") OVER (PARTITION BY p."financialInstitutionId",p."profileId",p."countryCode",p."currency" ORDER BY p."effectiveDate")-1),'YYYY-MM-DD') AS "endDate",p."status",i."version"::text AS "version" FROM "FinancialInstitutionYieldPolicy" p JOIN "FinancialInstitution" i ON i."id"=p."financialInstitutionId" WHERE ($1::boolean OR p."financialInstitutionId"=ANY($2::text[])) ORDER BY i."name",p."effectiveDate"`,
			[admin, institutions],
		),
		queryRaw<{
			id: string;
			institutionId: string;
			profileId: string;
			name: string;
			startDate: string;
			endDate: string | null;
			userId: string;
		}>(
			`WITH history AS (
SELECT c."id",l."institutionId",c."profileId",p."name",l."userId",c."effectiveDate" AS "fromDate",lead(c."effectiveDate") OVER (PARTITION BY c."linkId" ORDER BY c."effectiveDate")-1 AS "toDate" FROM "UserInstitutionProfileChange" c JOIN "UserFinancialInstitution" l ON l."id"=c."linkId" JOIN "FinancialInstitutionProfile" p ON p."id"=c."profileId" WHERE ($1::boolean OR l."userId"=$2)
UNION ALL SELECT l."id" || ':default',l."institutionId",p."id",p."name",l."userId",DATE '0001-01-01',(SELECT min(c."effectiveDate")-1 FROM "UserInstitutionProfileChange" c WHERE c."linkId"=l."id") FROM "UserFinancialInstitution" l JOIN "FinancialInstitutionProfile" p ON p."institutionId"=l."institutionId" AND p."isDefault" WHERE ($1::boolean OR l."userId"=$2)
) SELECT "id","institutionId","profileId","name","userId",to_char("fromDate",'YYYY-MM-DD') AS "startDate",to_char("toDate",'YYYY-MM-DD') AS "endDate" FROM history ORDER BY "institutionId","fromDate"`,
			[admin, userId],
		),
	]);
	const items: Item[] = [];
	function add(
		id: string,
		kind: Item["kind"],
		name: string,
		source: string,
		status: string,
		metadata: Metadata,
		affected: Account[],
		missing = false,
	) {
		const item: Item = {
			affectedAccountIds: affected.map(account => account.id),
			countryCode: metadata.countryCode ?? null,
			currency: metadata.currency ?? null,
			endDate: metadata.endDate ?? null,
			gaps: [],
			id,
			institutionId: metadata.institutionId ?? null,
			kind,
			name,
			profileId: metadata.profileId ?? null,
			source,
			startDate: metadata.startDate ?? null,
			status,
			version: metadata.version ?? null,
		};
		item.gaps = missing
			? [{ ...window }]
			: coverageGaps(window.startDate, window.endDate, item.startDate, item.endDate);
		items.push(item);
	}
	for (const row of associations) {
		add(
			row.id,
			"ASSOCIATION",
			`${row.countryCode} - ${row.currency}`,
			row.source,
			"COMPLETE",
			row,
			accounts.filter(
				account => account.countryCode === row.countryCode && account.currency === row.currency,
			),
		);
		items[items.length - 1].gaps = uncoveredRanges(
			window.startDate,
			window.endDate,
			associations.filter(other => other.countryCode === row.countryCode && other.currency === row.currency),
		);
	}
	const allCountries = admin
		? [
				...new Set([
					...countries,
					...calendars.map(row => row.countryCode),
					...associations.map(row => row.countryCode),
				]),
			]
		: countries;
	for (const countryCode of allCountries)
		for (
			let year = Number(window.startDate.slice(0, 4));
			year <= Number(window.endDate.slice(0, 4));
			year++
		) {
			const row = calendars.find(row => row.countryCode === countryCode && row.year === year);
			add(
				`${countryCode}:${year}`,
				"CALENDAR",
				`${countryCode} - ${year}`,
				row?.source ?? "date-holidays",
				row?.status ?? "MISSING",
				{ countryCode, endDate: `${year}-12-31`, startDate: `${year}-01-01`, version: row?.version ?? null },
				accounts.filter(account => account.countryCode === countryCode),
				row?.status !== "COMPLETE",
			);
			const item = items[items.length - 1];
			item.gaps =
				row?.status === "COMPLETE"
					? []
					: [
							{
								endDate: window.endDate < `${year}-12-31` ? window.endDate : `${year}-12-31`,
								startDate: window.startDate > `${year}-01-01` ? window.startDate : `${year}-01-01`,
							},
						];
		}
	for (const row of taxes) {
		add(row.id, "TAX", row.name, "ADMIN", "COMPLETE", row, accounts);
		items[items.length - 1].gaps = uncoveredRanges(
			window.startDate,
			window.endDate,
			taxes.filter(other => other.name === row.name),
		);
	}
	for (const row of policies) {
		add(
			row.id,
			"POLICY",
			row.name,
			"INSTITUTION",
			row.status,
			row,
			accounts.filter(
				account =>
					account.institutionId === row.institutionId &&
					account.currency === row.currency &&
					(!row.countryCode || account.countryCode === row.countryCode),
			),
			row.status !== "APPROVED",
		);
		items[items.length - 1].gaps = uncoveredRanges(
			window.startDate,
			window.endDate,
			policies.filter(
				other =>
					other.status === "APPROVED" &&
					other.institutionId === row.institutionId &&
					other.profileId === row.profileId &&
					other.countryCode === row.countryCode &&
					other.currency === row.currency,
			),
		);
	}
	for (const row of histories) {
		add(
			row.id,
			"PROFILE_HISTORY",
			row.name,
			"USER",
			"COMPLETE",
			row,
			accounts.filter(
				account => account.institutionId === row.institutionId && account.userId === row.userId,
			),
		);
		items[items.length - 1].gaps = uncoveredRanges(
			window.startDate,
			window.endDate,
			histories.filter(other => other.institutionId === row.institutionId && other.userId === row.userId),
		);
	}
	for (const account of accounts) {
		if (!account.countryCode)
			add(
				`country:${account.id}`,
				"ACCOUNT_COUNTRY",
				account.name ?? account.id,
				"USER",
				"PENDING_CONFIRMATION",
				{},
				[account],
				true,
			);
		else if (
			!associations.some(row => row.countryCode === account.countryCode && row.currency === account.currency)
		)
			add(
				`association:${account.id}`,
				"ASSOCIATION",
				`${account.countryCode} - ${account.currency}`,
				"CLDR",
				"MISSING",
				{ countryCode: account.countryCode, currency: account.currency },
				[account],
				true,
			);
		if (
			account.institutionId &&
			!policies.some(
				row =>
					row.institutionId === account.institutionId &&
					row.currency === account.currency &&
					(!row.countryCode || row.countryCode === account.countryCode),
			)
		)
			add(
				`policy:${account.id}`,
				"POLICY",
				account.name ?? account.id,
				"INSTITUTION",
				"MISSING",
				{
					countryCode: account.countryCode,
					currency: account.currency,
					institutionId: account.institutionId,
				},
				[account],
				true,
			);
	}
	return { ...window, accounts: accounts.map(({ userId: _userId, ...account }) => account), items };
}
