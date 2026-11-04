<script lang="ts">
	import { formatMoney } from '$lib/money';
	import { dayLabel } from '$lib/planner/describe';
	import type { PaycheckSummary } from '$lib/server/repo/paychecks';
	import Money from './Money.svelte';
	import StatusPill from './StatusPill.svelte';

	let { paychecks, currentId = null }: { paychecks: PaycheckSummary[]; currentId?: string | null } =
		$props();

	const uid = $props.id();
	const year = (d: string) => d.slice(0, 4);
</script>

<section class="card" aria-labelledby="paychecks-{uid}">
	<div class="mb-2 flex items-baseline justify-between gap-2">
		<h2 id="paychecks-{uid}" class="text-sm font-extrabold">All paychecks</h2>
		<a class="btn-secondary btn-sm" href="/paychecks/new">New paycheck</a>
	</div>
	<ul class="divide-y divide-hairline text-sm" aria-label="All paychecks">
		{#each paychecks as p (p.id)}
			<li>
				<a
					href="/paychecks/{p.id}"
					class="-mx-2 flex items-center gap-2 rounded-control px-2 py-2.5 hover:bg-ground aria-[current]:bg-tonal"
					aria-current={p.id === currentId ? 'true' : undefined}
				>
					<span class="min-w-0 grow">
						<span class="block font-bold">{dayLabel(p.date)}, {year(p.date)}</span>
						{#if p.leftMinor !== 0}
							<span
								class="block text-[11px] font-semibold {p.leftMinor < 0
									? 'text-danger'
									: 'text-warning'}"
							>
								{p.leftMinor < 0
									? `Over by ${formatMoney(-p.leftMinor)}`
									: `${formatMoney(p.leftMinor)} left to allocate`}
							</span>
						{/if}
					</span>
					<StatusPill status={p.status} />
					<span class="w-24 shrink-0 text-right font-bold"><Money cents={p.amountMinor} /></span>
				</a>
			</li>
		{:else}
			<li class="py-2 text-muted">No paychecks yet.</li>
		{/each}
	</ul>
</section>
