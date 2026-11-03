<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import Money from '$lib/components/Money.svelte';
	import { isDate } from '$lib/month';
	import { dayLabel } from '$lib/planner/describe';

	let { data, form } = $props();

	// Seeded once from the load; refreshing the bills keeps what has been typed.
	function seed() {
		return { ...data };
	}
	const start = seed();
	let date = $state(start.date);
	let nextDate = $state(start.next);
	let amount = $state(start.amount);
	let accountId = $state(start.accountId);
	let incomeCategoryId = $state(start.incomeCategoryId);
	let note = $state(start.note);
	let refreshing = $state(false);

	/** Re-load the bills for a new window. Changing the pay date lets the schedule pick the next payday. */
	async function refresh(changed: 'date' | 'next') {
		if (!isDate(date) || (changed === 'next' && !isDate(nextDate))) return;
		const params = new URLSearchParams({
			date,
			amount,
			accountId,
			...(changed === 'next' ? { next: nextDate } : {})
		});
		refreshing = true;
		await goto(`?${params}`, { keepFocus: true, noScroll: true, replaceState: true });
		refreshing = false;
		nextDate = data.next;
	}

	const key = (b: { billId: string; dueDate: string }) => `${b.billId}|${b.dueDate}`;
</script>

<a href="/" class="text-sm text-teal-700 hover:underline">← Paychecks</a>
<h1 class="mt-1 mb-4 text-xl font-semibold">New paycheck</h1>

<form
	method="POST"
	action="?/create"
	class="mx-auto grid max-w-xl gap-4"
	use:enhance={() =>
		async ({ update }) =>
			update({ reset: false })}
>
	{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}

	<section class="card grid gap-3 sm:grid-cols-2">
		<div>
			<label class="label" for="pc-date">Pay date</label>
			<input
				class="input"
				id="pc-date"
				type="date"
				name="date"
				required
				bind:value={date}
				onchange={() => refresh('date')}
			/>
		</div>
		<div>
			<label class="label" for="pc-amount">Amount</label>
			<input
				class="input"
				id="pc-amount"
				name="amount"
				inputmode="decimal"
				placeholder="0.00"
				required
				bind:value={amount}
			/>
		</div>
		<div>
			<label class="label" for="pc-next">Next payday</label>
			<input
				class="input"
				id="pc-next"
				type="date"
				name="nextDate"
				bind:value={nextDate}
				onchange={() => refresh('next')}
			/>
		</div>
		<div>
			<label class="label" for="pc-account">Paid into</label>
			<select class="input" id="pc-account" name="accountId" bind:value={accountId}>
				{#each data.depositAccounts as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
			</select>
		</div>
		{#if data.incomeCategories.length > 1}
			<div>
				<label class="label" for="pc-category">Income category</label>
				<select
					class="input"
					id="pc-category"
					name="incomeCategoryId"
					bind:value={incomeCategoryId}
				>
					{#each data.incomeCategories as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
				</select>
			</div>
		{:else}
			<input type="hidden" name="incomeCategoryId" value={incomeCategoryId} />
		{/if}
		<div class={data.incomeCategories.length > 1 ? '' : 'sm:col-span-2'}>
			<label class="label" for="pc-note"
				>Note <span class="font-normal text-slate-500">(optional)</span></label
			>
			<input class="input" id="pc-note" name="note" bind:value={note} />
		</div>
	</section>

	<section class="card" aria-labelledby="pc-bills">
		<div class="mb-1 flex flex-wrap items-baseline justify-between gap-2">
			<h2 id="pc-bills" class="font-medium">Bills in this window</h2>
			<button
				class="btn-secondary px-2 py-1 text-xs"
				formmethod="GET"
				formaction="/paychecks/new"
				formnovalidate
				disabled={refreshing}>Refresh bills</button
			>
		</div>
		<p class="mb-2 text-xs text-slate-500">
			Due from {isDate(date) ? dayLabel(date) : '…'} until before {isDate(nextDate)
				? dayLabel(nextDate)
				: '…'}. Ticked bills are added to the plan.
		</p>
		<ul class="divide-y divide-slate-100 text-sm">
			{#each data.billsDue as b (key(b))}
				{@const boxId = `pc-bill-${key(b)}`}
				<li class="flex items-center gap-3 py-2">
					<input
						id={boxId}
						type="checkbox"
						class="h-5 w-5 accent-teal-700"
						name="bills"
						value={key(b)}
						checked={!b.plannedLineId}
						disabled={!!b.plannedLineId}
					/>
					<label for={boxId} class="min-w-0 grow">
						<span class="block font-medium">{b.name} · due {dayLabel(b.dueDate)}</span>
						<span class="block truncate text-xs text-slate-500">
							{b.plannedPaycheckId
								? 'Already in another plan'
								: `from ${b.accountName}`}{b.categoryName ? ` · ${b.categoryName}` : ''}
						</span>
					</label>
					<span class="shrink-0"><Money cents={b.amountMinor} /></span>
				</li>
			{:else}
				<li class="py-2 text-slate-500">No bills are due in this window.</li>
			{/each}
		</ul>
	</section>

	<div class="flex justify-end gap-2">
		<a class="btn-secondary" href="/">Cancel</a>
		<button class="btn">Create plan</button>
	</div>
</form>
