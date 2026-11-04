<script lang="ts">
	import { enhance } from '$app/forms';
	import { centsToInput } from '$lib/money';
	import { today } from '$lib/month';
	import { monthName } from '$lib/planner/describe';
	import CategorySelect from './CategorySelect.svelte';
	import type { CategoryGroupOption } from './types';

	interface BillValue {
		name: string;
		amountMinor: number;
		frequency: string;
		dayOfMonth: number | null;
		monthOfYear: number | null;
		intervalWeeks: number | null;
		startDate: string;
		endedAt: string | null;
		accountId: string;
		categoryId: string | null;
		payToAccountId: string | null;
	}

	let {
		accounts,
		groups,
		action,
		initial,
		submitLabel = 'Save bill',
		error,
		onsaved,
		nested = false
	}: {
		accounts: { id: string; name: string; type: string }[];
		groups: CategoryGroupOption[];
		action: string;
		/** A bill to edit, or a few fields to prefill a new one. */
		initial?: Partial<BillValue> | null;
		submitLabel?: string;
		error?: string | null;
		/** Called after the action succeeds. */
		onsaved?: () => void;
		/** Inside another card: drop the form's own card frame. */
		nested?: boolean;
	} = $props();

	// Seeded once; later reloads (after saving) don't reset what's on screen.
	function seed() {
		const fallbackAccount =
			accounts.find((a) => a.type === 'checking')?.id ?? accounts[0]?.id ?? '';
		return {
			frequency: initial?.frequency ?? 'monthly',
			categoryId: initial?.categoryId ?? '',
			accountId: initial?.accountId ?? fallbackAccount,
			payToAccountId: initial?.payToAccountId ?? ''
		};
	}
	const start = seed();
	let frequency = $state(start.frequency);
	let categoryId = $state(start.categoryId);
	let accountId = $state(start.accountId);
	let payToAccountId = $state(start.payToAccountId);

	const debtAccounts = $derived(accounts.filter((a) => a.type === 'credit' || a.type === 'loan'));
	const months = Array.from({ length: 12 }, (_, i) => i + 1);
	// Distinct ids when the form appears more than once on a page; stable across SSR/hydration.
	const uid = $props.id();
	const id = (k: string) => `bill-${k}-${uid}`;
</script>

<form
	method="POST"
	{action}
	class="@container"
	use:enhance={() =>
		async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'success' || result.type === 'redirect') onsaved?.();
		}}
>
	<div class="grid gap-3 @lg:grid-cols-2 {nested ? '' : 'card'}">
		{#if error}<p class="error @lg:col-span-2" role="alert">{error}</p>{/if}

		<div>
			<label class="label" for={id('name')}>Bill name</label>
			<input
				class="input"
				id={id('name')}
				name="name"
				required
				autocomplete="off"
				placeholder="e.g. Rent, Gym, Netflix"
				value={initial?.name ?? ''}
			/>
		</div>
		<div>
			<label class="label" for={id('amount')}>Amount</label>
			<input
				class="input"
				id={id('amount')}
				name="amount"
				inputmode="decimal"
				placeholder="0.00"
				required
				value={initial?.amountMinor != null ? centsToInput(initial.amountMinor) : ''}
			/>
		</div>

		<div>
			<label class="label" for={id('frequency')}>How often</label>
			<select class="input" id={id('frequency')} name="frequency" bind:value={frequency}>
				<option value="monthly">Monthly</option>
				<option value="every_n_weeks">Every N weeks</option>
				<option value="yearly">Yearly</option>
				<option value="once">One time</option>
			</select>
		</div>

		{#if frequency === 'monthly'}
			<div>
				<label class="label" for={id('day')}>Day of month</label>
				<input
					class="input"
					id={id('day')}
					name="dayOfMonth"
					type="number"
					min="1"
					max="31"
					required
					value={initial?.dayOfMonth ?? ''}
				/>
			</div>
		{:else if frequency === 'yearly'}
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label class="label" for={id('month')}>Month</label>
					<select
						class="input"
						id={id('month')}
						name="monthOfYear"
						value={initial?.monthOfYear ?? 1}
					>
						{#each months as m (m)}<option value={m}>{monthName(m)}</option>{/each}
					</select>
				</div>
				<div>
					<label class="label" for={id('day')}>Day of month</label>
					<input
						class="input"
						id={id('day')}
						name="dayOfMonth"
						type="number"
						min="1"
						max="31"
						required
						value={initial?.dayOfMonth ?? ''}
					/>
				</div>
			</div>
		{:else if frequency === 'every_n_weeks'}
			<div>
				<label class="label" for={id('weeks')}>Every how many weeks</label>
				<input
					class="input"
					id={id('weeks')}
					name="intervalWeeks"
					type="number"
					min="1"
					max="52"
					required
					value={initial?.intervalWeeks ?? 2}
				/>
			</div>
		{:else}
			<div class="hidden @lg:block"></div>
		{/if}

		<div>
			<label class="label" for={id('start')}>
				{frequency === 'once' ? 'Due date' : 'First due date'}
			</label>
			<input
				class="input"
				id={id('start')}
				name="startDate"
				type="date"
				required
				value={initial?.startDate ?? today()}
			/>
			{#if frequency === 'every_n_weeks'}
				<p class="mt-1 text-xs text-muted">Later due dates follow from this one.</p>
			{:else if frequency !== 'once'}
				<p class="mt-1 text-xs text-muted">No due dates before this one.</p>
			{/if}
		</div>
		{#if frequency !== 'once'}
			<div>
				<label class="label" for={id('end')}>Last due date (optional)</label>
				<input
					class="input"
					id={id('end')}
					name="endedAt"
					type="date"
					value={initial?.endedAt ?? ''}
				/>
			</div>
		{/if}

		<div>
			<label class="label" for={id('account')}>Paid from</label>
			<select class="input" id={id('account')} name="accountId" bind:value={accountId} required>
				{#each accounts as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
			</select>
		</div>
		<div>
			<label class="label" for={id('category')}>Category</label>
			<CategorySelect {groups} id={id('category')} name="categoryId" bind:value={categoryId} />
		</div>
		<div class="@lg:col-span-2">
			<label class="label" for={id('payto')}>Pays off</label>
			<select class="input" id={id('payto')} name="payToAccountId" bind:value={payToAccountId}>
				<option value="">— none —</option>
				{#each debtAccounts as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
			</select>
			<p class="mt-1 text-xs text-muted">Pick a card or loan if this bill is a payment toward it</p>
		</div>

		<div class="@lg:col-span-2 @lg:text-right">
			<button class="btn w-full @lg:w-auto">{submitLabel}</button>
		</div>
	</div>
</form>
