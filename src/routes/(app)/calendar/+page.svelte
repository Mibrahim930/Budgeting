<script lang="ts">
	import { goto } from '$app/navigation';
	import BillForm from '$lib/components/BillForm.svelte';
	import Money from '$lib/components/Money.svelte';
	import StatusPill from '$lib/components/StatusPill.svelte';
	import { addDays, addMonths, dateParts, daysInMonth, monthLabel, weekdayOf } from '$lib/month';
	import { dateLabel, dayLabel } from '$lib/planner/describe';
	import type { ChargeStatus } from '$lib/server/repo/calendar';

	let { data, form } = $props();
	let showForm = $state(false);

	const cal = $derived(data.calendar);
	const month = $derived(cal.month);

	const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	const days = $derived.by(() => {
		const { y, m } = dateParts(cal.from);
		return Array.from({ length: daysInMonth(y, m) }, (_, i) => addDays(cal.from, i));
	});
	const blanks = $derived(weekdayOf(cal.from));

	const chargesOn = $derived.by(() => {
		const map: Record<string, typeof cal.charges> = {};
		for (const c of cal.charges) (map[c.dueDate] ??= []).push(c);
		return map;
	});
	const paydaySet = $derived(new Set([...cal.paydays, ...cal.paychecks.map((p) => p.date)]));

	const selectedCharges = $derived(chargesOn[data.day] ?? []);
	const selectedPaychecks = $derived(cal.paychecks.filter((p) => p.date === data.day));
	const predictedPayday = $derived(
		cal.paydays.includes(data.day) && selectedPaychecks.length === 0
	);

	const DOT: Record<ChargeStatus, string> = {
		unplanned: 'bg-neutral',
		planned: 'bg-accent',
		paid: 'bg-good'
	};
	const PILL: Record<ChargeStatus, [string, string]> = {
		unplanned: ['Not in a plan', 'bg-tonal text-ink'],
		planned: ['Planned', 'bg-accent-tint text-accent'],
		paid: ['Paid', 'bg-good-tint text-good']
	};

	const href = (m: string, day?: string) => `/calendar?month=${m}${day ? `&day=${day}` : ''}`;

	function select(day: string) {
		showForm = false;
		goto(href(month, day), { replaceState: true, noScroll: true, keepFocus: true });
	}
</script>

