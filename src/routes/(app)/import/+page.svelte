<script lang="ts">
	import { enhance } from '$app/forms';
	import Money from '$lib/components/Money.svelte';
	import {
		applyMapping,
		DATE_FORMATS,
		guessMapping,
		parseCsv,
		type CsvMapping
	} from '$lib/import/csv';
	import { isOfx, parseOfx } from '$lib/import/ofx';

	let { data, form } = $props();

	let chosenAccount = $state('');
	const accountId = $derived(chosenAccount || data.accounts[0]?.id || '');
	let fileName = $state('');
	let content = $state('');
	let mapping = $state<CsvMapping | null>(null);
	let busy = $state(false);

	const ofx = $derived(content && isOfx(content));
	const csvRows = $derived(content && !ofx ? parseCsv(content) : []);
	const columns = $derived(
		csvRows.length
			? csvRows[0].map((h, i) => (mapping?.hasHeader ? h || `Column ${i + 1}` : `Column ${i + 1}`))
			: []
	);
	const preview = $derived.by(() => {
		if (!content) return null;
		if (ofx) return { rows: parseOfx(content).rows, errors: [] };
		return mapping ? applyMapping(csvRows, mapping) : null;
	});

	async function onFile(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		fileName = file.name;
		content = await file.text();
		if (!isOfx(content)) {
			const rows = parseCsv(content);
			const saved = data.accounts.find((a) => a.id === accountId)?.csvMapping;
			mapping = saved && saved.columns === rows[0]?.length ? saved : guessMapping(rows);
		}
	}
</script>

<h1 class="mb-4 display">Import from your bank</h1>

