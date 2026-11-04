<script lang="ts">
	import { enhance } from '$app/forms';
	import BillForm from '$lib/components/BillForm.svelte';
	import { dateLabel, dayLabel, describeBill } from '$lib/planner/describe';

	let { data, form } = $props();

	const confirmDelete = (e: SubmitEvent) => {
		if (
			!confirm(
				'Delete this bill? Its planned lines will be removed from your paychecks. Lines you already ticked are kept.'
			)
		)
			e.preventDefault();
	};
</script>

<a href="/bills" class="text-sm text-muted hover:underline">← Bills</a>
<h1 class="display">{data.bill.name}</h1>
<p class="mb-4 text-sm text-muted">
	{describeBill(data.bill)}{data.nextDue
		? ` · Next due ${dayLabel(data.nextDue)}, ${data.nextDue.slice(0, 4)}`
		: ''}
</p>

{#if data.ended}
	<p class="mb-4 rounded-control bg-tonal px-3 py-2 text-sm text-ink" role="status">
		This bill has ended{#if data.bill.endedAt}: its last due date was {dateLabel(
				data.bill.endedAt
			)}{/if}. It won't be suggested for new paychecks. Clear or move the last due date to start it
		again.
	</p>
{/if}
{#if form && 'saved' in form}
	<p class="mb-4 rounded-control bg-good-tint px-3 py-2 text-sm text-good" role="status">
		Bill saved. Paychecks you already planned keep the old amount.
	</p>
{/if}

<BillForm
	accounts={data.accounts}
	groups={data.groups}
	action="?/update"
	initial={data.bill}
	submitLabel="Save bill"
	error={form?.error}
/>

<div class="mt-4 flex flex-wrap gap-2">
	{#if !data.ended}
		<form method="POST" action="?/end" use:enhance>
			<button class="btn-secondary">End this bill today</button>
		</form>
	{/if}
	<form method="POST" action="?/delete" use:enhance onsubmit={confirmDelete}>
		<button class="btn-danger">Delete bill</button>
	</form>
</div>
