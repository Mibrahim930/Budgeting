<script lang="ts">
	import { enhance } from '$app/forms';
	import Money from './Money.svelte';

	type Item = {
		id: string;
		date: string;
		amountMinor: number;
		payeeName: string | null;
		description: string | null;
		memo: string | null;
		categoryName: string | null;
		accountName: string;
		transferAccountName: string | null;
		isParent: boolean;
		cleared: boolean;
		reconciled: boolean;
		pending: boolean;
		splits: { id: string; amountMinor: number; categoryName: string | null }[];
	};

	let { items, showAccount = true }: { items: Item[]; showAccount?: boolean } = $props();
</script>

<ul class="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
	{#each items as t (t.id)}
		<li class="flex items-start gap-3 px-3 py-2.5 text-sm">
			<form method="POST" action="?/toggleCleared" use:enhance class="pt-0.5">
				<input type="hidden" name="id" value={t.id} />
				<input type="hidden" name="cleared" value={String(!t.cleared)} />
				<button
					class="flex h-5 w-5 items-center justify-center rounded-full border text-[10px] {t.reconciled
						? 'border-teal-700 bg-teal-700 text-white'
						: t.cleared
							? 'border-emerald-600 bg-emerald-50 text-emerald-700'
							: 'border-slate-300 text-transparent'}"
					title={t.reconciled ? 'Reconciled' : t.cleared ? 'Cleared' : 'Not cleared'}
					aria-label={t.cleared ? 'Mark not cleared' : 'Mark cleared'}
					disabled={t.reconciled}>{t.reconciled ? '🔒' : '✓'}</button
				>
			</form>
			<a href="/transactions/{t.id}" class="min-w-0 flex-1">
				<div class="flex items-baseline justify-between gap-2">
					<span class="truncate font-medium">
						{t.payeeName ?? t.description ?? (t.transferAccountName ? 'Transfer' : 'No payee')}
					</span>
					<span class="shrink-0"><Money cents={t.amountMinor} colored /></span>
				</div>
				<div class="flex flex-wrap gap-x-2 text-xs text-slate-500">
					<span>{t.date}</span>
					{#if showAccount}<span>· {t.accountName}</span>{/if}
					{#if t.transferAccountName}
						<span>· {t.amountMinor < 0 ? 'to' : 'from'} {t.transferAccountName}</span>
					{:else if t.isParent}
						<span>· Split: {t.splits.map((s) => s.categoryName ?? 'Uncategorized').join(', ')}</span
						>
					{:else if t.categoryName}
						<span>· {t.categoryName}</span>
					{:else}
						<span class="font-medium text-amber-700">· Uncategorized</span>
					{/if}
					{#if t.pending}<span class="text-slate-400">· pending</span>{/if}
					{#if t.memo}<span class="truncate">· {t.memo}</span>{/if}
				</div>
			</a>
		</li>
	{:else}
		<li class="px-3 py-6 text-center text-sm text-slate-500">No transactions.</li>
	{/each}
</ul>
