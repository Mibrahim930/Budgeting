<script lang="ts">
	import { enhance } from '$app/forms';
	import { dayLabel } from '$lib/planner/describe';
	import type { BillOccurrence } from '$lib/server/repo/bills';
	import Money from './Money.svelte';

	let {
		bills,
		paycheckId = null,
		until
	}: {
		bills: BillOccurrence[];
		/** The plan the "Add" buttons add to; without one, bills are only listed. */
		paycheckId?: string | null;
		/** Exclusive end of the window ("before Fri, Jan 17"). */
		until: string;
	} = $props();

	const uid = $props.id();
</script>

<section class="card" aria-labelledby="upcoming-{uid}">
	<div class="mb-2 flex items-baseline justify-between gap-2">
		<h2 id="upcoming-{uid}" class="text-sm font-extrabold">Bills before {dayLabel(until)}</h2>
		<a class="link text-xs" href="/bills">All bills</a>
	</div>
	<ul class="divide-y divide-hairline text-sm" aria-label="Upcoming bills">
		{#each bills as b (`${b.billId}|${b.dueDate}`)}
			<li class="flex items-center gap-2 py-2.5">
				<div class="min-w-0 grow">
					<span class="block truncate font-bold">{b.name}</span>
					<span class="block truncate text-[11px] text-muted">
						due {dayLabel(b.dueDate)} · {b.accountName}
					</span>
				</div>
				<span class="shrink-0 font-bold"><Money cents={b.amountMinor} /></span>
				<span class="w-20 shrink-0 text-right">
					{#if b.plannedPaycheckId && b.plannedPaycheckId === paycheckId}
						<span class="text-xs font-bold text-good">In plan ✓</span>
					{:else if b.plannedPaycheckId}
						<a class="link text-xs" href="/paychecks/{b.plannedPaycheckId}">Other plan</a>
					{:else if paycheckId}
						<form
							method="POST"
							action="?/addLine"
							use:enhance={() =>
								async ({ update }) =>
									update({ reset: false })}
						>
							<input type="hidden" name="paycheckId" value={paycheckId} />
							<input type="hidden" name="kind" value="bill" />
							<input type="hidden" name="billId" value={b.billId} />
							<input type="hidden" name="dueDate" value={b.dueDate} />
							<button class="btn-secondary btn-sm" aria-label="Add {b.name} to plan">Add</button>
						</form>
					{/if}
				</span>
			</li>
		{:else}
			<li class="py-2 text-muted">No bills due.</li>
		{/each}
	</ul>
</section>
