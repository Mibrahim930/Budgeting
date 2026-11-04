<script lang="ts">
	import { formatMoney } from '$lib/money';
	import type { ProjectedBalance } from '$lib/server/repo/paychecks';
	import Money from './Money.svelte';

	let {
		projected,
		depositAccountName,
		spendingMoneyMinor
	}: {
		/** Deposit account first, then accounts the plan touches, then the rest (server order). */
		projected: ProjectedBalance[];
		depositAccountName: string;
		spendingMoneyMinor: number;
	} = $props();

	const uid = $props.id();
</script>

<section class="panel" aria-labelledby="projected-{uid}">
	<h2 id="projected-{uid}" class="text-sm font-extrabold">After this plan</h2>
	<p class="mb-2 text-[11px] text-muted">Once everything still planned is done.</p>
	<table class="w-full text-[13px]">
		<thead>
			<tr class="text-left text-[11px] text-muted">
				<th class="py-1 font-bold">Account</th>
				<th class="py-1 text-right font-bold">Now</th>
				<th class="py-1 text-right font-bold">After</th>
			</tr>
		</thead>
		<tbody>
			{#each projected as a (a.accountId)}
				<tr>
					<th scope="row" class="py-1.5 pr-2 text-left font-semibold break-words">{a.name}</th>
					<td class="py-1.5 pl-2 text-right whitespace-nowrap text-muted">
						<Money cents={a.before} />
					</td>
					<td
						class="py-1.5 pl-2 text-right font-extrabold whitespace-nowrap"
						data-testid="projected-{a.accountId}"
					>
						<Money cents={a.after} colored />
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
	{#if spendingMoneyMinor > 0}
		<p class="mt-3 border-t border-accent-tint pt-3 text-[13px]">
			Spending money until next payday: <b class="font-extrabold tabular-nums"
				>{formatMoney(spendingMoneyMinor)}</b
			>
			<span class="block text-[11px] text-muted"
				>Stays in {depositAccountName} until you spend it.</span
			>
		</p>
	{/if}
</section>
