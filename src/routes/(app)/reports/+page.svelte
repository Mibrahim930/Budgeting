<script lang="ts">
	import Donut from '$lib/components/Donut.svelte';
	import Ring from '$lib/components/Ring.svelte';
	import IncomeSpendingChart from '$lib/components/IncomeSpendingChart.svelte';
	import { KINDS } from '$lib/components/kinds';
	import Money from '$lib/components/Money.svelte';
	import { formatMoney } from '$lib/money';
	import { dayDiff, monthLabel } from '$lib/month';
	import { dateLabel, dayLabel } from '$lib/planner/describe';

	let { data } = $props();
	const total = $derived(data.spending.reduce((s, c) => s + c.spent, 0));
	const maxSpent = $derived(Math.max(1, ...data.spending.map((c) => c.spent)));
	let showTable = $state(false);

	/** The donut shows the current plan (the one on the home page), else the newest paycheck. */
	const latest = $derived(
		(data.current && data.paychecks.find((p) => p.id === data.current!.id)) ??
			data.paychecks[0] ??
			null
	);
	/** Categorized spending lines of the current plan, with what has been spent so far. */
	const spendingLines = $derived(
		(data.current?.lines ?? []).flatMap((l) =>
			l.kind === 'spending' && l.spentMinor !== null
				? [
						{
							id: l.id,
							label: l.label,
							amount: l.amountMinor,
							spent: l.spentMinor,
							pct: l.amountMinor > 0 ? Math.round((l.spentMinor / l.amountMinor) * 100) : 100
						}
					]
				: []
		)
	);
	const daysLeft = $derived(
		data.current ? Math.max(0, dayDiff(data.today, data.current.windowEnd)) : 0
	);
	const latestAllocated = $derived(
		latest ? KINDS.reduce((s, k) => s + latest.planned[k.key], 0) : 0
	);
	const allocatedText = $derived(formatMoney(latestAllocated));
</script>

<p class="eyebrow">Reports</p>
<h1 class="mb-4 display">Where it went</h1>

