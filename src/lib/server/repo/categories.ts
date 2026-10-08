import { and, asc, eq, isNull, max } from 'drizzle-orm';
import type { Db } from '../db/client';
import { category, categoryGroup } from '../db/schema';
import { newId } from '../id';

const DEFAULTS: { name: string; isIncome?: boolean; categories: string[] }[] = [
	{ name: 'Income', isIncome: true, categories: ['Paycheck', 'Other income'] },
	{ name: 'Bills', categories: ['Rent / Mortgage', 'Utilities', 'Phone & Internet', 'Insurance'] },
	{ name: 'Everyday', categories: ['Groceries', 'Dining out', 'Transportation', 'Household'] },
	{
		name: 'Lifestyle',
		categories: ['Entertainment', 'Shopping', 'Subscriptions', 'Personal care']
	},
	{ name: 'Savings goals', categories: ['Emergency fund', 'Vacation'] }
];

export function seedDefaultCategories(db: Db, userId: string) {
	db.transaction((tx) => {
		DEFAULTS.forEach((g, gi) => {
			const groupId = newId();
			tx.insert(categoryGroup)
				.values({ id: groupId, userId, name: g.name, isIncome: !!g.isIncome, sort: gi })
				.run();
			g.categories.forEach((name, ci) => {
				tx.insert(category)
					.values({ id: newId(), userId, groupId, name, isIncome: !!g.isIncome, sort: ci })
					.run();
			});
		});
	});
}

export type CategoryRow = typeof category.$inferSelect;
export type GroupWithCategories = typeof categoryGroup.$inferSelect & { categories: CategoryRow[] };

/** Active (non-archived) groups with their active categories, in display order. */
export function listCategoryTree(db: Db, userId: string): GroupWithCategories[] {
	const groups = db
		.select()
		.from(categoryGroup)
		.where(and(eq(categoryGroup.userId, userId), isNull(categoryGroup.archivedAt)))
		.orderBy(asc(categoryGroup.isIncome), asc(categoryGroup.sort), asc(categoryGroup.name))
		.all();
	const cats = listCategories(db, userId);
	return groups.map((g) => ({ ...g, categories: cats.filter((c) => c.groupId === g.id) }));
}

export function listCategories(db: Db, userId: string, includeArchived = false) {
	return db
		.select()
		.from(category)
		.where(
			includeArchived
				? eq(category.userId, userId)
				: and(eq(category.userId, userId), isNull(category.archivedAt))
		)
		.orderBy(asc(category.sort), asc(category.name))
		.all();
}

export function getCategory(db: Db, userId: string, id: string) {
	return db
		.select()
		.from(category)
		.where(and(eq(category.id, id), eq(category.userId, userId)))
		.get();
}

function getGroup(db: Db, userId: string, id: string) {
	return db
		.select()
		.from(categoryGroup)
		.where(and(eq(categoryGroup.id, id), eq(categoryGroup.userId, userId)))
		.get();
}

export function createGroup(db: Db, userId: string, name: string) {
	const next =
		(db
			.select({ m: max(categoryGroup.sort) })
			.from(categoryGroup)
			.where(eq(categoryGroup.userId, userId))
			.get()?.m ?? -1) + 1;
	const id = newId();
	db.insert(categoryGroup).values({ id, userId, name, sort: next }).run();
	return id;
}

export function createCategory(db: Db, userId: string, groupId: string, name: string) {
	const group = getGroup(db, userId, groupId);
	if (!group) throw new Error('Group not found');
	const next =
		(db
			.select({ m: max(category.sort) })
			.from(category)
			.where(and(eq(category.userId, userId), eq(category.groupId, groupId)))
			.get()?.m ?? -1) + 1;
	const id = newId();
	db.insert(category)
		.values({ id, userId, groupId, name, isIncome: group.isIncome, sort: next })
		.run();
	return id;
}

export function renameCategory(db: Db, userId: string, id: string, name: string) {
	db.update(category)
		.set({ name })
		.where(and(eq(category.id, id), eq(category.userId, userId)))
		.run();
}

export function renameGroup(db: Db, userId: string, id: string, name: string) {
	db.update(categoryGroup)
		.set({ name })
		.where(and(eq(categoryGroup.id, id), eq(categoryGroup.userId, userId)))
		.run();
}

/** Soft delete: history keeps pointing at the category. */
export function archiveCategory(db: Db, userId: string, id: string) {
	db.update(category)
		.set({ archivedAt: new Date() })
		.where(and(eq(category.id, id), eq(category.userId, userId)))
		.run();
}

export function archiveGroup(db: Db, userId: string, id: string) {
	const now = new Date();
	db.transaction((tx) => {
		tx.update(categoryGroup)
			.set({ archivedAt: now })
			.where(and(eq(categoryGroup.id, id), eq(categoryGroup.userId, userId)))
			.run();
		tx.update(category)
			.set({ archivedAt: now })
			.where(and(eq(category.groupId, id), eq(category.userId, userId)))
			.run();
	});
}
