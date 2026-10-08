<script lang="ts">
	import { enhance } from '$app/forms';
	import Money from '$lib/components/Money.svelte';
	import { centsToInput } from '$lib/money';
	import { monthLabel } from '$lib/month';

	let { data, form } = $props();
	const b = $derived(data.budget);
	const envelope = $derived(b.mode === 'envelope');
	const expenseGroups = $derived(b.groups.filter((g) => !g.isIncome));
	const incomeGroups = $derived(b.groups.filter((g) => g.isIncome));

	function pill(cents: number) {
		if (cents < 0) return 'bg-red-100 text-red-700';
		if (cents > 0) return 'bg-emerald-100 text-emerald-800';
		return 'bg-slate-100 text-slate-500';
	}
	const pct = (spent: number, limit: number) =>
		limit <= 0 ? (spent > 0 ? 100 : 0) : Math.min(100, Math.round((spent / limit) * 100));
</script>

<div class="mb-4 flex items-center justify-between gap-2">
	<a class="btn-secondary" href="/budget/{data.prev}" aria-label="Previous month">‹</a>
	<h1 class="text-center text-xl font-semibold">{monthLabel(b.month)}</h1>
	<a class="btn-secondary" href="/budget/{data.next}" aria-label="Next month">›</a>
</div>

{#if envelope}
	<section
		class="card mb-4 text-center {b.toBudget < 0
			? 'border-red-200 bg-red-50'
			: b.toBudget > 0
				? 'border-emerald-200 bg-emerald-50'
				: ''}"
	>
		<p class="text-sm text-slate-600">To budget</p>
		<p class="text-3xl font-semibold" data-testid="to-budget"><Money cents={b.toBudget} /></p>
		<p class="mt-1 text-xs text-slate-500">
			{#if b.toBudget < 0}You've assigned more than you have. Take money back from a category.
			{:else if b.toBudget > 0}Give these dollars a job below.
			{:else}Every dollar has a job.{/if}
		</p>
		<dl
			class="mx-auto mt-3 grid max-w-md grid-cols-2 gap-x-4 gap-y-1 text-left text-xs text-slate-600"
		>
			<dt>From last month</dt>
			<dd class="text-right"><Money cents={b.toBudgetCarryIn} /></dd>
			<dt>Income this month</dt>
			<dd class="text-right"><Money cents={b.income} /></dd>
			<dt>Overspent last month</dt>
			<dd class="text-right"><Money cents={b.overspentLastMonth} /></dd>
			<dt>Budgeted this month</dt>
			<dd class="text-right"><Money cents={-b.totalBudgeted} /></dd>
		</dl>
	</section>
{:else}
	<section class="card mb-4 grid grid-cols-2 gap-2 text-center text-sm sm:grid-cols-4">
		<div>
			<p class="text-slate-500">Income</p>
			<p class="font-semibold"><Money cents={b.income} /></p>
		</div>
		<div>
			<p class="text-slate-500">Limits</p>
			<p class="font-semibold"><Money cents={b.totalBudgeted} /></p>
		</div>
		<div>
			<p class="text-slate-500">Spent</p>
			<p class="font-semibold"><Money cents={-b.totalActivity} /></p>
		</div>
		<div>
			<p class="text-slate-500">Left</p>
			<p class="font-semibold"><Money cents={b.totalAvailable} colored /></p>
		</div>
	</section>
{/if}

{#if data.uncategorized.count}
	<a
		href="/transactions?uncategorized=1"
		class="mb-4 block rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 hover:bg-amber-100"
	>
		{data.uncategorized.count} transaction{data.uncategorized.count === 1 ? '' : 's'} need a category
		→
	</a>
{/if}
{#if form?.error}<p class="error mb-3">{form.error}</p>{/if}

<div class="mb-2 flex justify-end gap-2 text-sm">
	<form method="POST" action="?/copyLastMonth" use:enhance>
		<button class="btn-secondary">Copy last month</button>
	</form>
	<a class="btn-secondary" href="/categories">Edit categories</a>
</div>

<div class="overflow-hidden rounded-lg border border-slate-200 bg-white">
	<div
		class="grid grid-cols-12 gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500"
	>
		<span class="col-span-5 sm:col-span-6">Category</span>
		<span class="col-span-3 text-right sm:col-span-2">{envelope ? 'Budgeted' : 'Limit'}</span>
		<span class="hidden text-right sm:col-span-2 sm:block">{envelope ? 'Activity' : 'Spent'}</span>
		<span class="col-span-4 text-right sm:col-span-2">{envelope ? 'Available' : 'Left'}</span>
	</div>
	{#each expenseGroups as g (g.id)}
		<div class="grid grid-cols-12 gap-2 bg-slate-50/60 px-3 py-1.5 text-sm font-semibold">
			<span class="col-span-5 sm:col-span-6">{g.name}</span>
			<span class="col-span-3 text-right sm:col-span-2"><Money cents={g.budgeted} /></span>
			<span class="hidden text-right sm:col-span-2 sm:block"
				><Money cents={envelope ? g.activity : -g.activity} /></span
			>
			<span class="col-span-4 text-right sm:col-span-2"><Money cents={g.available} /></span>
		</div>
		{#each g.categories as c (c.id)}
			<div
				class="grid grid-cols-12 items-center gap-2 border-t border-slate-100 px-3 py-1.5 text-sm"
			>
				<a
					class="col-span-5 truncate pl-2 hover:underline sm:col-span-6"
					href="/transactions?category={c.id}&month={b.month}"
				>
					{c.name}
					{#if !envelope && c.budgeted > 0}
						<span class="mt-1 block h-1 overflow-hidden rounded bg-slate-100">
							<span
								class="block h-full {c.available < 0 ? 'bg-red-500' : 'bg-teal-600'}"
								style="width: {pct(-c.activity, c.budgeted)}%"
							></span>
						</span>
					{/if}
				</a>
				<form
					method="POST"
					action="?/setBudget"
					use:enhance={() =>
						async ({ update }) =>
							update({ reset: false })}
					class="col-span-3 sm:col-span-2"
				>
					<input type="hidden" name="categoryId" value={c.id} />
					<input
						class="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-right tabular-nums hover:border-slate-300 focus:border-teal-600 focus:bg-white focus:outline-none"
						name="amount"
						inputmode="decimal"
						aria-label="{envelope ? 'Budgeted' : 'Limit'} for {c.name}"
						value={c.budgeted ? centsToInput(c.budgeted) : ''}
						placeholder="0.00"
						onchange={(e) => e.currentTarget.form?.requestSubmit()}
					/>
				</form>
				<span class="hidden text-right text-slate-600 sm:col-span-2 sm:block"
					><Money cents={envelope ? c.activity : -c.activity} /></span
				>
				<span class="col-span-4 text-right sm:col-span-2">
					<span
						class="inline-block rounded-full px-2 py-0.5 text-xs font-medium tabular-nums {pill(
							c.available
						)}"
					>
						<Money cents={c.available} />
					</span>
				</span>
			</div>
		{/each}
	{/each}
</div>

{#each incomeGroups as g (g.id)}
	<h2 class="mt-6 mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">{g.name}</h2>
	<ul class="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm">
		{#each g.categories as c (c.id)}
			<li class="flex justify-between px-3 py-2">
				<a class="hover:underline" href="/transactions?category={c.id}&month={b.month}">{c.name}</a>
				<span>Received <Money cents={c.activity} /></span>
			</li>
		{/each}
	</ul>
{/each}
