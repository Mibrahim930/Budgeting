import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Money is always stored as integer cents (`*_minor` columns). Dates are 'YYYY-MM-DD' text,
// months are 'YYYY-MM' text. Every domain row carries user_id for isolation.

const timestamps = {
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.default(sql`(unixepoch('subsec') * 1000)`),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
		.notNull()
		.default(sql`(unixepoch('subsec') * 1000)`)
		.$onUpdate(() => new Date())
};

// ---------------------------------------------------------------------------
// Better Auth tables (field names must match Better Auth's model fields)
// ---------------------------------------------------------------------------

export const user = sqliteTable('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
	image: text('image'),
	role: text('role', { enum: ['admin', 'user'] })
		.notNull()
		.default('user'),
	...timestamps
});

export const session = sqliteTable(
	'session',
	{
		id: text('id').primaryKey(),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		token: text('token').notNull().unique(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		...timestamps
	},
	(t) => [index('session_user_idx').on(t.userId)]
);

export const account = sqliteTable(
	'account',
	{
		id: text('id').primaryKey(),
		accountId: text('account_id').notNull(),
		providerId: text('provider_id').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		idToken: text('id_token'),
		accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
		refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
		scope: text('scope'),
		password: text('password'),
		...timestamps
	},
	(t) => [index('account_user_idx').on(t.userId)]
);

export const verification = sqliteTable('verification', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
	...timestamps
});

