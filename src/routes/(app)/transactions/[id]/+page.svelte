<script lang="ts">
	import TransactionForm from '$lib/components/TransactionForm.svelte';

	let { data, form } = $props();
</script>

<a href="/accounts/{data.txn.accountId}" class="text-sm text-slate-500 hover:underline">← Back</a>
<h1 class="mb-4 text-xl font-semibold">Edit transaction</h1>

{#if data.description}
	<p class="mb-3 text-sm text-slate-500">
		Bank description: <span class="font-mono">{data.description}</span> · from {data.source}
	</p>
{/if}
{#if data.reconciled}
	<p class="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
		This transaction is reconciled. Changing its amount will make the account disagree with your
		statement.
	</p>
{/if}

<div class="card">
	{#key data.txn.id}
		<TransactionForm
			action="?/save"
			accounts={data.accountOptions}
			groups={data.groups}
			payees={data.payees}
			initial={data.txn}
			error={form?.error}
		/>
	{/key}
</div>

<form
	method="POST"
	action="?/delete"
	class="mt-4"
	onsubmit={(e) => {
		if (!confirm('Delete this transaction?')) e.preventDefault();
	}}
>
	<button class="btn-danger">Delete transaction</button>
</form>
