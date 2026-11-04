<script lang="ts">
	import AddLinePicker from '$lib/components/AddLinePicker.svelte';
	import Money from '$lib/components/Money.svelte';
	import PaycheckList from '$lib/components/PaycheckList.svelte';
	import PaycheckPlan from '$lib/components/PaycheckPlan.svelte';
	import ProjectedBalances from '$lib/components/ProjectedBalances.svelte';
	import UpcomingBills from '$lib/components/UpcomingBills.svelte';
	import { dayLabel } from '$lib/planner/describe';

	let { data, form } = $props();

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
</script>

<div data-testid="home">
	<div class="mb-4 flex items-center justify-between gap-2">
		<h1 class="display">Paychecks</h1>
	</div>

	{#if data.uncategorized.count}
		<a
			href="/transactions?uncategorized=1"
			class="mb-4 block rounded-control bg-warning-tint px-3 py-2 text-sm text-warning-ink hover:opacity-90"
		>
			{data.uncategorized.count} transaction{data.uncategorized.count === 1 ? '' : 's'} need a category
			→
		</a>
	{/if}

	{#if !data.schedule}
		<section class="card mb-4 border-accent-tint bg-tonal">
			<h2 class="mb-1 font-medium">Set up your pay schedule</h2>
			<p class="mb-3 text-sm text-muted">
				Tell us how often you're paid so we can predict your next payday and the bills due before
				it.
			</p>
			<a class="btn" href="/settings/pay">Set up pay schedule</a>
		</section>
	{/if}

	{#if form?.error}<p class="error mb-4" role="alert">{form.error}</p>{/if}

	<div class="grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
		<div class="min-w-0 space-y-4">
			{#if data.home}
				{@const p = data.home}
				<PaycheckPlan paycheck={p} today={data.today} home />
				<AddLinePicker
					paycheckId={p.id}
					depositAccountId={p.accountId}
					accounts={data.lineAccounts}
					groups={data.groups}
					billsDue={p.billsDue}
				/>
			{:else}
				<section class="card text-center">
					<h2 class="mb-1 font-medium">No paycheck planned yet</h2>
					<p class="mb-3 text-sm text-muted">
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
		</div>

		<div class="min-w-0 space-y-4">
			{#if data.home}
				<ProjectedBalances
					projected={data.home.projected}
					depositAccountName={data.home.accountName}
					spendingMoneyMinor={data.home.spendingMoneyMinor}
				/>
				<UpcomingBills
					bills={data.home.billsDue}
					paycheckId={data.home.id}
					until={data.home.windowEnd}
				/>
			{:else if data.upcoming.length}
				<UpcomingBills bills={data.upcoming} until={data.upcomingEnd} />
			{/if}

			<section class="card" aria-labelledby="accounts-heading">
				<div class="mb-2 flex items-baseline justify-between gap-2">
					<h2 id="accounts-heading" class="font-medium">Accounts</h2>
					<a class="text-sm link" href="/accounts">All accounts</a>
				</div>
				<ul class="divide-y divide-hairline text-sm" data-testid="accounts-snapshot">
					{#each accounts as a (a.id)}
						<li class="flex items-center justify-between gap-2 py-2">
							<a href="/accounts/{a.id}" class="min-w-0 hover:underline">
								<span class="font-medium">{a.name}</span>
								<span class="ml-1 text-xs text-muted">{typeLabel[a.type] ?? a.type}</span>
							</a>
							<Money cents={a.balanceMinor} colored />
						</li>
					{:else}
						<li class="py-2 text-muted">No accounts yet.</li>
					{/each}
				</ul>
				<p class="mt-2 flex justify-between border-t border-hairline pt-2 text-sm">
					<span class="text-muted">Net worth</span>
					<span class="font-medium"><Money cents={netWorth} colored /></span>
				</p>
			</section>

			{#if data.paychecks.length}
				<PaycheckList paychecks={data.paychecks} currentId={data.home?.id} />
			{/if}
		</div>
	</div>
</div>