export const passkey = sqliteTable(
	'passkey',
	{
		id: text('id').primaryKey(),
		name: text('name'),
		publicKey: text('public_key').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		credentialID: text('credential_id').notNull(),
		counter: integer('counter').notNull(),
		deviceType: text('device_type').notNull(),
		backedUp: integer('backed_up', { mode: 'boolean' }).notNull(),
		transports: text('transports'),
		aaguid: text('aaguid'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
	},
	(t) => [index('passkey_user_idx').on(t.userId)]
);

export const invite = sqliteTable('invite', {
	code: text('code').primaryKey(),
	createdBy: text('created_by')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	usedBy: text('used_by').references(() => user.id, { onDelete: 'set null' }),
	usedAt: integer('used_at', { mode: 'timestamp_ms' }),
	expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
	createdAt: timestamps.createdAt
});

// ---------------------------------------------------------------------------
// Budgeting domain
// ---------------------------------------------------------------------------

const userId = () =>
	text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' });

export const bankConnection = sqliteTable(
	'bank_connection',
	{
		id: text('id').primaryKey(),
		userId: userId(),
		provider: text('provider', { enum: ['simplefin'] }).notNull(),
		label: text('label').notNull(),
		/** Provider secret (e.g. SimpleFIN Access URL), AES-256-GCM encrypted. */
		accessSecretEnc: text('access_secret_enc').notNull(),
		status: text('status', { enum: ['ok', 'error'] })
			.notNull()
			.default('ok'),
		error: text('error'),
		lastSyncedAt: integer('last_synced_at', { mode: 'timestamp_ms' }),
		...timestamps
	},
	(t) => [index('bank_connection_user_idx').on(t.userId)]
);

export const ACCOUNT_TYPES = [
	'checking',
	'savings',
	'credit',
	'cash',
	'loan',
	'investment'
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const finAccount = sqliteTable(
	'fin_account',
	{
		id: text('id').primaryKey(),
		userId: userId(),
		name: text('name').notNull(),
		type: text('type', { enum: ACCOUNT_TYPES }).notNull(),
		onBudget: integer('on_budget', { mode: 'boolean' }).notNull().default(true),
		currency: text('currency').notNull().default('USD'),
		connectionId: text('connection_id').references(() => bankConnection.id, {
			onDelete: 'set null'
		}),
		/** Account id at the bank-data provider. */
		externalId: text('external_id'),
		/** Saved CSV column mapping (JSON) for one-click imports. */
		csvMapping: text('csv_mapping'),
		sort: integer('sort').notNull().default(0),
		archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
		...timestamps
	},
	(t) => [index('fin_account_user_idx').on(t.userId)]
);

export const balanceSnapshot = sqliteTable(
	'balance_snapshot',
	{
		id: text('id').primaryKey(),
		userId: userId(),
		accountId: text('account_id')
			.notNull()
			.references(() => finAccount.id, { onDelete: 'cascade' }),
		asOf: integer('as_of', { mode: 'timestamp_ms' }).notNull(),
		balanceMinor: integer('balance_minor').notNull(),
		source: text('source', { enum: ['provider', 'reconcile'] }).notNull()
	},
	(t) => [index('balance_snapshot_account_idx').on(t.accountId, t.asOf)]
);

export const categoryGroup = sqliteTable(
	'category_group',
	{
		id: text('id').primaryKey(),
		userId: userId(),
		name: text('name').notNull(),
		isIncome: integer('is_income', { mode: 'boolean' }).notNull().default(false),
		sort: integer('sort').notNull().default(0),
		archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
		...timestamps
	},
	(t) => [index('category_group_user_idx').on(t.userId)]
);

export const category = sqliteTable(
	'category',
	{
		id: text('id').primaryKey(),
		userId: userId(),
		groupId: text('group_id')
			.notNull()
			.references(() => categoryGroup.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		isIncome: integer('is_income', { mode: 'boolean' }).notNull().default(false),
		sort: integer('sort').notNull().default(0),
		archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
		...timestamps
	},
	(t) => [index('category_user_idx').on(t.userId)]
);

export const payee = sqliteTable(
	'payee',
	{
		id: text('id').primaryKey(),
		userId: userId(),
		name: text('name').notNull(),
		normalizedName: text('normalized_name').notNull(),
		...timestamps
	},
	(t) => [uniqueIndex('payee_user_norm_idx').on(t.userId, t.normalizedName)]
);

export const importBatch = sqliteTable(
	'import_batch',
	{
		id: text('id').primaryKey(),
		userId: userId(),
		accountId: text('account_id').references(() => finAccount.id, { onDelete: 'cascade' }),
		source: text('source', { enum: ['csv', 'ofx', 'simplefin'] }).notNull(),
		fileName: text('file_name'),
		added: integer('added').notNull().default(0),
		updated: integer('updated').notNull().default(0),
		skipped: integer('skipped').notNull().default(0),
		undoneAt: integer('undone_at', { mode: 'timestamp_ms' }),
		createdAt: timestamps.createdAt
	},
	(t) => [index('import_batch_user_idx').on(t.userId)]
);

export const TXN_SOURCES = ['manual', 'csv', 'ofx', 'simplefin'] as const;

export const txn = sqliteTable(
	'txn',
	{
		id: text('id').primaryKey(),
		userId: userId(),
		accountId: text('account_id')
			.notNull()
			.references(() => finAccount.id, { onDelete: 'cascade' }),
		date: text('date').notNull(),
		amountMinor: integer('amount_minor').notNull(),
		payeeId: text('payee_id').references(() => payee.id, { onDelete: 'set null' }),
		/** Raw description from the bank, kept for rules and dedupe. */
		description: text('description'),
		categoryId: text('category_id').references(() => category.id, { onDelete: 'set null' }),
		memo: text('memo'),
		cleared: integer('cleared', { mode: 'boolean' }).notNull().default(false),
		reconciled: integer('reconciled', { mode: 'boolean' }).notNull().default(false),
		pending: integer('pending', { mode: 'boolean' }).notNull().default(false),
		/** Set on split children; the parent row keeps the full amount and no category. */
		parentId: text('parent_id'),
		isParent: integer('is_parent', { mode: 'boolean' }).notNull().default(false),
		/** Shared by the two legs of a transfer. */
		transferId: text('transfer_id'),
		source: text('source', { enum: TXN_SOURCES }).notNull().default('manual'),
		externalId: text('external_id'),
		importHash: text('import_hash'),
		importBatchId: text('import_batch_id').references(() => importBatch.id, {
			onDelete: 'set null'
		}),
		...timestamps
	},
	(t) => [
		index('txn_user_date_idx').on(t.userId, t.date),
		index('txn_account_idx').on(t.accountId, t.date),
		index('txn_parent_idx').on(t.parentId),
		index('txn_transfer_idx').on(t.transferId),
		index('txn_external_idx').on(t.accountId, t.externalId),
		index('txn_hash_idx').on(t.accountId, t.importHash)
	]
);

// ---------------------------------------------------------------------------
// Paycheck planner
// ---------------------------------------------------------------------------

export const PAY_FREQUENCIES = ['weekly', 'biweekly', 'semimonthly', 'monthly'] as const;
export type PayFrequency = (typeof PAY_FREQUENCIES)[number];

/** How often the user is paid. One per user; only used for predictions and defaults. */
export const paySchedule = sqliteTable(
	'pay_schedule',
	{
		id: text('id').primaryKey(),
		userId: userId(),
		frequency: text('frequency', { enum: PAY_FREQUENCIES }).notNull(),
		/** Typical net pay. */
		amountMinor: integer('amount_minor').notNull(),
		/** A known payday: the cycle anchor, and the day-of-month source for monthly pay. */
		anchorDate: text('anchor_date').notNull(),
		/** Semimonthly only. */
		semiDay1: integer('semi_day_1').notNull().default(1),
		semiDay2: integer('semi_day_2').notNull().default(15),
		depositAccountId: text('deposit_account_id').references(() => finAccount.id, {
			onDelete: 'set null'
		}),
		incomeCategoryId: text('income_category_id').references(() => category.id, {
			onDelete: 'set null'
		}),
		...timestamps
	},
	(t) => [uniqueIndex('pay_schedule_user_idx').on(t.userId)]
);

export const BILL_FREQUENCIES = ['monthly', 'every_n_weeks', 'yearly', 'once'] as const;
export type BillFrequency = (typeof BILL_FREQUENCIES)[number];

export const recurringBill = sqliteTable(
	'recurring_bill',
	{
		id: text('id').primaryKey(),
		userId: userId(),
		name: text('name').notNull(),
		amountMinor: integer('amount_minor').notNull(),
		frequency: text('frequency', { enum: BILL_FREQUENCIES }).notNull(),
		/** Monthly/yearly: 1..31, clamped to the month's length. */
		dayOfMonth: integer('day_of_month'),
		/** Yearly: 1..12. */
		monthOfYear: integer('month_of_year'),
		/** Every N weeks: 1..52. */
		intervalWeeks: integer('interval_weeks'),
		/** First possible due date; the weekday anchor for every_n_weeks; the date for once. */
		startDate: text('start_date').notNull(),
		/** Inclusive last due date. */
		endedAt: text('ended_at'),
		/** Paid from. */
		accountId: text('account_id')
			.notNull()
			.references(() => finAccount.id, { onDelete: 'cascade' }),
		categoryId: text('category_id').references(() => category.id, { onDelete: 'set null' }),
		/** Credit card or loan this bill pays down. */
		payToAccountId: text('pay_to_account_id').references(() => finAccount.id, {
			onDelete: 'set null'
		}),
		...timestamps
	},
	(t) => [index('recurring_bill_user_idx').on(t.userId)]
);

export const paycheck = sqliteTable(
	'paycheck',
	{
		id: text('id').primaryKey(),
		userId: userId(),
		date: text('date').notNull(),
		amountMinor: integer('amount_minor').notNull(),
		/** Deposit account. */
		accountId: text('account_id')
			.notNull()
			.references(() => finAccount.id, { onDelete: 'cascade' }),
		incomeCategoryId: text('income_category_id').references(() => category.id, {
			onDelete: 'set null'
		}),
		/** Expected next payday; the plan covers bills due in [date, nextDate). */
		nextDate: text('next_date'),
		/** Set when "Paycheck received" is ticked. */
		incomeTxnId: text('income_txn_id').references(() => txn.id, { onDelete: 'set null' }),
		note: text('note'),
		...timestamps
	},
	(t) => [index('paycheck_user_date_idx').on(t.userId, t.date)]
);

export const LINE_KINDS = ['savings', 'debt', 'bill', 'spending'] as const;
export type LineKind = (typeof LINE_KINDS)[number];
export const LINE_STATUSES = ['planned', 'done'] as const;
export type LineStatus = (typeof LINE_STATUSES)[number];
export const TXN_ORIGINS = ['created', 'linked'] as const;

export const paycheckLine = sqliteTable(
	'paycheck_line',
	{
		id: text('id').primaryKey(),
		userId: userId(),
		paycheckId: text('paycheck_id')
			.notNull()
			.references(() => paycheck.id, { onDelete: 'cascade' }),
		kind: text('kind', { enum: LINE_KINDS }).notNull(),
		/** Snapshot text, so editing a bill later doesn't rewrite history. */
		label: text('label').notNull(),
		amountMinor: integer('amount_minor').notNull(),
		/** Null means the paycheck's deposit account. */
		fromAccountId: text('from_account_id').references(() => finAccount.id, {
			onDelete: 'set null'
		}),
		toAccountId: text('to_account_id').references(() => finAccount.id, { onDelete: 'set null' }),
		categoryId: text('category_id').references(() => category.id, { onDelete: 'set null' }),
		billId: text('bill_id').references(() => recurringBill.id, { onDelete: 'set null' }),
		/** The bill occurrence's due date. */
		dueDate: text('due_date'),
		status: text('status', { enum: LINE_STATUSES }).notNull().default('planned'),
		txnId: text('txn_id').references(() => txn.id, { onDelete: 'set null' }),
		/** Whether the app created the transaction or linked an existing (synced) one. */
		txnOrigin: text('txn_origin', { enum: TXN_ORIGINS }),
		doneAt: integer('done_at', { mode: 'timestamp_ms' }),
		sort: integer('sort').notNull().default(0),
		...timestamps
	},
	(t) => [
		index('paycheck_line_user_idx').on(t.userId),
		index('paycheck_line_paycheck_idx').on(t.paycheckId),
		index('paycheck_line_bill_due_idx').on(t.billId, t.dueDate)
	]
);

export const RULE_FIELDS = ['description', 'payee'] as const;
export const RULE_OPS = ['contains', 'equals', 'starts_with'] as const;

export const rule = sqliteTable(
	'rule',
	{
		id: text('id').primaryKey(),
		userId: userId(),
		matchField: text('match_field', { enum: RULE_FIELDS }).notNull(),
		matchOp: text('match_op', { enum: RULE_OPS }).notNull(),
		matchValue: text('match_value').notNull(),
		setCategoryId: text('set_category_id').references(() => category.id, {
			onDelete: 'cascade'
		}),
		setPayeeName: text('set_payee_name'),
		priority: integer('priority').notNull().default(0),
		...timestamps
	},
	(t) => [index('rule_user_idx').on(t.userId)]
);
