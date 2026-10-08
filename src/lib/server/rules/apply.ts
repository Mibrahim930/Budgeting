import { and, asc, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import type { Db } from '../db/client';
import { category, payee, rule, RULE_FIELDS, RULE_OPS, txn } from '../db/schema';
import { newId } from '../id';
import { getCategory } from '../repo/categories';
import { normalizePayeeName, ValidationError } from '../repo/transactions';

export type RuleRow = typeof rule.$inferSelect;
export type RuleField = (typeof RULE_FIELDS)[number];
export type RuleOp = (typeof RULE_OPS)[number];

export interface RuleInput {
	matchField: RuleField;
	matchOp: RuleOp;
	matchValue: string;
	setCategoryId?: string | null;
	setPayeeName?: string | null;
	priority?: number;
}

export function listRules(db: Db, userId: string) {
	return db
		.select({ rule, categoryName: category.name })
		.from(rule)
		.leftJoin(category, eq(category.id, rule.setCategoryId))
		.where(eq(rule.userId, userId))
		.orderBy(desc(rule.priority), asc(rule.createdAt))
		.all()
		.map((r) => ({ ...r.rule, categoryName: r.categoryName }));
}

function validateRule(db: Db, userId: string, input: RuleInput) {
	if (!RULE_FIELDS.includes(input.matchField)) throw new ValidationError('Unknown field');
	if (!RULE_OPS.includes(input.matchOp)) throw new ValidationError('Unknown condition');
	if (!input.matchValue.trim()) throw new ValidationError('Enter text to match');
	if (!input.setCategoryId && !input.setPayeeName?.trim()) {
		throw new ValidationError('A rule must set a category or rename the payee');
	}
	if (input.setCategoryId && !getCategory(db, userId, input.setCategoryId)) {
		throw new ValidationError('Unknown category');
	}
}

export function createRule(db: Db, userId: string, input: RuleInput) {
	validateRule(db, userId, input);
	const id = newId();
	db.insert(rule)
		.values({
			id,
			userId,
			matchField: input.matchField,
			matchOp: input.matchOp,
			matchValue: input.matchValue.trim(),
			setCategoryId: input.setCategoryId || null,
			setPayeeName: input.setPayeeName?.trim() || null,
			priority: input.priority ?? 0
		})
		.run();
	return id;
}

export function deleteRule(db: Db, userId: string, id: string) {
	db.delete(rule)
		.where(and(eq(rule.id, id), eq(rule.userId, userId)))
		.run();
}

export function ruleMatches(
	r: Pick<RuleRow, 'matchField' | 'matchOp' | 'matchValue'>,
	t: { description?: string | null; payeeName?: string | null }
): boolean {
	const subject = (r.matchField === 'payee' ? t.payeeName : t.description) ?? '';
	const a = normalizePayeeName(subject);
	const b = normalizePayeeName(r.matchValue);
	if (!b) return false;
	switch (r.matchOp) {
		case 'equals':
			return a === b;
		case 'starts_with':
			return a.startsWith(b);
		default:
			return a.includes(b);
	}
}

export interface CategorizeResult {
	categoryId: string | null;
	payeeName: string | null;
}

/**
 * Categorizes incoming transactions: explicit rules first (highest priority wins; a rule may also
 * rename the payee), then the category last used for the same payee.
 */
export function createCategorizer(db: Db, userId: string) {
	const rules = listRules(db, userId);
	const learned = new Map<string, string | null>();

	function lastCategoryForPayee(payeeName: string): string | null {
		const norm = normalizePayeeName(payeeName);
		if (!learned.has(norm)) {
			const row = db
				.select({ categoryId: txn.categoryId })
				.from(txn)
				.innerJoin(payee, eq(payee.id, txn.payeeId))
				.innerJoin(category, eq(category.id, txn.categoryId))
				.where(
					and(
						eq(txn.userId, userId),
						eq(payee.normalizedName, norm),
						isNotNull(txn.categoryId),
						eq(txn.isParent, false)
					)
				)
				.orderBy(desc(txn.date), desc(txn.createdAt))
				.get();
			learned.set(norm, row?.categoryId ?? null);
		}
		return learned.get(norm) ?? null;
	}

	return (t: { description?: string | null; payeeName?: string | null }): CategorizeResult => {
		let payeeName = t.payeeName ?? null;
		let categoryId: string | null = null;
		for (const r of rules) {
			if (!ruleMatches(r, { description: t.description, payeeName })) continue;
			if (r.setPayeeName && payeeName === t.payeeName) payeeName = r.setPayeeName;
			if (r.setCategoryId && !categoryId) categoryId = r.setCategoryId;
			if (categoryId && payeeName !== t.payeeName) break;
		}
		if (!categoryId && payeeName) categoryId = lastCategoryForPayee(payeeName);
		return { categoryId, payeeName };
	};
}

/** Run rules over existing uncategorized transactions. Returns how many were categorized. */
export function applyRulesToUncategorized(db: Db, userId: string): number {
	const categorize = createCategorizer(db, userId);
	const rows = db
		.select({ id: txn.id, description: txn.description, payeeName: payee.name })
		.from(txn)
		.leftJoin(payee, eq(payee.id, txn.payeeId))
		.where(
			and(
				eq(txn.userId, userId),
				isNull(txn.categoryId),
				eq(txn.isParent, false),
				isNull(txn.transferId)
			)
		)
		.all();
	let n = 0;
	db.transaction(() => {
		for (const r of rows) {
			const res = categorize({ description: r.description, payeeName: r.payeeName });
			if (res.categoryId) {
				db.update(txn).set({ categoryId: res.categoryId }).where(eq(txn.id, r.id)).run();
				n++;
			}
		}
	});
	return n;
}
