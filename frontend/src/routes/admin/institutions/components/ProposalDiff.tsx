import { Badge } from "@/components/ui/Badge";
import { countryName } from "@/lib/countries";

const FIELD_LABELS: Record<string, string> = {
	aliases: "Outros nomes",
	creditStatementClosingInclusive: "Fechamento da fatura",
	name: "Nome",
	operatingCountryCodes: "Países de operação",
};

const closing = (value: unknown) => (value ? "Inclusivo" : "Exclusivo");

function CountryDiff({ current, proposed }: { current: string[]; proposed: string[] }) {
	const added = proposed.filter(code => !current.includes(code));
	const removed = current.filter(code => !proposed.includes(code));
	return (
		<div className="flex flex-wrap gap-1">
			{added.map(code => (
				<Badge key={`+${code}`} variant="secondary">
					+ {countryName(code)}
				</Badge>
			))}
			{removed.map(code => (
				<Badge key={`-${code}`} variant="destructive">
					- {countryName(code)}
				</Badge>
			))}
			{!added.length && !removed.length && <span className="text-muted-foreground">Sem mudança</span>}
		</div>
	);
}

function ValueDiff({ current, proposed }: { current: string; proposed: string }) {
	return (
		<p className="break-words">
			<span className="text-muted-foreground line-through">{current || "Sem valor"}</span>{" "}
			<span className="font-medium">{proposed || "Sem valor"}</span>
		</p>
	);
}

/** Readable before/after for the fields an institution edit suggestion changes. */
export function InstitutionUpdateDiff({
	current,
	payload,
}: {
	current?: Record<string, unknown>;
	payload: Record<string, unknown>;
}) {
	const fields = Object.keys(FIELD_LABELS).filter(key => payload[key] !== undefined);
	return (
		<dl className="grid min-w-0 gap-3 text-sm">
			{fields.map(key => (
				<div className="grid min-w-0 gap-1" key={key}>
					<dt className="font-medium">{FIELD_LABELS[key]}</dt>
					<dd>
						{key === "operatingCountryCodes" ? (
							<CountryDiff
								current={(current?.operatingCountryCodes as string[] | undefined) ?? []}
								proposed={payload.operatingCountryCodes as string[]}
							/>
						) : key === "creditStatementClosingInclusive" ? (
							<ValueDiff current={closing(current?.[key])} proposed={closing(payload[key])} />
						) : key === "aliases" ? (
							<ValueDiff
								current={((current?.aliases as string[] | undefined) ?? []).join(", ")}
								proposed={(payload.aliases as string[]).join(", ")}
							/>
						) : (
							<ValueDiff
								current={String(current?.[key] ?? "")}
								proposed={String(payload[key])}
							/>
						)}
					</dd>
				</div>
			))}
		</dl>
	);
}