<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
	<div>
		<h1 class="display">Calendar</h1>
		<p class="text-sm text-muted">
			{#if cal.totals.count}
				<Money cents={cal.totals.dueMinor} /> due this month ·
				<Money cents={cal.totals.paidMinor} /> paid
			{:else}
				No charges due this month.
			{/if}
		</p>
	</div>
	<a href="/bills" class="text-sm link">All bills</a>
</div>

{#if data.addedTo}
	<p class="mb-4 rounded-control bg-good-tint px-3 py-2 text-sm text-good" role="status">
		Added to the {dayLabel(data.addedTo)} plan.
		<a href="/paychecks/{data.addedId}" class="font-medium underline">Open plan</a>
	</p>
{/if}

<section class="card p-3 sm:p-4" aria-label="Month">
	<div class="mb-3 flex items-center justify-between gap-2">
		<a
			href={href(addMonths(month, -1))}
			class="btn-secondary px-2.5"
			aria-label="Previous month"
			data-sveltekit-noscroll>←</a
		>
		<div class="flex items-baseline gap-3">
			<h2 class="font-semibold">{monthLabel(month)}</h2>
			<a href="/calendar" class="text-sm link" data-sveltekit-noscroll>Today</a>
		</div>
		<a
			href={href(addMonths(month, 1))}
			class="btn-secondary px-2.5"
			aria-label="Next month"
			data-sveltekit-noscroll>→</a
		>
	</div>

	<div class="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted" aria-hidden="true">
		{#each WEEKDAYS as w (w)}<div>{w}</div>{/each}
	</div>
	<div class="mt-1 grid grid-cols-7 gap-1">
		{#each { length: blanks }, i (i)}<div></div>{/each}
		{#each days as day (day)}
			{@const items = chargesOn[day] ?? []}
			{@const selected = day === data.day}
			<button
				type="button"
				data-testid="day-{day}"
				aria-label={dateLabel(day)}
				aria-pressed={selected}
				onclick={() => select(day)}
				class="flex min-h-14 min-w-0 flex-col items-stretch rounded-control border p-1 text-left sm:min-h-20 sm:p-1.5 {selected
					? 'border-accent bg-tonal ring-1 ring-accent'
					: 'border-hairline hover:bg-ground'}"
			>
				<span class="flex items-center justify-between gap-0.5">
					<span
						class="text-xs tabular-nums sm:text-sm {day === data.today
							? 'rounded-full bg-accent px-1 font-semibold text-white'
							: 'text-ink'}">{dateParts(day).d}</span
					>
					{#if paydaySet.has(day)}
						<span
							title="Payday"
							data-payday
							class="rounded bg-warning-tint px-1 text-[10px] leading-4 font-semibold text-warning-ink"
							>$</span
						>
					{/if}
				</span>
				{#if items.length}
					<span class="mt-auto flex flex-wrap items-center gap-0.5 pt-1">
						{#each items.slice(0, 3) as c (c.billId)}
							<span
								class="h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2 {DOT[c.status]}"
								data-status={c.status}
								title={c.name}
							></span>
						{/each}
						{#if items.length > 3}
							<span class="text-[10px] leading-none text-muted">+{items.length - 3}</span>
						{/if}
					</span>
				{/if}
			</button>
		{/each}
	</div>

	<ul class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
		<li class="flex items-center gap-1.5">
			<span class="h-2 w-2 rounded-full bg-neutral"></span> Not in a plan
		</li>
		<li class="flex items-center gap-1.5">
			<span class="h-2 w-2 rounded-full bg-accent"></span> Planned
		</li>
		<li class="flex items-center gap-1.5">
			<span class="h-2 w-2 rounded-full bg-good"></span> Paid
		</li>
		<li class="flex items-center gap-1.5">
			<span
				class="rounded bg-warning-tint px-1 text-[10px] leading-4 font-semibold text-warning-ink"
				>$</span
			> Payday
		</li>
	</ul>
</section>

<section class="mt-4" aria-label="Selected day">
	<h2 class="mb-2 text-xs font-extrabold text-muted">
		{dayLabel(data.day)}
	</h2>
	{#if selectedCharges.length || selectedPaychecks.length || predictedPayday}
		<ul class="divide-y divide-hairline rounded-card border border-hairline bg-surface">
			{#each selectedPaychecks as p (p.id)}
				<li class="flex items-center gap-3 px-4 py-3">
					<a href="/paychecks/{p.id}" class="min-w-0 grow hover:underline">
						<span class="block font-medium">Payday</span>
						<span class="block text-xs text-muted">Paycheck plan</span>
					</a>
					<span class="font-medium"><Money cents={p.amountMinor} /></span>
					<StatusPill status={p.status} />
				</li>
			{/each}
			{#if predictedPayday}
				<li class="flex items-center gap-3 px-4 py-3">
					<span class="min-w-0 grow">
						<span class="block font-medium">Expected payday</span>
						<span class="block text-xs text-muted">No plan yet</span>
					</span>
					<a href="/paychecks/new?date={data.day}" class="text-sm link">Plan it</a>
				</li>
			{/if}
			{#each selectedCharges as c (c.billId)}
				{@const pill = PILL[c.status]}
				<li class="flex items-start gap-3 px-4 py-3">
					<span class="mt-1.5 h-2 w-2 shrink-0 rounded-full {DOT[c.status]}"></span>
					<span class="min-w-0 grow">
						<a href="/bills/{c.billId}" class="block truncate font-medium hover:underline"
							>{c.name}</a
						>
						<span class="block text-xs text-muted">
							Paid from {c.accountName}
							{#if c.paycheckId}
								· <a href="/paychecks/{c.paycheckId}" class="link">View plan</a>
							{/if}
						</span>
					</span>
					<span class="flex shrink-0 flex-col items-end gap-1">
						<span class="font-medium"><Money cents={c.amountMinor} /></span>
						<span class="rounded-full px-2 py-0.5 text-xs font-medium {pill[1]}">{pill[0]}</span>
					</span>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="card text-sm text-muted">Nothing due</p>
	{/if}

	<div class="mt-4">
		<button
			class="btn-secondary"
			aria-expanded={showForm || !!form?.error}
			onclick={() => (showForm = !showForm)}
		>
			Add a charge on this day
		</button>
	</div>
	{#if showForm || form?.error}
		<div class="mt-3">
			{#key data.day}
				<BillForm
					accounts={data.accounts}
					groups={data.groups}
					action="?/create"
					submitLabel="Add charge"
					error={form?.error}
					initial={{
						startDate: data.day,
						frequency: 'monthly',
						dayOfMonth: dateParts(data.day).d
					}}
					onsaved={() => (showForm = false)}
				/>
			{/key}
		</div>
	{/if}
</section>
