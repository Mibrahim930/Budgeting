<script lang="ts">
	import { enhance } from '$app/forms';
	import { today } from '$lib/month';
	import { centsToInput, formatMoney, parseMoney } from '$lib/money';
	import CategorySelect from './CategorySelect.svelte';
	import type { AccountOption, CategoryGroupOption, TxnFormValue } from './types';

	let {
		accounts,
		groups,
		payees = [],
		action,
		initial,
		defaultAccountId,
		submitLabel = 'Save',
		error,
		onsaved
	}: {
		accounts: AccountOption[];
		groups: CategoryGroupOption[];
		payees?: string[];
		action: string;
		initial?: TxnFormValue;
		defaultAccountId?: string;
		submitLabel?: string;
		error?: string;
		onsaved?: () => void;
	} = $props();

	// Form state is seeded once from `initial`; later prop changes don't reset what the user typed.
	function seed() {
		const v = initial;
		const splitRows = v?.splits.length
			? v.splits.map((s) => ({
					// Split amounts are shown in the parent's direction (see parseTxnForm).
					amount: centsToInput(s.amountMinor * (v.amountMinor > 0 ? 1 : -1)),
					categoryId: s.categoryId ?? '',
					memo: s.memo ?? ''
				}))
			: [
					{ amount: '', categoryId: '', memo: '' },
					{ amount: '', categoryId: '', memo: '' }
				];
		return {
			accountId: v?.accountId ?? defaultAccountId ?? accounts[0]?.id ?? '',
			date: v?.date ?? today(),
			direction: v && v.amountMinor > 0 ? 'in' : 'out',
			amount: v ? centsToInput(Math.abs(v.amountMinor)) : '',
			payee: v?.payeeName ?? '',
			memo: v?.memo ?? '',
			cleared: v?.cleared ?? false,
			category: v?.transferAccountId
				? `transfer:${v.transferAccountId}`
				: v?.splits.length
					? 'split'
					: (v?.categoryId ?? ''),
			transferCategory: v?.transferAccountId ? (v.categoryId ?? '') : '',
			splits: splitRows
		};
	}

	const s = $state(seed());

	const transferAccounts = $derived(accounts.filter((a) => a.id !== s.accountId));
	const transferTarget = $derived(
		s.category.startsWith('transfer:')
			? accounts.find((a) => a.id === s.category.slice('transfer:'.length))
			: undefined
	);
	const fromAccount = $derived(accounts.find((a) => a.id === s.accountId));
	const needsTransferCategory = $derived(
		!!transferTarget && !!fromAccount?.onBudget && !transferTarget.onBudget
	);
	const splitTotal = $derived(s.splits.reduce((a, r) => a + (parseMoney(r.amount) ?? 0), 0));
	const remaining = $derived((parseMoney(s.amount) ?? 0) - splitTotal);
	const payeeListId = `payees-${Math.random().toString(36).slice(2)}`;
</script>

<form
	method="POST"
	{action}
	class="space-y-3"
	use:enhance={() =>
		async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'success' || result.type === 'redirect') {
				if (!initial) Object.assign(s, { ...seed(), accountId: s.accountId, date: s.date });
				onsaved?.();
			}
		}}
