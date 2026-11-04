<script lang="ts">
	import { enhance } from '$app/forms';
	import BillForm from '$lib/components/BillForm.svelte';
	import Money from '$lib/components/Money.svelte';
	import { dayLabel, describeBill } from '$lib/planner/describe';

	let { data, form } = $props();
	let showForm = $state(false);

	const sections = $derived([
		{ title: 'Active', items: data.bills.filter((b) => !b.ended) },
		{ title: 'Ended', items: data.bills.filter((b) => b.ended) }
	]);

	const year = new Date().getFullYear().toString();
	/** "Fri, Jan 3", with the year only when it isn't this year. */
	const dueLabel = (d: string) =>
		d.startsWith(year) ? dayLabel(d) : `${dayLabel(d)}, ${d.slice(0, 4)}`;

	const confirmDelete = (e: SubmitEvent) => {
		if (
			!confirm(
				'Delete this bill? Its planned lines will be removed from your paychecks. Lines you already ticked are kept.'
			)
		)
			e.preventDefault();
	};
</script>

<div class="mb-4 flex items-center justify-between gap-2">
	<div>
		<h1 class="display">Bills</h1>
		<p class="text-sm text-muted">
			Recurring bills and when they're due.
			<a href="/calendar" class="link">Calendar</a>
		</p>
	</div>
	<button class="btn shrink-0" aria-expanded={showForm} onclick={() => (showForm = !showForm)}>
		Add bill
	</button>
</div>

{#if showForm || form?.error}
	<div class="mb-4">
		<BillForm
			accounts={data.accounts}
			groups={data.groups}
			action="?/create"
			submitLabel="Add bill"
			error={form?.error}
			onsaved={() => (showForm = false)}
		/>
	</div>
{/if}

{#if form?.rowError}<p class="error mb-3" role="alert">{form.rowError}</p>{/if}

{#each sections as section (section.title)}
	{#if section.items.length}
		<h2 class="mt-6 mb-2 text-xs font-extrabold text-muted">
			{section.title}
		</h2>
		<ul
			class="divide-y divide-hairline overflow-hidden rounded-card border border-hairline bg-surface"
			aria-label="{section.title} bills"
		>
			{#each section.items as b (b.id)}
				<li class="flex items-start gap-3 px-4 py-3">
					<a href="/bills/{b.id}" class="min-w-0 grow hover:underline-offset-2">
						<span class="flex items-baseline justify-between gap-2">
							<span class="truncate font-bold">{b.name}</span>
							<span class="font-bold"><Money cents={b.amountMinor} /></span>
						</span>
						<span class="block text-sm text-muted">{describeBill(b)}</span>
						<span class="block text-xs text-muted">
							{[
								`Paid from ${b.accountName}`,
								b.categoryName,
								b.payToAccountName && `Pays off ${b.payToAccountName}`
							]
								.filter(Boolean)
								.join(' · ')}
						</span>
						<span class="mt-0.5 block text-xs {b.ended ? 'text-muted' : 'text-accent'}">
							{b.nextDue ? `Next due ${dueLabel(b.nextDue)}` : 'Ended'}
						</span>
					</a>
					<div class="flex shrink-0 flex-col items-end gap-1 text-xs">
						{#if !b.ended}
							<form method="POST" action="?/end" use:enhance>
								<input type="hidden" name="id" value={b.id} />
								<button class="text-muted hover:underline" aria-label="End {b.name} today">
									End
								</button>
							</form>
						{/if}
						<form method="POST" action="?/delete" use:enhance onsubmit={confirmDelete}>
							<input type="hidden" name="id" value={b.id} />
							<button class="text-danger hover:underline" aria-label="Delete {b.name}">
								Delete
							</button>
						</form>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
{/each}

{#if data.bills.length === 0}
	<p class="card mt-4 text-sm text-muted">
		Add the bills you pay regularly: rent, phone, gym, subscriptions, card payments. When you plan a
		paycheck, the bills due before your next payday are suggested automatically.
	</p>
{/if}

<p class="mt-6 text-sm">
	<a href="/categories" class="link">Manage categories</a>
</p>
