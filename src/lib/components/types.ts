export interface CategoryOption {
	id: string;
	name: string;
}

export interface CategoryGroupOption {
	id: string;
	name: string;
	categories: CategoryOption[];
}

export interface AccountOption {
	id: string;
	name: string;
	onBudget: boolean;
}

export interface TxnFormValue {
	id?: string;
	accountId: string;
	date: string;
	amountMinor: number;
	payeeName: string | null;
	memo: string | null;
	cleared: boolean;
	categoryId: string | null;
	transferAccountId: string | null;
	splits: { amountMinor: number; categoryId: string | null; memo: string | null }[];
}
