<script lang="ts">
	import Money from '$lib/components/Money.svelte';

	let { data } = $props();

	const netWorth = $derived(data.accounts.reduce((s, a) => s + a.balanceMinor, 0));
	// Money you have first, then what you owe; the server's order within each type.
	const typeOrder = ['checking', 'savings', 'cash', 'investment', 'credit', 'loan'];
	const accounts = $derived(
		[...data.accounts].sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type))
	);
	const typeLabel: Record<string, string> = {
		checking: 'Checking',
		savings: 'Savings',
		credit: 'Credit card',
		cash: 'Cash',
		loan: 'Loan',
		investment: 'Investment'
	};

	/** "Fri, Jan 3" for a YYYY-MM-DD string, without local time-zone drift. */
	const dayLabel = (date: string) =>
		new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		});
</script>

<div data-testid="home">
	<div class="mb-4 flex items-center justify-between gap-2">
		<h1 class="text-xl font-semibold">Paychecks</h1>
		{#if data.home}<a class="btn" href="/paychecks/new">New paycheck</a>{/if}
	</div>

	{#if data.uncategorized.count}
		<a
			href="/transactions?uncategorized=1"
			class="mb-4 block rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 hover:bg-amber-100"
		>
			{data.uncategorized.count} transaction{data.uncategorized.count === 1 ? '' : 's'} need a category
			→
		</a>
	{/if}

	{#if !data.schedule}
		<section class="card mb-4 border-teal-200 bg-teal-50/40">
			<h2 class="mb-1 font-medium">Set up your pay schedule</h2>
			<p class="mb-3 text-sm text-slate-600">
				Tell us how often you're paid so we can predict your next payday and the bills due before
				it.
			</p>
			<a class="btn" href="/settings/pay">Set up pay schedule</a>
		</section>
	{/if}

	<div class="grid gap-4 md:grid-cols-2">
		{#if data.home}
			{@const p = data.home}
			<section class="card">
				<h2 class="font-medium">
					Paycheck · {dayLabel(p.date)} · <Money cents={p.amountMinor} />
				</h2>
				<p class="mt-3 text-sm text-slate-600">Left to allocate</p>
				<p
					class="text-2xl font-semibold {p.totals.left < 0
						? 'text-red-600'
						: p.totals.left > 0
							? 'text-amber-700'
							: 'text-emerald-700'}"
					data-testid="left-to-allocate"
				>
					<Money cents={p.totals.left} />
				</p>
				<a class="mt-3 inline-block text-sm text-teal-700 hover:underline" href="/paychecks/{p.id}"
					>Open plan →</a
				>
			</section>
		{:else}
			<section class="card text-center">
				<h2 class="mb-1 font-medium">No paycheck planned yet</h2>
				<p class="mb-3 text-sm text-slate-600">
					{#if data.suggestNext.amountMinor}
						Your next payday looks like {dayLabel(data.suggestNext.date)}. Plan where that money
						goes before it arrives.
					{:else}
						Plan where your next paycheck goes before it arrives.
					{/if}
				</p>
				<a class="btn" href="/paychecks/new">New paycheck</a>
			</section>
		{/if}

		<section class="card" aria-labelledby="accounts-heading">
			<div class="mb-2 flex items-baseline justify-between gap-2">
				<h2 id="accounts-heading" class="font-medium">Accounts</h2>
				<a class="text-sm text-teal-700 hover:underline" href="/accounts">All accounts</a>
			</div>
			<ul class="divide-y divide-slate-100 text-sm" data-testid="accounts-snapshot">
				{#each accounts as a (a.id)}
					<li class="flex items-center justify-between gap-2 py-2">
						<a href="/accounts/{a.id}" class="min-w-0 hover:underline">
							<span class="font-medium">{a.name}</span>
							<span class="ml-1 text-xs text-slate-500">{typeLabel[a.type] ?? a.type}</span>
						</a>
						<Money cents={a.balanceMinor} colored />
					</li>
				{:else}
					<li class="py-2 text-slate-500">No accounts yet.</li>
				{/each}
			</ul>
			<p class="mt-2 flex justify-between border-t border-slate-200 pt-2 text-sm">
				<span class="text-slate-600">Net worth</span>
				<span class="font-medium"><Money cents={netWorth} colored /></span>
			</p>
		</section>
	</div>
</div>
