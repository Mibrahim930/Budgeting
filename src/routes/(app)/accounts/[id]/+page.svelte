<script lang="ts">
	import { enhance } from '$app/forms';
	import Money from '$lib/components/Money.svelte';
	import TransactionForm from '$lib/components/TransactionForm.svelte';
	import TransactionList from '$lib/components/TransactionList.svelte';

	let { data, form } = $props();
	let adding = $state(false);
	let editing = $state(false);
</script>

<div class="mb-4 flex flex-wrap items-start justify-between gap-3">
	<div>
		<a href="/accounts" class="text-sm text-slate-500 hover:underline">← Accounts</a>
		<h1 class="text-xl font-semibold">
			{data.account.name}
			{#if data.account.archivedAt}<span class="text-sm font-normal text-slate-500">(closed)</span
				>{/if}
		</h1>
		<p class="text-sm text-slate-600">
			Balance <b><Money cents={data.account.balanceMinor} /></b>
			<span class="ml-2 text-slate-500">Cleared <Money cents={data.account.clearedMinor} /></span>
		</p>
	</div>
	<div class="flex gap-2">
		<a class="btn-secondary" href="/accounts/{data.account.id}/reconcile">Reconcile</a>
		<button class="btn-secondary" onclick={() => (editing = !editing)}>Edit</button>
		<button class="btn" onclick={() => (adding = !adding)}>Add transaction</button>
	</div>
</div>

{#if editing}
	<div class="card mb-4 space-y-3">
		<form method="POST" action="?/update" use:enhance class="flex flex-wrap items-end gap-3">
			<div class="grow">
				<label class="label" for="acct-name">Name</label>
				<input class="input" id="acct-name" name="name" value={data.account.name} required />
			</div>
			<label class="flex items-center gap-2 pb-2 text-sm">
				<input type="checkbox" name="onBudget" checked={data.account.onBudget} /> In budget
			</label>
			<button class="btn">Save</button>
		</form>
		<form method="POST" action="?/archive" use:enhance>
			<input type="hidden" name="archived" value={String(!data.account.archivedAt)} />
			<button class="text-sm text-red-600 hover:underline">
				{data.account.archivedAt ? 'Reopen account' : 'Close account'}
			</button>
		</form>
	</div>
{/if}

{#if adding}
	<div class="card mb-4">
		<TransactionForm
			action="?/addTxn"
			accounts={data.accountOptions}
			groups={data.groups}
			payees={data.payees}
			defaultAccountId={data.account.id}
			submitLabel="Add"
			error={form && 'error' in form ? form.error : undefined}
		/>
	</div>
{/if}

<form class="mb-3" method="GET">
	<input
		class="input"
		name="q"
		placeholder="Search payee, description or memo"
		value={data.search}
	/>
</form>

<TransactionList items={data.transactions} showAccount={false} />