{#if !data.accounts.length}
	<p class="card text-sm">
		Create an <a class="link" href="/accounts">account</a> first.
	</p>
{:else}
	<form
		method="POST"
		action="?/import"
		class="card mb-6 space-y-4"
		use:enhance={() => {
			busy = true;
			return async ({ result, update }) => {
				busy = false;
				await update();
				if (result.type === 'success') {
					content = '';
					fileName = '';
					mapping = null;
				}
			};
		}}
	>
		{#if form?.error}<p class="error">{form.error}</p>{/if}
		{#if form?.result}
			<p class="rounded-control bg-good-tint px-3 py-2 text-sm text-good" role="status">
				Imported {form.result.added} new, linked {form.result.updated} existing, skipped
				{form.result.skipped} already imported.
			</p>
		{/if}
		<p class="text-sm text-muted">
			Download a CSV, OFX or QFX file from your bank's website and choose it here. Transactions you
			already have are skipped automatically.
		</p>
		<div class="grid gap-3 sm:grid-cols-2">
			<div>
				<label class="label" for="i-account">Into account</label>
				<select
					class="input"
					id="i-account"
					name="accountId"
					value={accountId}
					onchange={(e) => (chosenAccount = e.currentTarget.value)}
				>
					{#each data.accounts as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
				</select>
			</div>
			<div>
				<label class="label" for="i-file">File</label>
				<input
					class="input"
					id="i-file"
					type="file"
					accept=".csv,.ofx,.qfx,.txt"
					onchange={onFile}
				/>
			</div>
		</div>
		<input type="hidden" name="content" value={content} />
		<input type="hidden" name="fileName" value={fileName} />
		<input type="hidden" name="mapping" value={JSON.stringify(mapping)} />

		{#if mapping && !ofx}
			<fieldset class="grid gap-3 rounded-control border border-hairline p-3 sm:grid-cols-3">
				<legend class="px-1 text-xs font-extrabold text-muted">Columns</legend>
				<label class="flex items-center gap-2 text-sm sm:col-span-3">
					<input type="checkbox" class="h-5 w-5 accent-accent" bind:checked={mapping.hasHeader} /> First
					row is a header
				</label>
				<div>
					<label class="label" for="m-date">Date</label>
					<select class="input" id="m-date" bind:value={mapping.dateColumn}>
						{#each columns as c, i (i)}<option value={i}>{c}</option>{/each}
					</select>
				</div>
				<div>
					<label class="label" for="m-format">Date format</label>
					<select class="input" id="m-format" bind:value={mapping.dateFormat}>
						{#each DATE_FORMATS as f (f)}<option value={f}>{f}</option>{/each}
					</select>
				</div>
				<div>
					<label class="label" for="m-desc">Description</label>
					<select class="input" id="m-desc" bind:value={mapping.descriptionColumn}>
						{#each columns as c, i (i)}<option value={i}>{c}</option>{/each}
					</select>
				</div>
				<div>
					<label class="label" for="m-mode">Amounts</label>
					<select class="input" id="m-mode" bind:value={mapping.amountMode}>
						<option value="single">One amount column</option>
						<option value="split">Separate debit / credit</option>
					</select>
				</div>
				{#if mapping.amountMode === 'single'}
					<div>
						<label class="label" for="m-amount">Amount</label>
						<select class="input" id="m-amount" bind:value={mapping.amountColumn}>
							{#each columns as c, i (i)}<option value={i}>{c}</option>{/each}
						</select>
					</div>
				{:else}
					<div>
						<label class="label" for="m-debit">Debit (money out)</label>
						<select class="input" id="m-debit" bind:value={mapping.debitColumn}>
							{#each columns as c, i (i)}<option value={i}>{c}</option>{/each}
						</select>
					</div>
					<div>
						<label class="label" for="m-credit">Credit (money in)</label>
						<select class="input" id="m-credit" bind:value={mapping.creditColumn}>
							{#each columns as c, i (i)}<option value={i}>{c}</option>{/each}
						</select>
					</div>
				{/if}
				<label class="flex items-center gap-2 text-sm sm:col-span-3">
					<input
						type="checkbox"
						class="h-5 w-5 accent-accent"
						bind:checked={mapping.invertAmount}
					/>
					Purchases show as positive numbers (flip signs)
				</label>
			</fieldset>
		{/if}

		{#if preview}
			{#if preview.errors.length}
				<p class="error">
					{preview.errors.length} line(s) can't be read, e.g. line {preview.errors[0].line}:
					{preview.errors[0].message}
				</p>
			{/if}
			<div class="overflow-x-auto">
				<p class="mb-1 text-sm text-muted">
					{preview.rows.length} transactions found. Preview:
				</p>
				<table class="w-full text-sm">
					<tbody>
						{#each preview.rows.slice(0, 8) as r, i (i)}
							<tr class="border-t border-hairline">
								<td class="py-1 pr-3 whitespace-nowrap">{r.date}</td>
								<td class="py-1 pr-3">{r.description}</td>
								<td class="py-1 text-right"><Money cents={r.amountMinor} colored /></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}

		<button class="btn" disabled={!preview?.rows.length || busy}>
			{busy
				? 'Importing…'
				: `Import${preview?.rows.length ? ` ${preview.rows.length} transactions` : ''}`}
		</button>
	</form>
{/if}

{#if data.batches.length}
	<h2 class="mb-2 text-xs font-extrabold text-muted">Recent imports</h2>
	<ul
		class="divide-y divide-hairline overflow-hidden rounded-card border border-hairline bg-surface text-sm"
	>
		{#each data.batches as b (b.id)}
			<li class="flex items-center justify-between gap-2 px-3 py-2">
				<span>
					<span class="font-bold">{b.fileName ?? b.source}</span>
					<span class="text-muted"
						>→ {b.accountName} · {new Date(b.createdAt).toLocaleString()}</span
					>
					<span class="block text-xs text-muted">
						{b.added} added · {b.updated} linked · {b.skipped} skipped
					</span>
				</span>
				{#if b.undoneAt}
					<span class="text-xs text-muted">Undone</span>
				{:else if b.added > 0}
					<form method="POST" action="?/undo" use:enhance>
						<input type="hidden" name="batchId" value={b.id} />
						<button class="text-danger hover:underline">Undo</button>
					</form>
				{/if}
			</li>
		{/each}
	</ul>
{/if}
