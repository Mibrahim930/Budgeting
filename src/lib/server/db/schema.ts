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
	budgetMode: text('budget_mode', { enum: ['envelope', 'limits'] })
		.notNull()
		.default('envelope'),
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

export const budgetAllocation = sqliteTable(
	'budget_allocation',
	{
		userId: userId(),
		categoryId: text('category_id')
			.notNull()
			.references(() => category.id, { onDelete: 'cascade' }),
		month: text('month').notNull(),
		budgetedMinor: integer('budgeted_minor').notNull().default(0)
	},
	(t) => [uniqueIndex('budget_allocation_key').on(t.userId, t.categoryId, t.month)]
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
