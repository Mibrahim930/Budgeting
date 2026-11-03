// Pure plan arithmetic, safe to import from the browser for live totals. Mirrors LINE_KINDS and
// LINE_STATUSES in the schema.
export type LineKind = 'savings' | 'debt' | 'bill' | 'spending';
export type LineStatus = 'planned' | 'done';

export const LINE_KIND_LIST: readonly LineKind[] = ['savings', 'debt', 'bill', 'spending'];

export interface PlanLine {
	kind: LineKind;
	amountMinor: number;
	status: LineStatus;
	/** Null means the paycheck's deposit account. */
	fromAccountId: string | null;
	toAccountId: string | null;
}

export interface PlanTotals {
	allocated: number;
	/** Pay minus everything allocated; negative when over-allocated. */
	left: number;
	doneCount: number;
	plannedCount: number;
	byKind: Record<LineKind, number>;
}

export function planTotals(paycheck: { amountMinor: number }, lines: PlanLine[]): PlanTotals {
	const byKind = Object.fromEntries(LINE_KIND_LIST.map((k) => [k, 0])) as Record<LineKind, number>;
	let allocated = 0;
	let doneCount = 0;
	for (const l of lines) {
		allocated += l.amountMinor;
		byKind[l.kind] += l.amountMinor;
		if (l.status === 'done') doneCount++;
	}
	return {
		allocated,
		left: paycheck.amountMinor - allocated,
		doneCount,
		plannedCount: lines.length - doneCount,
		byKind
	};
}

export interface ProjectionPaycheck {
	/** Deposit account. */
	accountId: string;
	amountMinor: number;
	/** True once "Paycheck received" is ticked (the income is then in the real balances). */
	incomeConfirmed: boolean;
}

/**
 * Account balances now and once the plan is carried out. Done lines and confirmed income are
 * already in `balances`, so only what is still planned moves money. A spending line without a
 * cash account is earmarked, not moved: it stays in checking and creates no transaction when
 * ticked, so it doesn't change the projection either.
 */
export function projectBalances(
	paycheck: ProjectionPaycheck,
	lines: PlanLine[],
	balances: Map<string, number>
): Map<string, { before: number; after: number }> {
	const out = new Map<string, { before: number; after: number }>();
	const entry = (id: string) => {
		let e = out.get(id);
		if (!e) {
			const now = balances.get(id) ?? 0;
			e = { before: now, after: now };
			out.set(id, e);
		}
		return e;
	};
	for (const id of balances.keys()) entry(id);

	const deposit = entry(paycheck.accountId);
	if (!paycheck.incomeConfirmed) deposit.after += paycheck.amountMinor;
	for (const l of lines) {
		if (l.status !== 'planned') continue;
		if (l.kind === 'spending' && !l.toAccountId) continue;
		entry(l.fromAccountId ?? paycheck.accountId).after -= l.amountMinor;
		if (l.toAccountId) entry(l.toAccountId).after += l.amountMinor;
	}
	return out;
}