>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	{#if initial?.id}<input type="hidden" name="id" value={initial.id} />{/if}
	<input type="hidden" name="direction" value={s.direction} />
	<input type="hidden" name="splits" value={JSON.stringify(s.splits)} />

	<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
		<div class="col-span-2 sm:col-span-1">
			<label class="label" for="t-date">Date</label>
			<input class="input" id="t-date" name="date" type="date" required bind:value={s.date} />
		</div>
		<div class="col-span-2 sm:col-span-1">
			<label class="label" for="t-account">Account</label>
			<select class="input" id="t-account" name="accountId" bind:value={s.accountId}>
				{#each accounts as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
			</select>
		</div>
		<div class="col-span-2">
			<label class="label" for="t-payee">Payee</label>
			<input class="input" id="t-payee" name="payee" list={payeeListId} bind:value={s.payee} />
			<datalist id={payeeListId}>
				{#each payees as p (p)}<option value={p}></option>{/each}
			</datalist>
		</div>
	</div>

	<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
		<div class="col-span-2 sm:col-span-1">
			<span class="label">Type</span>
			<div class="flex rounded-md border border-slate-300 bg-white p-0.5 text-sm" role="group">
				<button
					type="button"
					class="flex-1 rounded px-2 py-1.5 {s.direction === 'out'
						? 'bg-slate-800 text-white'
						: ''}"
					aria-pressed={s.direction === 'out'}
					onclick={() => (s.direction = 'out')}>Outflow</button
				>
				<button
					type="button"
					class="flex-1 rounded px-2 py-1.5 {s.direction === 'in'
						? 'bg-emerald-700 text-white'
						: ''}"
					aria-pressed={s.direction === 'in'}
					onclick={() => (s.direction = 'in')}>Inflow</button
				>
			</div>
		</div>
		<div class="col-span-2 sm:col-span-1">
			<label class="label" for="t-amount">Amount</label>
			<input
				class="input tabular-nums"
				id="t-amount"
				name="amount"
				inputmode="decimal"
				placeholder="0.00"
				required
				bind:value={s.amount}
			/>
		</div>
		<div class="col-span-2">
			<label class="label" for="t-category">Category</label>
			<CategorySelect
				id="t-category"
				name="category"
				{groups}
				{transferAccounts}
				allowSplit
				bind:value={s.category}
			/>
		</div>
	</div>

	{#if needsTransferCategory}
		<div>
			<label class="label" for="t-transfer-category">
				Budget category (money is leaving your budget)
			</label>
			<CategorySelect
				id="t-transfer-category"
				name="transferCategory"
				{groups}
				bind:value={s.transferCategory}
			/>
		</div>
	{/if}

	{#if s.category === 'split'}
		<div class="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
			{#each s.splits as row, i (i)}
				<div class="grid grid-cols-12 gap-2">
					<input
						class="input col-span-4 tabular-nums sm:col-span-3"
						inputmode="decimal"
						placeholder="0.00"
						aria-label="Split {i + 1} amount"
						bind:value={row.amount}
					/>
					<div class="col-span-8 sm:col-span-5">
						<CategorySelect {groups} bind:value={row.categoryId} />
					</div>
					<input
						class="input col-span-10 sm:col-span-3"
						placeholder="Memo"
						aria-label="Split {i + 1} memo"
						bind:value={row.memo}
					/>
					<button
						type="button"
						class="col-span-2 text-slate-400 hover:text-red-600 sm:col-span-1"
						aria-label="Remove split {i + 1}"
						disabled={s.splits.length <= 2}
						onclick={() => s.splits.splice(i, 1)}>✕</button
					>
				</div>
			{/each}
			<div class="flex items-center justify-between text-sm">
				<button
					type="button"
					class="text-teal-700 hover:underline"
					onclick={() => s.splits.push({ amount: '', categoryId: '', memo: '' })}
					>+ Add split</button
				>
				<span class={remaining === 0 ? 'text-slate-500' : 'font-medium text-amber-700'}>
					{remaining === 0 ? 'Fully assigned' : `${formatMoney(remaining)} left to assign`}
				</span>
			</div>
		</div>
	{/if}

	<div class="grid grid-cols-1 gap-3 sm:grid-cols-4">
		<div class="sm:col-span-3">
			<label class="label" for="t-memo">Memo</label>
			<input class="input" id="t-memo" name="memo" bind:value={s.memo} />
		</div>
		<label class="flex items-center gap-2 text-sm sm:mt-6">
			<input type="checkbox" name="cleared" bind:checked={s.cleared} /> Cleared
		</label>
	</div>

	<button class="btn">{submitLabel}</button>
</form>
