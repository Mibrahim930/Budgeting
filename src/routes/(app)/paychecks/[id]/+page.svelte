<script lang="ts">
	import { enhance } from '$app/forms';
	import AddLinePicker from '$lib/components/AddLinePicker.svelte';
	import PaycheckPlan from '$lib/components/PaycheckPlan.svelte';
	import ProjectedBalances from '$lib/components/ProjectedBalances.svelte';
	import UpcomingBills from '$lib/components/UpcomingBills.svelte';
	import { centsToInput } from '$lib/money';

	let { data, form } = $props();

	const p = $derived(data.paycheck);
	const ticked = $derived(p.incomeConfirmed || p.totals.doneCount > 0);
	let saved = $state(false);

	const confirmDelete = (e: SubmitEvent) => {
		if (!confirm('Delete this paycheck plan?')) e.preventDefault();
	};
</script>

<a href="/" class="text-sm link">← Paychecks</a>
<h1 class="mt-1 mb-4 display">Paycheck plan</h1>

{#if form?.error}<p class="error mb-4" role="alert">{form.error}</p>{/if}

<div class="grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
	<div class="min-w-0 space-y-4">
		<form
			method="POST"
			action="?/update"
			class="card grid grid-cols-2 gap-3"
			aria-label="Paycheck details"
			use:enhance={() => {
				saved = false;
				return async ({ result, update }) => {
					await update({ reset: false });
					saved = result.type === 'success';
				};
			}}
		>
			<div>
				<label class="label" for="pc-date">Pay date</label>
				<input class="input" id="pc-date" type="date" name="date" value={p.date} required />
			</div>
			<div>
				<label class="label" for="pc-amount">Amount</label>
				<input
					class="input"
					id="pc-amount"
					name="amount"
					inputmode="decimal"
					value={centsToInput(p.amountMinor)}
					required
				/>
			</div>
			<div>
				<label class="label" for="pc-next">Next payday</label>
				<input class="input" id="pc-next" type="date" name="nextDate" value={p.nextDate ?? ''} />
			</div>
			<div>
				<label class="label" for="pc-note">Note</label>
				<input class="input" id="pc-note" name="note" value={p.note ?? ''} />
			</div>
			<div class="col-span-2 flex items-center justify-end gap-3">
				{#if saved}<span class="text-sm text-good" role="status">Saved</span>{/if}
				<button class="btn">Save</button>
			</div>
		</form>

		<PaycheckPlan paycheck={p} today={data.today} />
		<AddLinePicker
			paycheckId={p.id}
			depositAccountId={p.accountId}
			accounts={data.accounts}
			groups={data.groups}
			billsDue={p.billsDue}
		/>
	</div>

	<div class="min-w-0 space-y-4">
		<ProjectedBalances
			projected={p.projected}
			depositAccountName={p.accountName}
			spendingMoneyMinor={p.spendingMoneyMinor}
		/>
		<UpcomingBills bills={p.billsDue} paycheckId={p.id} until={p.windowEnd} />

		<section class="card">
			<form method="POST" action="?/delete" use:enhance onsubmit={confirmDelete}>
				<button class="btn-danger disabled:opacity-50" disabled={ticked}>Delete plan</button>
			</form>
			{#if ticked}
				<p class="mt-2 text-xs text-muted">
					Untick everything on this plan (including "Paycheck received") to delete it.
				</p>
			{/if}
		</section>
	</div>
</div>