<div class="mb-4 grid gap-4 md:grid-cols-2">
	{#if latest}
		<section class="card-raised" aria-labelledby="latest-paycheck">
			<h2 id="latest-paycheck" class="mb-3 text-sm font-extrabold">
				{latest.id === data.current?.id ? 'This paycheck' : 'Latest paycheck'} ·
				<a class="link" href="/paychecks/{latest.id}">{dateLabel(latest.date)}</a>
			</h2>
			<div class="flex items-center gap-4 sm:gap-5">
				<Donut
					segments={KINDS.map((k) => ({ ...k, value: latest.planned[k.key] }))}
					total={latest.amountMinor}
					label="{dateLabel(latest.date)} paycheck by kind: {KINDS.map(
						(k) => `${k.label} ${formatMoney(latest.planned[k.key])}`
					).join(', ')}, unallocated {formatMoney(latest.unallocated)}"
				>
					<span
						class="block px-1 font-extrabold tabular-nums {allocatedText.length <= 8
							? 'text-[15px]'
							: allocatedText.length <= 10
								? 'text-[13px]'
								: 'text-[11px]'}">{allocatedText}</span
					>
					<span class="mt-1 block text-[10px] leading-tight text-muted"
						>of {formatMoney(latest.amountMinor)}<br />assigned</span
					>
				</Donut>
				<ul class="min-w-0 flex-1 space-y-2 text-xs">
					{#each KINDS as k (k.key)}
						<li class="flex items-center justify-between gap-2">
							<span class="flex items-center gap-1.5"
								><span class="h-2.5 w-2.5 shrink-0 rounded-[3px]" style:background={k.color}
								></span>{k.label}</span
							>
							<b class="font-extrabold"><Money cents={latest.planned[k.key]} /></b>
						</li>
					{/each}
					<li class="flex items-center justify-between gap-2 text-muted">
						<span class="flex items-center gap-1.5"
							><span class="h-2.5 w-2.5 shrink-0 rounded-[3px] bg-tonal"></span>Unallocated</span
						>
						<b class="font-extrabold {latest.unallocated < 0 ? 'text-danger' : ''}"
							><Money cents={latest.unallocated} /></b
						>
					</li>
				</ul>
			</div>
		</section>
	{:else}
		<section class="card-raised">
			<h2 class="mb-1 text-sm font-extrabold">Latest paycheck</h2>
			<p class="text-sm text-muted">
				No paychecks yet. <a class="link" href="/paychecks/new">Plan one</a> to see where it goes.
			</p>
		</section>
	{/if}
	{#if data.current && spendingLines.length}
		<section class="card" aria-labelledby="spending-money">
			<h2 id="spending-money" class="mb-3 text-sm font-extrabold">
				Spending money · {data.current.date > data.today
					? `starts ${dayLabel(data.current.date)}`
					: `${daysLeft} day${daysLeft === 1 ? '' : 's'} to go`}
			</h2>
			<ul class="grid grid-cols-2 gap-3">
				{#each spendingLines as l (l.id)}
					{@const over = l.spent > l.amount}
					<li class="flex min-w-0 items-center gap-2.5">
						<Ring
							value={l.pct}
							size={56}
							color={over ? 'var(--color-danger)' : 'var(--color-accent)'}
							label="{l.label} {l.pct}% used"
						/>
						<span class="min-w-0">
							<span class="block truncate text-[13px] font-extrabold">{l.label}</span>
							<span class="block text-[11px] {over ? 'font-bold text-danger' : 'text-muted'}"
								>{formatMoney(l.spent)} of {formatMoney(l.amount)}</span
							>
						</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

<section class="card mb-4">
	<div class="mb-3 flex items-center justify-between">
		<h2 class="text-sm font-extrabold">Income vs spending, last 12 months</h2>
		<button class="link text-xs" onclick={() => (showTable = !showTable)}>
			{showTable ? 'Show chart' : 'Show table'}
		</button>
	</div>
	{#if showTable}
		<table class="w-full text-sm">
			<thead class="text-left text-muted">
				<tr
					><th class="py-1">Month</th><th class="text-right">Income</th><th class="text-right"
						>Spending</th
					><th class="text-right">Net</th></tr
				>
			</thead>
			<tbody>
				{#each data.trend as r (r.month)}
					<tr class="border-t border-hairline">
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
	<form method="GET" class="mb-3 flex flex-wrap items-center gap-2">
		<h2 class="mr-auto text-sm font-extrabold">Spending by category</h2>
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
	<p class="mb-3 text-sm text-muted">
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
							>{c.name} <span class="text-xs text-muted">{c.groupName}</span></span
						>
						<span class="tabular-nums text-ink"
							><Money cents={c.spent} />
							<span class="text-xs text-muted">{Math.round((c.spent / total) * 100)}%</span></span
						>
					</div>
					<div class="mt-1 h-2 overflow-hidden rounded-full bg-tonal">
						<div
							class="h-2 rounded-full bg-accent"
							style:width="{(c.spent / maxSpent) * 100}%"
						></div>
					</div>
				</a>
			</li>
		{:else}
			<li class="text-sm text-muted">No spending in this period.</li>
		{/each}
	</ul>
</section>

<section class="card mt-4" aria-labelledby="paycheck-breakdown">
	<h2 id="paycheck-breakdown" class="mb-1 text-sm font-extrabold">Where each paycheck went</h2>
	<p class="mb-3 text-xs text-muted">
		Planned amounts per paycheck; the ✓ line underneath is what has been ticked off so far.
	</p>
	{#if data.paychecks.length === 0}
		<p class="text-sm text-muted">No paychecks yet.</p>
	{:else}
		<div class="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-hidden="true">
			{#each KINDS as k (k.key)}
				<span class="flex items-center gap-1.5"
					><span class="h-2.5 w-2.5 rounded-[3px]" style:background={k.color}></span>{k.label}</span
				>
			{/each}
			<span class="flex items-center gap-1.5"
				><span class="h-2.5 w-2.5 rounded-[3px] bg-tonal"></span>Unallocated</span
			>
		</div>
		<div class="overflow-x-auto">
			<table class="w-full text-sm" aria-labelledby="paycheck-breakdown">
				<thead class="text-right text-xs text-muted">
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
					<tbody class="border-t border-hairline">
						<!-- Phones: date, pay and unallocated get their own line so the money columns fit. -->
						<tr class="sm:hidden">
							<td colspan={KINDS.length} class="pt-2">
								<span class="flex items-baseline justify-between gap-2">
									<a class="font-medium hover:underline" href="/paychecks/{p.id}"
										>{dateLabel(p.date)}</a
									>
									<span class="text-right">
										<Money cents={p.amountMinor} />
										<span class="block text-xs {p.unallocated < 0 ? 'text-danger' : 'text-muted'}">
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
										<span class="block text-xs text-muted tabular-nums"
											><span class="sr-only">done: </span>✓ {formatMoney(p.actual[k.key])}</span
										>
									{:else}
										<span class="text-neutral">—</span>
									{/if}
								</td>
							{/each}
							<td
								class="hidden pt-2 pl-2 text-right whitespace-nowrap sm:table-cell {p.unallocated <
								0
									? 'text-danger'
									: ''}"
							>
								<Money cents={p.unallocated} />
							</td>
						</tr>
						<tr>
							<td colspan={KINDS.length + 3} class="pt-1 pb-2">
								<div
									class="flex h-2 overflow-hidden rounded-full bg-tonal"
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
												style:width="{(p.planned[k.key] / scale) * 100}%"
												style:background={k.color}
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
