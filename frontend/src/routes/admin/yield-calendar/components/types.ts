export type CalendarEditing =
	| { kind: "country"; value: { code: string; name: string } | null }
	| { kind: "currency"; value: { currency: string; countryCode: string } | null }
	| { kind: "holiday"; value: { id: string; countryCode: string; date: string; name: string } | null };
