<script lang="ts">
	import { enhance } from '$app/forms';
	import Money from '$lib/components/Money.svelte';

	let { data, form } = $props();
	let showForm = $state(false);
	let type = $state('checking');
	const offByDefault = ['investment', 'loan'];
	// Defaults from the type, but the checkbox can still be changed.
	let onBudget = $derived(!offByDefault.includes(type));

	const open = $derived(data.accounts.filter((a) => !a.archivedAt));
	const sections = $derived([
		{ title: 'Budget accounts', items: open.filter((a) => a.onBudget) },
		{ title: 'Tracking accounts', items: open.filter((a) => !a.onBudget) },
		{ title: 'Closed', items: data.accounts.filter((a) => a.archivedAt) }
	]);
	const netWorth = $derived(open.reduce((s, a) => s + a.balanceMinor, 0));
</script>

<div class="mb-4 flex items-center justify-between">
	<div>
		<h1 class="text-xl font-semibold">Accounts</h1>
		<p class="text-sm text-slate-500">Net worth <Money cents={netWorth} /></p>
	</div>
	<button class="btn" onclick={() => (showForm = !showForm)}>Add account</button>
</div>

{#if showForm || form?.error}
	<form method="POST" action="?/create" use:enhance class="card mb-4 grid gap-3 sm:grid-cols-4">
		{#if form?.error}<p class="error sm:col-span-4">{form.error}</p>{/if}
		<div class="sm:col-span-2">
			<label class="label" for="a-name">Name</label>
			<input class="input" id="a-name" name="name" required placeholder="e.g. Chase checking" />
		</div>
		<div>
			<label class="label" for="a-type">Type</label>
			<select class="input" id="a-type" name="type" bind:value={type}>
				<option value="checking">Checking</option>
				<option value="savings">Savings</option>
				<option value="credit">Credit card</option>
				<option value="cash">Cash</option>
				<option value="loan">Loan / mortgage</option>
				<option value="investment">Investment</option>
			</select>
		</div>
		<div>
			<label class="label" for="a-balance">
				{type === 'credit' || type === 'loan' ? 'Amount owed today' : 'Balance today'}
			</label>
			<input class="input" id="a-balance" name="balance" inputmode="decimal" placeholder="0.00" />
		</div>
		<label class="flex items-start gap-2 text-sm sm:col-span-3">
			<input type="checkbox" name="onBudget" bind:checked={onBudget} />
			<span
				>Include in budget. Leave unchecked for accounts you only want to track (investments,
				mortgages).</span
			>
		</label>
		<div class="sm:text-right"><button class="btn">Create account</button></div>
	</form>
{/if}

{#each sections as section (section.title)}
	{#if section.items.length}
		<h2 class="mt-6 mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">
			{section.title}
		</h2>
		<ul class="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
			{#each section.items as a (a.id)}
				<li>
					<a
						href="/accounts/{a.id}"
						class="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
					>
						<span>
							<span class="font-medium">{a.name}</span>
							<span class="ml-2 text-xs text-slate-500 capitalize">{a.type}</span>
							{#if a.connectionId}<span class="ml-1 text-xs text-teal-700">· synced</span>{/if}
						</span>
						<Money cents={a.balanceMinor} colored />
					</a>
				</li>
			{/each}
		</ul>
	{/if}
{/each}

{#if data.accounts.length === 0}
	<p class="card mt-4 text-sm text-slate-600">
		Add the bank accounts and credit cards you spend from. You can connect them to your bank later
		in Settings → Bank sync, or import CSV files from your bank.
	</p>
{/if}
