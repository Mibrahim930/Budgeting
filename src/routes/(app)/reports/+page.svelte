<script lang="ts">
	import IncomeSpendingChart from '$lib/components/IncomeSpendingChart.svelte';
	import Money from '$lib/components/Money.svelte';
	import { formatMoney } from '$lib/money';
	import { monthLabel } from '$lib/month';
	import { dateLabel } from '$lib/planner/describe';

	let { data } = $props();
	const total = $derived(data.spending.reduce((s, c) => s + c.spent, 0));
	const maxSpent = $derived(Math.max(1, ...data.spending.map((c) => c.spent)));
	let showTable = $state(false);

	/** The four kinds of line, in bar order, with their colours. */
	const KINDS = [
		{ key: 'savings', label: 'Savings', color: '#2a78d6' },
		{ key: 'debt', label: 'Debt', color: '#eb6834' },
		{ key: 'bills', label: 'Bills', color: '#1baf7a' },
		{ key: 'spending', label: 'Spending', color: '#eda100' }
	] as const;
</script>

<h1 class="mb-4 text-xl font-semibold">Reports</h1>

<section class="card mb-4">
	<div class="mb-3 flex items-center justify-between">
		<h2 class="font-medium">Income vs spending, last 12 months</h2>
		<button class="text-sm text-teal-700 hover:underline" onclick={() => (showTable = !showTable)}>
			{showTable ? 'Show chart' : 'Show table'}
		</button>
	</div>
	{#if showTable}
		<table class="w-full text-sm">
			<thead class="text-left text-slate-500">
				<tr
					><th class="py-1">Month</th><th class="text-right">Income</th><th class="text-right"
						>Spending</th
					><th class="text-right">Net</th></tr
				>
			</thead>
			<tbody>
				{#each data.trend as r (r.month)}
					<tr class="border-t border-slate-100">
						<td class="py-1">{monthLabel(r.month)}</td>
						<td class="text-right"><Money cents={r.income} /></td>
						<td class="text-right"><Money cents={r.spending} /></td>
						<td class="text-right"><Money cents={r.income - r.spending} /></td>
					</tr>
				{/each}
			</tbody>
		</table>
	{:else}
		<IncomeSpendingChart data={data.trend} />
	{/if}
</section>

<section class="card">
	<form method="GET" class="mb-3 flex flex-wrap items-end gap-2">
		<h2 class="mr-auto font-medium">Spending by category</h2>
		<input
			class="input w-auto"
			type="month"
			name="month"
			value={data.month}
			aria-label="Ending month"
		/>
		<select class="input w-auto" name="span" value={String(data.span)} aria-label="Period">
			<option value="1">1 month</option>
			<option value="3">3 months</option>
			<option value="6">6 months</option>
			<option value="12">12 months</option>
		</select>
		<button class="btn-secondary">Show</button>
	</form>
	<p class="mb-3 text-sm text-slate-600">
		{data.span === 1
			? monthLabel(data.month)
			: `${monthLabel(data.from)} – ${monthLabel(data.month)}`}:
		<b><Money cents={total} /></b> spent
	</p>
	<ul class="space-y-2">
		{#each data.spending as c (c.categoryId)}
			<li>
				<a
					href="/transactions?category={c.categoryId}{data.span === 1
						? `&month=${data.month}`
						: ''}"
					class="group block"
				>
					<div class="flex justify-between text-sm">
						<span class="group-hover:underline"
							>{c.name} <span class="text-xs text-slate-400">{c.groupName}</span></span
						>
						<span class="tabular-nums text-slate-700"
							><Money cents={c.spent} />
							<span class="text-xs text-slate-400">{Math.round((c.spent / total) * 100)}%</span
							></span
						>
					</div>
					<div class="mt-1 h-2 rounded-r bg-slate-100">
						<div
							class="h-2 rounded-r"
							style="width: {(c.spent / maxSpent) * 100}%; background: #2a78d6"
						></div>
					</div>
				</a>
			</li>
		{:else}
			<li class="text-sm text-slate-500">No spending in this period.</li>
		{/each}
	</ul>
</section>

<section class="card mt-4" aria-labelledby="paycheck-breakdown">
	<h2 id="paycheck-breakdown" class="mb-1 font-medium">Where each paycheck went</h2>
	<p class="mb-3 text-xs text-slate-500">
		Planned amounts per paycheck; the ✓ line underneath is what has been ticked off so far.
	</p>
	{#if data.paychecks.length === 0}
		<p class="text-sm text-slate-500">No paychecks yet.</p>
	{:else}
		<div class="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600" aria-hidden="true">
			{#each KINDS as k (k.key)}
				<span class="flex items-center gap-1.5"
					><span class="h-2.5 w-2.5 rounded-sm" style="background:{k.color}"></span>{k.label}</span
				>
			{/each}
			<span class="flex items-center gap-1.5"
				><span class="h-2.5 w-2.5 rounded-sm bg-slate-200"></span>Unallocated</span
			>
		</div>
		<div class="overflow-x-auto">
			<table class="w-full text-sm" aria-labelledby="paycheck-breakdown">
				<thead class="text-right text-xs text-slate-500">
					<tr>
						<th class="hidden py-1 text-left font-normal sm:table-cell">Paycheck</th>
						<th class="hidden pl-2 font-normal sm:table-cell">Pay</th>
						{#each KINDS as k (k.key)}
							<th class="pl-2 font-normal">{k.label}</th>
						{/each}
						<th class="hidden pl-2 font-normal sm:table-cell">Unallocated</th>
					</tr>
				</thead>
				{#each data.paychecks as p (p.id)}
					{@const scale = Math.max(
						p.amountMinor,
						KINDS.reduce((s, k) => s + p.planned[k.key], 0)
					)}
					<tbody class="border-t border-slate-100">
						<!-- Phones: date, pay and unallocated get their own line so the money columns fit. -->
						<tr class="sm:hidden">
							<td colspan={KINDS.length} class="pt-2">
								<span class="flex items-baseline justify-between gap-2">
									<a class="font-medium hover:underline" href="/paychecks/{p.id}"
										>{dateLabel(p.date)}</a
									>
									<span class="text-right">
										<Money cents={p.amountMinor} />
										<span
											class="block text-xs {p.unallocated < 0 ? 'text-red-600' : 'text-slate-500'}"
										>
											{formatMoney(p.unallocated)} unallocated
										</span>
									</span>
								</span>
							</td>
						</tr>
						<tr class="align-top">
							<td class="hidden pt-2 whitespace-nowrap sm:table-cell">
								<a class="hover:underline" href="/paychecks/{p.id}">{dateLabel(p.date)}</a>
							</td>
							<td class="hidden pt-2 pl-2 text-right sm:table-cell">
								<Money cents={p.amountMinor} />
							</td>
							{#each KINDS as k (k.key)}
								<td class="pt-1 pl-2 text-right whitespace-nowrap sm:pt-2">
									{#if p.planned[k.key] || p.actual[k.key]}
										<Money cents={p.planned[k.key]} />
										<span class="block text-xs text-slate-400 tabular-nums"
											><span class="sr-only">done: </span>✓ {formatMoney(p.actual[k.key])}</span
										>
									{:else}
										<span class="text-slate-300">—</span>
									{/if}
								</td>
							{/each}
							<td
								class="hidden pt-2 pl-2 text-right whitespace-nowrap sm:table-cell {p.unallocated <
								0
									? 'text-red-600'
									: ''}"
							>
								<Money cents={p.unallocated} />
							</td>
						</tr>
						<tr>
							<td colspan={KINDS.length + 3} class="pt-1 pb-2">
								<div
									class="flex h-2 overflow-hidden rounded bg-slate-200"
									style="gap: 2px"
									role="img"
									aria-label="{dateLabel(p.date)}: {KINDS.map(
										(k) => `${k.label} ${formatMoney(p.planned[k.key])}`
									).join(', ')}, unallocated {formatMoney(p.unallocated)}"
								>
									{#each KINDS as k (k.key)}
										{#if p.planned[k.key] > 0}
											<div
												class="h-2 shrink-0"
												style="width: {(p.planned[k.key] / scale) * 100}%; background: {k.color}"
											></div>
										{/if}
									{/each}
								</div>
							</td>
						</tr>
					</tbody>
				{/each}
			</table>
		</div>
	{/if}
</section>
