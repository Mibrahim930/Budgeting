<script lang="ts">
	import { enhance } from '$app/forms';
	import CategorySelect from '$lib/components/CategorySelect.svelte';

	let { data, form } = $props();
	const fieldLabel = { description: 'Bank description', payee: 'Payee' } as const;
	const opLabel = { contains: 'contains', equals: 'is', starts_with: 'starts with' } as const;
</script>

<h1 class="mb-1 text-xl font-semibold">Rules</h1>
<p class="mb-4 text-sm text-slate-600">
	Rules categorize imported and synced transactions automatically. Without a matching rule, a
	transaction gets the category you last used for the same payee.
</p>

<form method="POST" action="?/create" use:enhance class="card mb-6 space-y-3">
	{#if form && 'error' in form && form.error}<p class="error">{form.error}</p>{/if}
	{#if form && 'applied' in form}
		<p class="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
			{form.applied} uncategorized transaction{form.applied === 1 ? '' : 's'} categorized.
		</p>
	{/if}
	<div class="grid gap-3 sm:grid-cols-3">
		<div>
			<label class="label" for="r-field">If</label>
			<select class="input" id="r-field" name="matchField">
				<option value="description">Bank description</option>
				<option value="payee">Payee</option>
			</select>
		</div>
		<div>
			<label class="label" for="r-op">Condition</label>
			<select class="input" id="r-op" name="matchOp">
				<option value="contains">contains</option>
				<option value="starts_with">starts with</option>
				<option value="equals">is exactly</option>
			</select>
		</div>
		<div>
			<label class="label" for="r-value">Text</label>
			<input
				class="input"
				id="r-value"
				name="matchValue"
				required
				value={data.prefill.matchValue}
			/>
		</div>
		<div>
			<label class="label" for="r-category">Set category</label>
			<CategorySelect
				id="r-category"
				name="setCategoryId"
				groups={data.groups}
				value={data.prefill.setCategoryId}
				placeholder="Don't change"
			/>
		</div>
		<div>
			<label class="label" for="r-payee">Rename payee to</label>
			<input class="input" id="r-payee" name="setPayeeName" placeholder="Don't change" />
		</div>
		<div>
			<label class="label" for="r-priority">Priority (higher runs first)</label>
			<input class="input" id="r-priority" name="priority" type="number" value="0" />
		</div>
	</div>
	<label class="flex items-center gap-2 text-sm">
		<input type="checkbox" name="applyNow" checked /> Also apply to uncategorized transactions now
	</label>
	<button class="btn">Add rule</button>
</form>

<div class="mb-2 flex items-center justify-between">
	<h2 class="text-sm font-semibold tracking-wide text-slate-500 uppercase">Your rules</h2>
	<form method="POST" action="?/apply" use:enhance>
		<button class="btn-secondary">Apply to uncategorized</button>
	</form>
</div>
<ul class="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm">
	{#each data.rules as r (r.id)}
		<li class="flex items-center justify-between gap-2 px-3 py-2">
			<span>
				If <b>{fieldLabel[r.matchField]}</b>
				{opLabel[r.matchOp]} “{r.matchValue}”
				{#if r.categoryName}→ <b>{r.categoryName}</b>{/if}
				{#if r.setPayeeName}· rename to <b>{r.setPayeeName}</b>{/if}
				{#if r.priority}<span class="text-xs text-slate-500">(priority {r.priority})</span>{/if}
			</span>
			<form method="POST" action="?/delete" use:enhance>
				<input type="hidden" name="id" value={r.id} />
				<button class="text-red-600 hover:underline">Delete</button>
			</form>
		</li>
	{:else}
		<li class="px-3 py-4 text-slate-500">No rules yet.</li>
	{/each}
</ul>
