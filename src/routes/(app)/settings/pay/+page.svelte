<script lang="ts">
	import { enhance } from '$app/forms';
	import CategorySelect from '$lib/components/CategorySelect.svelte';
	import { centsToInput } from '$lib/money';

	let { data, form } = $props();

	const s = $derived(data.schedule);

	// Seeded once from the saved schedule; later reloads don't reset what the user picked.
	function seed() {
		return {
			frequency: data.schedule?.frequency ?? 'biweekly',
			incomeCategoryId: data.schedule
				? (data.schedule.incomeCategoryId ?? '')
				: (data.defaultIncomeCategoryId ?? '')
		};
	}
	const initial = seed();
	let frequency = $state(initial.frequency);
	let incomeCategoryId = $state(initial.incomeCategoryId);
</script>

<a href="/settings" class="text-sm text-muted hover:underline">← Settings</a>
<h1 class="mb-1 display">Pay schedule</h1>
<p class="mb-4 text-sm text-muted">
	Used to predict your next payday, pre-fill new paychecks and find the bills due before the next
	one. You still type the exact amount and date for every paycheck.
</p>

<form
	method="POST"
	use:enhance={() =>
		async ({ update }) =>
			update({ reset: false })}
>
	<section class="card grid gap-3 sm:grid-cols-2">
		{#if form?.error}<p class="error sm:col-span-2" role="alert">{form.error}</p>{/if}
		{#if form?.saved}
			<p
				class="rounded-control bg-good-tint px-3 py-2 text-sm text-good sm:col-span-2"
				role="status"
			>
				Pay schedule saved.
			</p>
		{/if}
		<div>
			<label class="label" for="p-frequency">Pay frequency</label>
			<select class="input" id="p-frequency" name="frequency" bind:value={frequency}>
				<option value="weekly">Every week</option>
				<option value="biweekly">Every 2 weeks</option>
				<option value="semimonthly">Twice a month</option>
				<option value="monthly">Once a month</option>
			</select>
		</div>
		<div>
			<label class="label" for="p-amount">Take-home pay</label>
			<input
				class="input"
				id="p-amount"
				name="amount"
				inputmode="decimal"
				placeholder="0.00"
				value={s ? centsToInput(s.amountMinor) : ''}
				required
			/>
		</div>
		<div>
			<label class="label" for="p-anchor">
				{frequency === 'semimonthly' ? 'A recent or upcoming payday' : 'Next payday'}
			</label>
			<input
				class="input"
				id="p-anchor"
				name="anchorDate"
				type="date"
				value={s?.anchorDate ?? data.today}
				required
			/>
		</div>
		{#if frequency === 'semimonthly'}
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label class="label" for="p-semi1">First payday</label>
					<input
						class="input"
						id="p-semi1"
						name="semiDay1"
						type="number"
						min="1"
						max="31"
						value={s?.semiDay1 ?? 1}
					/>
				</div>
				<div>
					<label class="label" for="p-semi2">Second payday</label>
					<input
						class="input"
						id="p-semi2"
						name="semiDay2"
						type="number"
						min="1"
						max="31"
						value={s?.semiDay2 ?? 15}
					/>
				</div>
			</div>
		{/if}
		<div>
			<label class="label" for="p-deposit">Paid into</label>
			<select
				class="input"
				id="p-deposit"
				name="depositAccountId"
				value={s?.depositAccountId ?? data.depositAccounts[0]?.id ?? ''}
			>
				<option value="">Choose when creating each paycheck</option>
				{#each data.depositAccounts as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
			</select>
		</div>
		<div>
			<label class="label" for="p-category">Income category</label>
			<CategorySelect
				groups={data.incomeGroups}
				id="p-category"
				name="incomeCategoryId"
				bind:value={incomeCategoryId}
			/>
		</div>
		<div class="sm:col-span-2 sm:text-right">
			<button class="btn w-full sm:w-auto">Save pay schedule</button>
		</div>
	</section>
</form>
