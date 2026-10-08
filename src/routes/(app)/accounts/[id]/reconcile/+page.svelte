<script lang="ts">
	import { enhance } from '$app/forms';
	import Money from '$lib/components/Money.svelte';
	import TransactionList from '$lib/components/TransactionList.svelte';
	import { centsToInput, parseMoney } from '$lib/money';

	let { data, form } = $props();
	let typed = $state<string | null>(null);
	const defaultStatement = $derived(
		form?.statement ?? (data.bank ? centsToInput(data.bank.balanceMinor) : '')
	);
	const statement = $derived(typed ?? defaultStatement);
	const statementCents = $derived(parseMoney(statement));
	const difference = $derived(
		statementCents === null ? null : statementCents - data.account.clearedMinor
	);
</script>

<a href="/accounts/{data.account.id}" class="text-sm text-slate-500 hover:underline"
	>← {data.account.name}</a
>
<h1 class="mb-1 text-xl font-semibold">Reconcile</h1>
<p class="mb-4 text-sm text-slate-600">
	Compare with your bank statement. Mark the transactions that appear on it as cleared until the
	difference is zero, then lock them in.
</p>

<form method="POST" action="?/finish" use:enhance class="card mb-4 space-y-3">
	{#if form?.error}<p class="error">{form.error}</p>{/if}
	<div class="grid gap-3 sm:grid-cols-3">
		<div>
			<label class="label" for="statement">Statement balance</label>
			<input
				class="input tabular-nums"
				id="statement"
				name="statement"
				inputmode="decimal"
				value={statement}
				oninput={(e) => (typed = e.currentTarget.value)}
			/>
			{#if data.bank}
				<p class="mt-1 text-xs text-slate-500">
					Bank reported <Money cents={data.bank.balanceMinor} /> on {new Date(
						data.bank.asOf
					).toLocaleDateString()}
				</p>
			{/if}
		</div>
		<div>
			<p class="label">Cleared in app</p>
			<p class="py-2 tabular-nums"><Money cents={data.account.clearedMinor} /></p>
		</div>
		<div>
			<p class="label">Difference</p>
			<p
				class="py-2 font-semibold tabular-nums {difference === 0
					? 'text-emerald-700'
					: 'text-red-600'}"
			>
				{#if difference === null}—{:else}<Money cents={difference} />{/if}
			</p>
		</div>
	</div>
	<div class="flex flex-wrap gap-2">
		<button class="btn" name="adjust" value="false" disabled={difference !== 0}
			>Lock in reconciled</button
		>
		{#if difference !== null && difference !== 0}
			<button class="btn-secondary" name="adjust" value="true">
				Add a <Money cents={difference} /> adjustment and finish
			</button>
		{/if}
	</div>
</form>

<h2 class="mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">
	Not yet reconciled
</h2>
<TransactionList items={data.unreconciled} showAccount={false} />
