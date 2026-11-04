<script lang="ts">
	import { enhance } from '$app/forms';
	import { centsToInput, formatMoney } from '$lib/money';
	import { dayLabel } from '$lib/planner/describe';
	import type { BillOccurrence } from '$lib/server/repo/bills';
	import CategorySelect from './CategorySelect.svelte';
	import type { CategoryGroupOption } from './types';

	type Kind = 'savings' | 'debt' | 'bill' | 'spending';

	let {
		paycheckId,
		depositAccountId,
		accounts,
		groups,
		billsDue
	}: {
		paycheckId: string;
		depositAccountId: string;
		accounts: { id: string; name: string; type: string }[];
		groups: CategoryGroupOption[];
		billsDue: BillOccurrence[];
	} = $props();

	const kinds: { kind: Kind; label: string }[] = [
		{ kind: 'savings', label: 'Savings' },
		{ kind: 'debt', label: 'Debt' },
		{ kind: 'bill', label: 'Bill' },
		{ kind: 'spending', label: 'Spending' }
	];

	const isDebt = (t: string) => t === 'credit' || t === 'loan';
	const savingsAccounts = $derived(
		accounts
			.filter((a) => !isDebt(a.type) && a.id !== depositAccountId)
			.sort((a, b) => Number(a.type !== 'savings') - Number(b.type !== 'savings'))
	);
	const debtAccounts = $derived(accounts.filter((a) => isDebt(a.type)));
	const cashAccounts = $derived(accounts.filter((a) => a.type === 'cash'));
	const openBills = $derived(billsDue.filter((b) => !b.plannedLineId));

	let kind = $state<Kind>('savings');
	let toAccountId = $state('');
	let billKey = $state('');
	let amount = $state('');
	let label = $state('');
	let categoryId = $state('');
	let cashAccountId = $state('');

	const bill = $derived(openBills.find((b) => `${b.billId}|${b.dueDate}` === billKey));

	function choose(k: Kind) {
		kind = k;
		amount = '';
		toAccountId =
			k === 'savings'
				? (savingsAccounts[0]?.id ?? '')
				: k === 'debt'
					? (debtAccounts[0]?.id ?? '')
					: '';
		if (k === 'bill')
			pickBill(openBills[0] ? `${openBills[0].billId}|${openBills[0].dueDate}` : '');
	}

	function pickBill(key: string) {
		billKey = key;
		const b = openBills.find((o) => `${o.billId}|${o.dueDate}` === key);
		amount = b ? centsToInput(b.amountMinor) : '';
	}

	// Pick sensible defaults once the options are known.
	choose('savings');

	const uid = $props.id();
	const id = (k: string) => `line-${k}-${uid}`;
	const ready = $derived(
		kind === 'bill'
			? !!bill
			: kind === 'savings' || kind === 'debt'
				? !!toAccountId
				: !!(label.trim() || categoryId)
	);
</script>

<section class="card" aria-labelledby={id('heading')}>
	<h2 id={id('heading')} class="mb-3 font-medium">Add to plan</h2>

	<div
		class="mb-3 grid grid-cols-4 rounded-control border border-hairline p-0.5 text-sm"
		role="group"
		aria-label="Kind of line"
	>
		{#each kinds as k (k.kind)}
			<button
				type="button"
				class="rounded px-2 py-1.5 font-medium {kind === k.kind
					? 'bg-accent text-white'
					: 'text-ink hover:bg-tonal'}"
				aria-pressed={kind === k.kind}
				onclick={() => choose(k.kind)}>{k.label}</button
			>
		{/each}
	</div>

	<form
		method="POST"
		action="?/addLine"
		class="grid gap-3 sm:grid-cols-2"
		use:enhance={() =>
			async ({ result, update }) => {
				await update({ reset: false });
				if (result.type === 'success') {
					label = '';
					categoryId = '';
					choose(kind);
				}
			}}
	>
		<input type="hidden" name="paycheckId" value={paycheckId} />
		<input type="hidden" name="kind" value={kind} />

		{#if kind === 'savings'}
			<div>
				<label class="label" for={id('savings')}>Savings account</label>
				<select class="input" id={id('savings')} name="toAccountId" bind:value={toAccountId}>
					{#each savingsAccounts as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
				</select>
				{#if savingsAccounts.length === 0}
					<p class="mt-1 text-xs text-muted">
						<a class="link" href="/accounts">Add a savings account</a> first.
					</p>
				{/if}
			</div>
		{:else if kind === 'debt'}
			<div>
				<label class="label" for={id('debt')}>Debt account</label>
				<select class="input" id={id('debt')} name="toAccountId" bind:value={toAccountId}>
					{#each debtAccounts as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
				</select>
				{#if debtAccounts.length === 0}
					<p class="mt-1 text-xs text-muted">No cards or loans yet.</p>
				{/if}
			</div>
		{:else if kind === 'bill'}
			<div class="sm:col-span-2">
				<label class="label" for={id('bill')}>Bill</label>
				<select
					class="input"
					id={id('bill')}
					value={billKey}
					onchange={(e) => pickBill(e.currentTarget.value)}
				>
					{#each openBills as b (`${b.billId}|${b.dueDate}`)}
						<option value="{b.billId}|{b.dueDate}"
							>{b.name} · due {dayLabel(b.dueDate)} · {formatMoney(b.amountMinor)}</option
						>
					{/each}
				</select>
				{#if bill}
					<input type="hidden" name="billId" value={bill.billId} />
					<input type="hidden" name="dueDate" value={bill.dueDate} />
				{:else}
					<p class="mt-1 text-xs text-muted">
						Every bill due before the next payday is already in a plan.
					</p>
				{/if}
			</div>
		{:else}
			<div>
				<label class="label" for={id('label')}>Label</label>
				<input
					class="input"
					id={id('label')}
					name="label"
					placeholder="Groceries"
					bind:value={label}
				/>
			</div>
			<div>
				<label class="label" for={id('category')}>Category</label>
				<CategorySelect
					{groups}
					id={id('category')}
					name="categoryId"
					bind:value={categoryId}
					placeholder="No category"
				/>
			</div>
			{#if cashAccounts.length}
				<div>
					<label class="label" for={id('cash')}>Withdraw to cash account</label>
					<select class="input" id={id('cash')} name="toAccountId" bind:value={cashAccountId}>
						<option value="">No, keep it in checking</option>
						{#each cashAccounts as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
					</select>
				</div>
			{/if}
		{/if}

		<div>
			<label class="label" for={id('amount')}>Amount</label>
			<input
				class="input"
				id={id('amount')}
				name="amount"
				inputmode="decimal"
				placeholder="0.00"
				required={kind !== 'bill'}
				bind:value={amount}
			/>
		</div>

		<div class="flex items-end sm:col-span-2 sm:justify-end">
			<button class="btn w-full sm:w-auto" disabled={!ready}>Add to plan</button>
		</div>
	</form>
</section>
