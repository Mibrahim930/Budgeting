<script lang="ts">
	import CategorySelect from '$lib/components/CategorySelect.svelte';
	import TransactionForm from '$lib/components/TransactionForm.svelte';
	import TransactionList from '$lib/components/TransactionList.svelte';

	let { data, form } = $props();
	let adding = $state(false);
	const f = $derived(data.filter);
</script>

<div class="mb-4 flex items-center justify-between">
	<h1 class="text-xl font-semibold">Transactions</h1>
	<button class="btn" onclick={() => (adding = !adding)} disabled={!data.accountOptions.length}>
		Add transaction
	</button>
</div>

{#if !data.accountOptions.length}
	<p class="card mb-4 text-sm">
		Create an <a class="text-teal-700 underline" href="/accounts">account</a> first.
	</p>
{/if}

{#if adding}
	<div class="card mb-4">
		<TransactionForm
			action="?/addTxn"
			accounts={data.accountOptions}
			groups={data.groups}
			payees={data.payees}
			submitLabel="Add"
			error={form && 'error' in form ? form.error : undefined}
		/>
	</div>
{/if}

<form method="GET" class="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
	<input class="input col-span-2" name="q" placeholder="Search" value={f.search ?? ''} />
	<select class="input" name="account" value={f.accountId ?? ''}>
		<option value="">All accounts</option>
		{#each data.accountOptions as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
	</select>
	<CategorySelect
		groups={data.groups}
		name="category"
		value={f.categoryId ?? ''}
		placeholder="All categories"
	/>
	<input class="input" type="month" name="month" value={f.month ?? ''} aria-label="Month" />
	<label class="col-span-2 flex items-center gap-2 text-sm sm:col-span-4">
		<input type="checkbox" name="uncategorized" value="1" checked={f.uncategorized} />
		Only uncategorized
	</label>
	<button class="btn-secondary">Filter</button>
</form>

<TransactionList items={data.transactions} />
