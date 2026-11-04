<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { centsToInput, formatMoney } from '$lib/money';
	import { dateParts } from '$lib/month';
	import { dayLabel, monthName } from '$lib/planner/describe';
	import type { LineDetail, PaycheckDetail } from '$lib/server/repo/paychecks';
	import Money from './Money.svelte';
	import Ring from './Ring.svelte';
	import StatusPill from './StatusPill.svelte';

	let {
		paycheck,
		today,
		home = false
	}: {
		paycheck: PaycheckDetail;
		/** YYYY-MM-DD, sent with each tick (transfers are dated the day they're ticked). */
		today: string;
		/** On the home page: show an "Open plan" link to the full page. */
		home?: boolean;
	} = $props();

	const left = $derived(paycheck.totals.left);
	const uid = $props.id();

	/** "Jan 9" */
	const monthDay = (date: string) => {
		const { m, d } = dateParts(date);
		return `${monthName(m)} ${d}`;
	};

	function subText(l: LineDetail): string {
		const fromOther = l.effectiveFromAccountId !== paycheck.accountId && l.fromAccountName;
		switch (l.kind) {
			case 'savings':
				return `to ${l.toAccountName ?? 'a removed account'}`;
			case 'debt':
				return `${l.toAccountName ?? 'Debt'} payment`;
			case 'bill':
				return [
					l.dueDate && `due ${monthDay(l.dueDate)}`,
					l.categoryName,
					l.toAccountName && `pays ${l.toAccountName}`,
					fromOther && `from ${l.fromAccountName}`
				]
					.filter(Boolean)
					.join(' · ');
			case 'spending':
				if (l.toAccountId) return `withdraw to ${l.toAccountName ?? 'cash'}`;
				return l.categoryName
					? `${l.categoryName} · stays in ${paycheck.accountName}`
					: `stays in ${paycheck.accountName}`;
		}
	}

	/** Checkbox forms: keep the box in step with the server when the action is refused. */
	const tick: SubmitFunction = ({ formElement }) => {
		return async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'failure' || result.type === 'error') {
				const box = formElement.querySelector<HTMLInputElement>('input[type="checkbox"]');
				if (box) box.checked = !box.checked;
			}
		};
	};
	const keep: SubmitFunction =
		() =>
		async ({ update }) =>
			update({ reset: false });

	const submitForm = (e: Event) => (e.currentTarget as HTMLInputElement).form?.requestSubmit();

	const chipClass =
		'mt-1.5 inline-flex flex-wrap items-center gap-x-1 rounded-control bg-tonal px-2 py-1 text-[11px] font-semibold text-accent';
	const linkClass = 'shrink-0 font-extrabold underline hover:text-accent-strong';

	/** Ticked-off items, counting "Paycheck received" as one of them. */
	const done = $derived(paycheck.totals.doneCount + (paycheck.incomeConfirmed ? 1 : 0));
	const total = $derived(paycheck.lines.length + 1);
	const tickedOff = $derived(
		paycheck.lines.reduce((s, l) => s + (l.status === 'done' ? l.amountMinor : 0), 0) +
			(paycheck.incomeConfirmed ? paycheck.amountMinor : 0)
	);
	/** Shown in full in the ring; the size steps down so long amounts still fit inside it. */
	const leftText = $derived(formatMoney(left));
	const statClass = $derived(left < 0 ? 'text-danger' : left > 0 ? 'text-warning' : 'text-good');
</script>

