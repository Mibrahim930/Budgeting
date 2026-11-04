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
		unplanned: ['Not in a plan', 'bg-neutral-tint text-muted'],
		planned: ['Planned', 'bg-accent-tint text-accent'],
		paid: ['Paid', 'bg-good-tint text-good']
	};

	const href = (m: string, day?: string) => `/calendar?month=${m}${day ? `&day=${day}` : ''}`;

	function select(day: string) {
		showForm = false;
		goto(href(month, day), { replaceState: true, noScroll: true, keepFocus: true });
	}
</script>

<div class="mb-4 flex flex-wrap items-end justify-between gap-2">
	<div>
		<p class="eyebrow">
			{#if cal.totals.count}
				<Money cents={cal.totals.dueMinor} /> due this month ·
				<a href="/bills" class="link">All bills</a>
			{:else}
				No charges due this month · <a href="/bills" class="link">All bills</a>
			{/if}
		</p>
		<h1 class="display">Calendar</h1>
	</div>
	{#if cal.totals.count}
		<span
			class="rounded-full border border-hairline bg-surface px-3 py-1.5 text-xs font-bold text-good"
			><Money cents={cal.totals.paidMinor} /> paid</span
		>
	{/if}
</div>

{#if data.addedTo}
	<p class="mb-4 rounded-card bg-good-tint px-4 py-3 text-sm font-semibold text-good" role="status">
		Added to the {dayLabel(data.addedTo)} plan.
		<a href="/paychecks/{data.addedId}" class="font-extrabold underline">Open plan</a>
	</p>
{/if}

<div class="grid items-start gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
	<section class="card-raised p-4" aria-label="Month">
		<div class="mb-3 flex items-center justify-between gap-2">
			<a
				href={href(addMonths(month, -1))}
				class="btn-secondary btn-sm min-w-9"
				aria-label="Previous month"
				data-sveltekit-noscroll>←</a
			>
			<div class="flex items-baseline gap-3">
				<h2 class="text-base font-extrabold">{monthLabel(month)}</h2>
				<a href="/calendar" class="link text-xs" data-sveltekit-noscroll>Today</a>
			</div>
			<a
				href={href(addMonths(month, 1))}
				class="btn-secondary btn-sm min-w-9"
				aria-label="Next month"
				data-sveltekit-noscroll>→</a
			>
		</div>

		<div
			class="grid grid-cols-7 gap-1.5 text-center text-[10px] font-extrabold text-muted"
			aria-hidden="true"
		>
			{#each WEEKDAYS as w (w)}<div>{w.slice(0, 1)}</div>{/each}
		</div>
		<div class="mt-1.5 grid grid-cols-7 gap-1.5">
			{#each { length: blanks }, i (i)}<div></div>{/each}
			{#each days as day (day)}
				{@const items = chargesOn[day] ?? []}
				{@const selected = day === data.day}
				{@const payday = paydaySet.has(day)}
				<button
					type="button"
					data-testid="day-{day}"
					aria-label={dateLabel(day)}
					aria-pressed={selected}
					onclick={() => select(day)}
					class="flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-[14px] py-1 text-[13px] font-bold tabular-nums sm:min-h-16 {selected
						? 'bg-accent text-white shadow-[0_6px_16px_rgba(79,70,229,0.3)]'
						: payday
							? 'bg-warning-tint text-warning-ink'
							: 'bg-ground text-ink hover:bg-tonal'} {day === data.today && !selected
						? 'ring-1 ring-accent'
						: ''}"
				>
					<span>{dateParts(day).d}</span>
					{#if payday}
						<span
							title="Payday"
							data-payday
							class="text-[8px] leading-none font-extrabold tracking-wider">PAY</span
						>
					{/if}
					{#if items.length}
						<span class="flex items-center gap-0.5">
							{#each items.slice(0, 3) as c (c.billId)}
								<span
									class="h-1.5 w-1.5 rounded-full {selected ? 'bg-white' : DOT[c.status]}"
									data-status={c.status}
									title={c.name}
								></span>
							{/each}
							{#if items.length > 3}
								<span
									class="text-[9px] leading-none font-extrabold {selected
										? 'text-white'
										: 'text-muted'}">+{items.length - 3}</span
								>
							{/if}
						</span>
					{/if}
				</button>
			{/each}
		</div>

		<ul
			class="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold text-muted"
			aria-label="Legend"
		>
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
				<span class="h-2 w-2 rounded-[3px] bg-warning-tint ring-1 ring-warning/40"></span> Payday
			</li>
		</ul>
	</section>

	<section class="card" aria-label="Selected day">
		<h2 class="mb-2 text-xs font-extrabold text-muted">
			{dayLabel(data.day)}
		</h2>
		{#if selectedCharges.length || selectedPaychecks.length || predictedPayday}
			<ul class="divide-y divide-hairline">
				{#each selectedPaychecks as p (p.id)}
					<li class="flex items-center gap-3 py-3">
						<a href="/paychecks/{p.id}" class="min-w-0 grow hover:underline">
							<span class="block font-extrabold">Payday</span>
							<span class="block text-[11px] text-muted">Paycheck plan</span>
						</a>
						<span class="flex shrink-0 flex-col items-end gap-1">
							<span class="font-extrabold"><Money cents={p.amountMinor} /></span>
							<StatusPill status={p.status} />
						</span>
					</li>
				{/each}
				{#if predictedPayday}
					<li class="flex items-center gap-3 py-3">
						<span class="min-w-0 grow">
							<span class="block font-extrabold">Expected payday</span>
							<span class="block text-[11px] text-muted">No plan yet</span>
						</span>
						<a href="/paychecks/new?date={data.day}" class="link text-sm">Plan it</a>
					</li>
				{/if}
				{#each selectedCharges as c (c.billId)}
					{@const pill = PILL[c.status]}
					<li class="flex items-center gap-3 py-3">
						<span class="min-w-0 grow">
							<a href="/bills/{c.billId}" class="block truncate font-extrabold hover:underline"
								>{c.name}</a
							>
							<span class="block text-[11px] text-muted">
								Paid from {c.accountName}
								{#if c.paycheckId}
									· <a href="/paychecks/{c.paycheckId}" class="link">View plan</a>
								{/if}
							</span>
						</span>
						<span class="flex shrink-0 flex-col items-end gap-1">
							<span class="font-extrabold"><Money cents={c.amountMinor} /></span>
							<span class="pill {pill[1]}">{pill[0]}</span>
						</span>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-sm text-muted">Nothing due</p>
		{/if}

		<button
			class="btn-secondary mt-3 w-full"
			aria-expanded={showForm || !!form?.error}
			onclick={() => (showForm = !showForm)}
		>
			Add a charge on this day
		</button>
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
						nested
					/>
				{/key}
			</div>
		{/if}
	</section>
</div>
