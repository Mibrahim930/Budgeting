<script lang="ts">
	import Money from '$lib/components/Money.svelte';

	let { data, form } = $props();
	let busy = $state(false);
</script>

<a href="/settings/bank" class="link text-sm">← Bank sync</a>
<h1 class="mb-1 display">Link bank accounts</h1>
<p class="mb-4 text-sm text-muted">
	Choose where each bank account's transactions should go. New accounts start with the bank's
	balance and the last 90 days of transactions.
</p>

{#if data.loadError}<p class="error mb-3">{data.loadError}</p>{/if}
{#if form?.error}<p class="error mb-3">{form.error}</p>{/if}
{#if data.provider.errors.length}
	<p class="mb-3 rounded-control bg-warning-tint px-3 py-2 text-sm text-warning-ink">
		SimpleFIN says: {data.provider.errors.join(' ')}
	</p>
{/if}

{#if data.provider.accounts.length}
	<form method="POST" action="?/link" class="space-y-3" onsubmit={() => (busy = true)}>
		{#each data.provider.accounts as pa (pa.externalId)}
			<div class="card grid gap-2 sm:grid-cols-2 sm:items-center">
				<div>
					<p class="font-bold">{pa.name}</p>
					<p class="text-sm text-muted">{pa.orgName} · <Money cents={pa.balanceMinor} /></p>
				</div>
				<input type="hidden" name="externalId" value={pa.externalId} />
				<input
					type="hidden"
					name="name:{pa.externalId}"
					value={pa.orgName ? `${pa.orgName} ${pa.name}` : pa.name}
				/>
				<input type="hidden" name="balance:{pa.externalId}" value={pa.balanceMinor} />
				<select
					class="input"
					name="target:{pa.externalId}"
					aria-label="Link {pa.name}"
					value={pa.linkedAccountId ?? 'new'}
				>
					<option value="new">Create a new account</option>
					<option value="ignore">Don't sync</option>
					{#each data.accounts.filter((a) => !a.connectionId || a.id === pa.linkedAccountId) as a (a.id)}
						<option value={a.id}>Link to {a.name}</option>
					{/each}
				</select>
			</div>
		{/each}
		<button class="btn" disabled={busy}>{busy ? 'Syncing…' : 'Save and sync'}</button>
	</form>
{:else if !data.loadError}
	<p class="card text-sm text-muted">
		SimpleFIN has no accounts for this connection yet. Add your banks at bridge.simplefin.org.
	</p>
{/if}
