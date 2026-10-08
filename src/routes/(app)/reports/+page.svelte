<script lang="ts">
	import IncomeSpendingChart from '$lib/components/IncomeSpendingChart.svelte';
	import Money from '$lib/components/Money.svelte';
	import { monthLabel } from '$lib/month';

	let { data } = $props();
	const total = $derived(data.spending.reduce((s, c) => s + c.spent, 0));
	const maxSpent = $derived(Math.max(1, ...data.spending.map((c) => c.spent)));
	let showTable = $state(false);
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
