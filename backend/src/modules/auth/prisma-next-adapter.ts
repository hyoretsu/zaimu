import { type CleanedWhere, createAdapterFactory, type CustomAdapter } from "@better-auth/core/db/adapter";
import { and, db, or } from "~/shared/infra/sql";

type AuthRecord = Record<string, unknown>;
interface Field {
	endsWith(value: unknown): unknown;
	eq(value: unknown): unknown;
	gt(value: unknown): unknown;
	gte(value: unknown): unknown;
	ilike(value: string): unknown;
	in(value: readonly unknown[]): unknown;
	like(value: string): unknown;
	lt(value: unknown): unknown;
	lte(value: unknown): unknown;
	neq(value: unknown): unknown;
	notIn(value: readonly unknown[]): unknown;
	startsWith(value: unknown): unknown;
	asc(): unknown;
	desc(): unknown;
}
type ModelAccessor = Record<string, Field>;
interface AuthCollection {
	aggregate(spec: (aggregate: { count(): unknown }) => { count: unknown }): Promise<{ count: number }>;
	all(): Promise<AuthRecord[]>;
	create(data: AuthRecord): Promise<AuthRecord>;
	delete(): Promise<AuthRecord | null>;
	deleteAndCount(): Promise<number>;
	first(): Promise<AuthRecord | null>;
	orderBy(spec: (model: ModelAccessor) => unknown): AuthCollection;
	select(...fields: string[]): AuthCollection;
	offset(count: number): AuthCollection;
	limit(count: number): AuthCollection;
	update(data: AuthRecord): Promise<AuthRecord | null>;
	updateAndCount(data: AuthRecord): Promise<number>;
	where(spec: (model: ModelAccessor) => unknown): AuthCollection;
}

type PrismaNextClient = Pick<typeof db, "orm">;

const collectionFor = (client: PrismaNextClient, model: string) => {
	const collection = client.orm.public[model as keyof typeof client.orm.public];
	if (!collection) throw new Error(`Unknown Better Auth model: ${model}`);
	return collection as unknown as AuthCollection;
};

const escapeLike = (value: string) =>
	value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");

const predicateFor = (field: Field, condition: CleanedWhere) => {
	const value = condition.value;
	switch (condition.operator) {
		case "ne":
			return field.neq(value);
		case "lt":
			return field.lt(value);
		case "lte":
			return field.lte(value);
		case "gt":
			return field.gt(value);
		case "gte":
			return field.gte(value);
		case "in":
			return field.in(Array.isArray(value) ? value : [value]);
		case "not_in":
			return field.notIn(Array.isArray(value) ? value : [value]);
		case "contains": {
			const pattern = `%${escapeLike(String(value))}%`;
			return condition.mode === "insensitive" ? field.ilike(pattern) : field.like(pattern);
		}
		case "starts_with": {
			const pattern = `${escapeLike(String(value))}%`;
			return condition.mode === "insensitive" ? field.ilike(pattern) : field.like(pattern);
		}
		case "ends_with": {
			const pattern = `%${escapeLike(String(value))}`;
			return condition.mode === "insensitive" ? field.ilike(pattern) : field.like(pattern);
		}
		default:
			if (condition.mode === "insensitive" && typeof value === "string")
				return field.ilike(escapeLike(value));
			return field.eq(value);
	}
};

const applyWhere = (
	collection: AuthCollection,
	where: CleanedWhere[],
	fieldName: (field: string) => string,
) => {
	if (where.length === 0) return collection;
	return collection.where(model => {
		const required = where
			.filter(condition => condition.connector !== "OR")
			.map(condition => predicateFor(model[fieldName(condition.field)]!, condition));
		const alternatives = where
			.filter(condition => condition.connector === "OR")
			.map(condition => predicateFor(model[fieldName(condition.field)]!, condition));
		if (alternatives.length > 0) required.push(or(...(alternatives as Parameters<typeof or>)));
		return and(...(required as Parameters<typeof and>));
	});
};

const selectFields = (
	collection: AuthCollection,
	select: string[] | undefined,
	fieldName: (field: string) => string,
) => (select?.length ? collection.select(...select.map(fieldName)) : collection);

const customAdapter = (
	client: PrismaNextClient,
	fieldName: (model: string, field: string) => string,
): CustomAdapter => ({
	async consumeOne({ model, where }) {
		return (await applyWhere(collectionFor(client, model), where, field =>
			fieldName(model, field),
		).delete()) as never;
	},
	async count({ model, where }) {
		const collection = applyWhere(collectionFor(client, model), where ?? [], field =>
			fieldName(model, field),
		);
		return (await collection.aggregate(aggregate => ({ count: aggregate.count() }))).count;
	},
	async create({ data, model, select }) {
		const row = await selectFields(collectionFor(client, model), select, field =>
			fieldName(model, field),
		).create(data);
		return row as typeof data;
	},
	async delete({ model, where }) {
		await applyWhere(collectionFor(client, model), where, field => fieldName(model, field)).delete();
	},
	async deleteMany({ model, where }) {
		return applyWhere(collectionFor(client, model), where, field =>
			fieldName(model, field),
		).deleteAndCount();
	},
	async findMany({ limit, model, offset, select, sortBy, where }) {
		let collection = applyWhere(collectionFor(client, model), where ?? [], field =>
			fieldName(model, field),
		);
		if (sortBy) {
			collection = collection.orderBy(accessor =>
				sortBy.direction === "desc"
					? accessor[fieldName(model, sortBy.field)]!.desc()
					: accessor[fieldName(model, sortBy.field)]!.asc(),
			);
		}
		collection = selectFields(collection, select, field => fieldName(model, field))
			.offset(offset ?? 0)
			.limit(limit);
		return (await collection.all()) as never[];
	},
	async findOne({ model, select, where }) {
		return (await selectFields(
			applyWhere(collectionFor(client, model), where, field => fieldName(model, field)),
			select,
			field => fieldName(model, field),
		).first()) as never;
	},
	async incrementOne({ increment, model, set, where }) {
		return db.transaction(async tx => {
			const collection = applyWhere(collectionFor(tx, model), where, field => fieldName(model, field));
			const current = await collection.first();
			if (!current) return null;
			const update = { ...set };
			for (const [field, amount] of Object.entries(increment))
				update[field] = Number(current[field]) + amount;
			return (await collection.update(update)) as never;
		});
	},
	async update({ model, update, where }) {
		return (await applyWhere(collectionFor(client, model), where, field =>
			fieldName(model, field),
		).update(update as AuthRecord)) as never;
	},
	async updateMany({ model, update, where }) {
		return applyWhere(collectionFor(client, model), where, field =>
			fieldName(model, field),
		).updateAndCount(update);
	},
});

export const prismaNextAdapter = () =>
	createAdapterFactory({
		adapter: ({ getFieldName }) => customAdapter(db, (model, field) => getFieldName({ field, model })),
		config: {
			adapterId: "prisma-next",
			adapterName: "Prisma 8 ORM Adapter",
			supportsArrays: true,
			supportsBooleans: true,
			supportsDates: true,
			supportsUUIDs: true,
			transaction: false,
		},
	});
