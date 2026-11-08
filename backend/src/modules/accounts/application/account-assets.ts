import { cryptoAssets } from "@zaimu/finance/crypto-assets";
import { currencyDigits, registerAssetDecimals } from "@zaimu/finance/money";
import { supportedCurrencies } from "~/modules/currencies/application/currency-catalog";
import { HttpException } from "~/shared/errors";
import { queryRawDecimal } from "~/shared/infra/sql";

export interface AccountAsset extends Record<string, unknown> {
	assetCode: string;
	kind: "FIAT" | "CRYPTO";
	decimals: number;
}

/** Register only catalog-backed denominations; never invent an asset or overwrite provider identity. */
export async function ensureAccountAssetCatalog(assetCode: string) {
	const [existing] = await queryRawDecimal(`SELECT "code" FROM "Asset" WHERE "code"=$1`, [assetCode]);
	if (existing) return;
	const known = cryptoAssets.find(asset => asset.code === assetCode);
	if (known) {
		await queryRawDecimal(
			`INSERT INTO "Asset" ("code","kind","name","decimals","quoteProvider") VALUES ($1,'CRYPTO',$2,$3,$4) ON CONFLICT ("code") DO NOTHING`,
			[known.code, known.name, known.digits, `coinbase:${known.providerId}`],
		);
		return;
	}
	if (!(await supportedCurrencies()).includes(assetCode)) throw new HttpException("Ativo inválido", 400);
	await queryRawDecimal(
		`INSERT INTO "Asset" ("code","kind","name","decimals") VALUES ($1,'FIAT',$1,$2) ON CONFLICT ("code") DO NOTHING`,
		[assetCode, currencyDigits(assetCode)],
	);
}

/** Ambiguous containers require an explicit selection; no account-wide currency fallback. */
export async function resolveAccountAsset(
	accountId: string,
	requestedCode?: string | null,
	options: { userId?: string; fiatOnly?: boolean; create?: boolean } = {},
) {
	const requested = requestedCode?.trim().toUpperCase();
	if (requested && !/^[A-Z0-9]{2,12}$/.test(requested))
		throw new HttpException("Selecione um ativo válido", 400);
	if (options.create && requested) await attachAccountAsset(accountId, requested, options);
	const rows = await queryRawDecimal<AccountAsset>(
		`
 SELECT holding."assetCode",asset."kind",asset."decimals" FROM "FinancialAccountAsset" holding
 JOIN "Asset" asset ON asset."code"=holding."assetCode"
 JOIN "FinancialAccount" account ON account."id"=holding."financialAccountId"
 WHERE holding."financialAccountId"=$1 AND ($2::text IS NULL OR holding."assetCode"=$2)
 AND ($3::text IS NULL OR account."userId"=$3) AND (NOT $4::boolean OR asset."kind"='FIAT')
 ORDER BY holding."assetCode"`,
		[accountId, requested ?? null, options.userId ?? null, options.fiatOnly ?? false],
	);
	if (rows.length !== 1)
		throw new HttpException(
			rows.length ? "Selecione o ativo da conta" : "A conta não possui o ativo selecionado",
			400,
		);
	const asset = rows[0];
	if (asset.kind === "CRYPTO") registerAssetDecimals(asset.assetCode, asset.decimals);
	return asset;
}

/** Assets are declared lazily: the first movement in a denomination adds it to the account. */
async function attachAccountAsset(
	accountId: string,
	assetCode: string,
	options: { userId?: string; fiatOnly?: boolean },
) {
	const [account] = await queryRawDecimal(
		`SELECT 1 FROM "FinancialAccount" WHERE "id"=$1 AND ($2::text IS NULL OR "userId"=$2)`,
		[accountId, options.userId ?? null],
	);
	if (!account) return;
	await ensureAccountAssetCatalog(assetCode);
	const [asset] = await queryRawDecimal<{ kind: string }>(`SELECT "kind" FROM "Asset" WHERE "code"=$1`, [
		assetCode,
	]);
	if (!asset || (options.fiatOnly && asset.kind !== "FIAT")) return;
	await queryRawDecimal(
		`INSERT INTO "FinancialAccountAsset" ("financialAccountId","assetCode","balance") VALUES ($1,$2,0) ON CONFLICT ("financialAccountId","assetCode") DO NOTHING`,
		[accountId, assetCode],
	);
}

export async function assertFiatHolding(accountId: string, assetCode: string, userId?: string) {
	return resolveAccountAsset(accountId, assetCode, { fiatOnly: true, userId });
}