<section class="card-raised" aria-labelledby="plan-heading-{uid}">
	<div class="flex flex-wrap items-start justify-between gap-2">
		<div class="min-w-0">
			<p class="eyebrow">
				{dayLabel(paycheck.date)} · {paycheck.nextDate
					? `next payday ${dayLabel(paycheck.nextDate)}`
					: `covers bills until ${dayLabel(paycheck.windowEnd)}`}{paycheck.note
					? ` · ${paycheck.note}`
					: ''}
			</p>
			<h2 id="plan-heading-{uid}" class="mt-0.5 text-sm font-extrabold">
				Paycheck · {dayLabel(paycheck.date)} · <Money cents={paycheck.amountMinor} />
			</h2>
		</div>
		<div class="flex shrink-0 items-center gap-1.5">
			<StatusPill status={paycheck.status} />
			<span class="pill border border-hairline bg-surface text-ink">{done} of {total} done</span>
		</div>
	</div>

	<div class="mt-4 flex items-center gap-4 sm:gap-6">
		<Ring
			value={total ? (done / total) * 100 : 0}
			size={120}
			stroke={4.5}
			label="Share of the paycheck ticked off"
		>
			<span
				class="block px-1 font-extrabold tabular-nums {leftText.length <= 7
					? 'text-[15px]'
					: leftText.length <= 9
						? 'text-[13px]'
						: 'text-[11px]'}"
				data-testid="left-to-allocate">{leftText}</span
			>
			<span class="mt-1 block text-[10px] text-muted">left to allocate</span>
		</Ring>
		<div class="min-w-0 flex-1 text-[13px]">
			<dl class="space-y-1.5">
				<div class="flex justify-between gap-2">
					<dt class="text-muted">Pay</dt>
					<dd class="font-bold"><Money cents={paycheck.amountMinor} /></dd>
				</div>
				<div class="flex justify-between gap-2">
					<dt class="text-muted">Allocated</dt>
					<dd class="font-bold"><Money cents={paycheck.totals.allocated} /></dd>
				</div>
				<div class="flex justify-between gap-2">
					<dt class="text-muted">Ticked off</dt>
					<dd class="font-bold"><Money cents={tickedOff} /></dd>
				</div>
			</dl>
			{#if left < 0}
				<p class="mt-2 text-xs font-bold {statClass}" role="status">
					Over-allocated by {formatMoney(-left)}
				</p>
			{:else if left > 0}
				<p class="mt-2 text-xs font-bold {statClass}">{formatMoney(left)} still to allocate</p>
			{:else}
				<p class="mt-2 text-xs font-bold {statClass}">Every dollar has a job</p>
			{/if}
		</div>
	</div>

	<ul class="mt-4 space-y-2" aria-label="Plan checklist">
		<li class="row">
			<form
				method="POST"
				action={paycheck.incomeConfirmed ? '?/unconfirmIncome' : '?/confirmIncome'}
				use:enhance={tick}
				class="flex"
			>
				<input type="hidden" name="paycheckId" value={paycheck.id} />
				<input
					id="income-{uid}"
					type="checkbox"
					class="h-[22px] w-[22px] accent-accent"
					aria-label="Paycheck received"
					checked={paycheck.incomeConfirmed}
					onchange={submitForm}
				/>
			</form>
			<div class="min-w-0 grow">
				<label for="income-{uid}" class="block cursor-pointer">
					<span class="block text-sm font-bold">Paycheck received</span>
					<span class="block text-[11px] text-muted">
						into {paycheck.accountName} · {dayLabel(paycheck.date)}
					</span>
				</label>
				{#if !paycheck.incomeConfirmed && paycheck.matches.income}
					{@const m = paycheck.matches.income}
					<form method="POST" action="?/linkIncome" use:enhance={keep} class={chipClass}>
						<input type="hidden" name="paycheckId" value={paycheck.id} />
						<input type="hidden" name="txnId" value={m.txnId} />
						<span>Looks received on {monthDay(m.date)} —</span>
						<button class={linkClass} title="Link {m.payeeName ?? m.description ?? 'transaction'}"
							>Link</button
						>
					</form>
				{/if}
			</div>
			<span class="shrink-0 text-sm font-extrabold text-good">
				{#if paycheck.incomeTxnId}
					<a href="/transactions/{paycheck.incomeTxnId}" class="hover:underline">
						+<Money cents={paycheck.amountMinor} />
					</a>
				{:else}
					+<Money cents={paycheck.amountMinor} />
				{/if}
			</span>
			<span class="w-8 shrink-0"></span>
		</li>

		{#each paycheck.lines as l (l.id)}
			{@const done = l.status === 'done'}
			{@const boxId = `line-${l.id}-${uid}`}
			{@const match = done ? undefined : paycheck.matches.lines[l.id]}
			<li class="row">
				<form
					method="POST"
					action={done ? '?/unconfirmLine' : '?/confirmLine'}
					use:enhance={tick}
					class="flex"
				>
					<input type="hidden" name="id" value={l.id} />
					<input type="hidden" name="date" value={today} />
					<input
						id={boxId}
						type="checkbox"
						class="h-[22px] w-[22px] accent-accent"
						aria-label={l.label}
						checked={done}
						onchange={submitForm}
					/>
				</form>
				<div class="min-w-0 grow">
					<label for={boxId} class="block cursor-pointer">
						<span class="block truncate text-sm font-bold {done ? 'text-muted' : ''}">
							{l.label}
						</span>
						{#if l.kind === 'spending' && l.spentMinor !== null}
							{@const pct =
								l.amountMinor > 0 ? Math.min(100, (l.spentMinor / l.amountMinor) * 100) : 100}
							<span class="block text-[11px] text-muted">
								spent {formatMoney(l.spentMinor)} of {formatMoney(l.amountMinor)}
							</span>
							<span class="mt-1 block h-1.5 w-full max-w-40 overflow-hidden rounded-full bg-tonal">
								<span
									class="block h-full rounded-full {l.spentMinor > l.amountMinor
										? 'bg-danger'
										: 'bg-accent'}"
									style:width="{pct}%"
								></span>
							</span>
						{:else}
							<span class="block truncate text-[11px] text-muted">{subText(l)}</span>
						{/if}
					</label>
					{#if match}
						<form method="POST" action="?/linkLine" use:enhance={keep} class={chipClass}>
							<input type="hidden" name="id" value={l.id} />
							<input type="hidden" name="txnId" value={match.txnId} />
							<input type="hidden" name="partnerTxnId" value={match.partnerTxnId ?? ''} />
							<span>
								Looks paid on {monthDay(match.date)} · {formatMoney(Math.abs(match.amountMinor))} —
							</span>
							<button
								class={linkClass}
								title="Link {match.payeeName ?? match.description ?? 'transaction'}">Link</button
							>
						</form>
					{/if}
				</div>
				{#if done}
					<span class="shrink-0 text-sm font-extrabold tabular-nums">
						{#if l.txnId && l.txnOrigin === 'linked'}
							<span class="mr-1 text-[11px] font-semibold text-muted">linked</span>
						{/if}
						{#if l.txnId}
							<a href="/transactions/{l.txnId}" class="hover:underline" title="View transaction">
								<Money cents={l.amountMinor} />
							</a>
						{:else}
							<Money cents={l.amountMinor} />
						{/if}
					</span>
					<span class="w-8 shrink-0"></span>
				{:else}
					<form method="POST" action="?/updateLine" use:enhance={keep} class="shrink-0">
						<input type="hidden" name="id" value={l.id} />
						<input
							class="input min-h-9 w-20 py-1 sm:w-24 text-right font-extrabold tabular-nums"
							name="amount"
							inputmode="decimal"
							aria-label="Amount for {l.label}"
							value={centsToInput(l.amountMinor)}
							onchange={submitForm}
						/>
					</form>
					<form method="POST" action="?/removeLine" use:enhance={keep} class="shrink-0">
						<input type="hidden" name="id" value={l.id} />
						<button
							class="flex h-8 w-8 items-center justify-center rounded-full bg-ground text-sm text-muted hover:bg-danger-tint hover:text-danger"
							aria-label="Remove {l.label}"
							title="Remove">✕</button
						>
					</form>
				{/if}
			</li>
		{/each}
	</ul>

	{#if left !== 0 || home}
		<div class="mt-4 flex flex-wrap items-center justify-between gap-2">
			{#if left > 0}
				<form method="POST" action="?/allocateLeftover" use:enhance={keep}>
					<input type="hidden" name="paycheckId" value={paycheck.id} />
					<button class="btn-secondary">Use {formatMoney(left)} as spending money</button>
				</form>
			{:else if left < 0}
				<p class="text-sm font-medium text-danger">
					This plan spends more than the paycheck. Lower a line or remove one.
				</p>
			{/if}
			{#if home}
				<a class="link ml-auto text-sm" href="/paychecks/{paycheck.id}">Open plan →</a>
			{/if}
		</div>
	{/if}
</section>
