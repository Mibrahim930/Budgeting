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

<section class="card" aria-labelledby="projected-{uid}">
	<h2 id="projected-{uid}" class="font-medium">Projected balances</h2>
	<p class="mb-2 text-xs text-muted">Once everything still planned is done.</p>
	<table class="w-full text-sm">
		<thead>
			<tr class="text-left text-xs text-muted">
				<th class="py-1 font-normal">Account</th>
				<th class="py-1 text-right font-normal">Now</th>
				<th class="py-1 text-right font-normal">After</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-hairline">
			{#each projected as a (a.accountId)}
				<tr>
					<th scope="row" class="py-2 pr-2 text-left font-medium break-words">{a.name}</th>
					<td class="py-2 pl-2 text-right whitespace-nowrap text-muted">
						<Money cents={a.before} />
					</td>
					<td
						class="py-2 pl-2 text-right font-medium whitespace-nowrap"
						data-testid="projected-{a.accountId}"
					>
						<Money cents={a.after} colored />
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
	{#if spendingMoneyMinor > 0}
		<p class="mt-2 border-t border-hairline pt-2 text-sm">
			Spending money until next payday: <b class="tabular-nums">{formatMoney(spendingMoneyMinor)}</b
			>
			<span class="block text-xs text-muted">Stays in {depositAccountName} until you spend it.</span
			>
		</p>
	{/if}
</section>
