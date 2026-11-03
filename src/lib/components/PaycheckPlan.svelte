<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { centsToInput, formatMoney } from '$lib/money';
	import { dateParts } from '$lib/month';
	import { dayLabel, monthName } from '$lib/planner/describe';
	import type { LineDetail, PaycheckDetail } from '$lib/server/repo/paychecks';
	import Money from './Money.svelte';
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

	const statClass = $derived(
		left < 0 ? 'text-red-600' : left > 0 ? 'text-amber-700' : 'text-emerald-700'
	);
</script>

<section class="card" aria-labelledby="plan-heading-{uid}">
	<div class="flex flex-wrap items-start justify-between gap-2">
		<h2 id="plan-heading-{uid}" class="font-medium">
			Paycheck · {dayLabel(paycheck.date)} · <Money cents={paycheck.amountMinor} />
		</h2>
		<StatusPill status={paycheck.status} />
	</div>
	<p class="mt-0.5 text-xs text-slate-500">
		Covers bills due until {dayLabel(paycheck.windowEnd)}{paycheck.note
			? ` · ${paycheck.note}`
			: ''}
	</p>

	<dl class="mt-3 grid grid-cols-3 gap-2 text-center">
		<div class="rounded-md bg-slate-50 px-2 py-2">
			<dt class="text-xs text-slate-500">Pay</dt>
			<dd class="text-sm font-medium sm:text-base"><Money cents={paycheck.amountMinor} /></dd>
		</div>
		<div class="rounded-md bg-slate-50 px-2 py-2">
			<dt class="text-xs text-slate-500">Allocated</dt>
			<dd class="text-sm font-medium sm:text-base">
				<Money cents={paycheck.totals.allocated} />
			</dd>
		</div>
		<div
			class="rounded-md px-2 py-2 {left < 0
				? 'bg-red-50'
				: left > 0
					? 'bg-amber-50'
					: 'bg-emerald-50'}"
		>
			<dt class="text-xs text-slate-500">Left to allocate</dt>
			<dd class="text-sm font-semibold sm:text-base {statClass}" data-testid="left-to-allocate">
				{formatMoney(left)}
			</dd>
		</div>
	</dl>
	{#if left < 0}
		<p class="mt-2 text-sm font-medium text-red-600" role="status">
			Over-allocated by {formatMoney(-left)}
		</p>
	{/if}

	<ul class="mt-3 divide-y divide-slate-100 border-y border-slate-100" aria-label="Plan checklist">
		<li class="flex items-center gap-3 py-2.5">
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
					class="h-5 w-5 accent-teal-700"
					aria-label="Paycheck received"
					checked={paycheck.incomeConfirmed}
					onchange={submitForm}
				/>
			</form>
			<label for="income-{uid}" class="min-w-0 grow cursor-pointer">
				<span class="block text-sm font-medium">Paycheck received</span>
				<span class="block text-xs text-slate-500">
					into {paycheck.accountName} · {dayLabel(paycheck.date)}
				</span>
			</label>
			<span class="shrink-0 text-sm font-medium">
				{#if paycheck.incomeTxnId}
					<a href="/transactions/{paycheck.incomeTxnId}" class="hover:underline">
						<Money cents={paycheck.amountMinor} colored />
					</a>
				{:else}
					<Money cents={paycheck.amountMinor} />
				{/if}
			</span>
			<span class="w-6 shrink-0"></span>
		</li>

		{#each paycheck.lines as l (l.id)}
			{@const done = l.status === 'done'}
			{@const boxId = `line-${l.id}-${uid}`}
			<li class="flex items-center gap-3 py-2.5">
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
						class="h-5 w-5 accent-teal-700"
						aria-label={l.label}
						checked={done}
						onchange={submitForm}
					/>
				</form>
				<label for={boxId} class="min-w-0 grow cursor-pointer">
					<span class="block truncate text-sm font-medium {done ? 'text-slate-500' : ''}">
						{l.label}
					</span>
					{#if l.kind === 'spending' && l.spentMinor !== null}
						{@const pct =
							l.amountMinor > 0 ? Math.min(100, (l.spentMinor / l.amountMinor) * 100) : 100}
						<span class="block text-xs text-slate-500">
							spent {formatMoney(l.spentMinor)} of {formatMoney(l.amountMinor)}
						</span>
						<span class="mt-1 block h-1 w-full max-w-40 overflow-hidden rounded bg-slate-100">
							<span
								class="block h-full {l.spentMinor > l.amountMinor ? 'bg-red-500' : 'bg-teal-600'}"
								style="width: {pct}%"
							></span>
						</span>
					{:else}
						<span class="block truncate text-xs text-slate-500">{subText(l)}</span>
					{/if}
				</label>
				{#if done}
					<span class="shrink-0 text-sm font-medium">
						{#if l.txnId}
							<a href="/transactions/{l.txnId}" class="hover:underline" title="View transaction">
								<Money cents={l.amountMinor} />
							</a>
						{:else}
							<Money cents={l.amountMinor} />
						{/if}
					</span>
					<span class="w-6 shrink-0"></span>
				{:else}
					<form method="POST" action="?/updateLine" use:enhance={keep} class="shrink-0">
						<input type="hidden" name="id" value={l.id} />
						<input
							class="input w-24 py-1 text-right tabular-nums"
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
							class="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-red-600"
							aria-label="Remove {l.label}"
							title="Remove">✕</button
						>
					</form>
				{/if}
			</li>
		{/each}
	</ul>

	<div class="mt-3 flex flex-wrap items-center justify-between gap-2">
		{#if left > 0}
			<form method="POST" action="?/allocateLeftover" use:enhance={keep}>
				<input type="hidden" name="paycheckId" value={paycheck.id} />
				<button class="btn-secondary">Use {formatMoney(left)} as spending money</button>
			</form>
		{:else if left === 0}
			<p class="text-sm font-medium text-emerald-700">Every dollar has a job</p>
		{:else}
			<p class="text-sm font-medium text-red-600">
				This plan spends more than the paycheck. Lower a line or remove one.
			</p>
		{/if}
		{#if home}
			<a class="text-sm text-teal-700 hover:underline" href="/paychecks/{paycheck.id}"
				>Open plan →</a
			>
		{/if}
	</div>
</section>
