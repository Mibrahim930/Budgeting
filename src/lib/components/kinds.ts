/**
 * The four kinds of plan line as reports show them, in a fixed order with fixed series colours
 * (the colours are the `--color-series-*` tokens in app.css). Keys match `KindTotals`.
 */
export const KINDS = [
	{ key: 'savings', label: 'Savings', color: 'var(--color-series-savings)' },
	{ key: 'debt', label: 'Debt', color: 'var(--color-series-debt)' },
	{ key: 'bills', label: 'Bills', color: 'var(--color-series-bills)' },
	{ key: 'spending', label: 'Spending', color: 'var(--color-series-spending)' }
] as const;

export type KindKey = (typeof KINDS)[number]['key'];
