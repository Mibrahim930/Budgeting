<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	let busy = $state(false);
	const track = () => {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			busy = false;
			await update();
		};
	};
</script>

<a href="/settings" class="text-sm text-slate-500 hover:underline">← Settings</a>
<h1 class="mb-4 text-xl font-semibold">Bank sync</h1>

{#if form?.error}<p class="error mb-3">{form.error}</p>{/if}
{#if form?.synced}
	<p class="mb-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
		Synced: {form.synced.added} new transaction{form.synced.added === 1 ? '' : 's'}.
		{#if form.synced.errors.length}<br />Bank messages: {form.synced.errors.join(' ')}{/if}
	</p>
{/if}

{#each data.connections as c (c.id)}
	<section class="card mb-3">
		<div class="flex flex-wrap items-start justify-between gap-2">
			<div>
				<p class="font-medium">{c.label}</p>
				<p class="text-sm text-slate-500">
					{c.accounts.length ? `Linked: ${c.accounts.join(', ')}` : 'No accounts linked yet'}
				</p>
				<p class="text-xs text-slate-500">
					{c.lastSyncedAt
						? `Last synced ${new Date(c.lastSyncedAt).toLocaleString()}`
						: 'Never synced'}
				</p>
				{#if c.status === 'error'}<p class="mt-1 text-sm text-red-600">{c.error}</p>{/if}
			</div>
			<div class="flex gap-2">
				<form method="POST" action="?/sync" use:enhance={track}>
					<input type="hidden" name="id" value={c.id} />
					<button class="btn" disabled={busy}>{busy ? 'Syncing…' : 'Sync now'}</button>
				</form>
				<a class="btn-secondary" href="/settings/bank/{c.id}">Accounts</a>
			</div>
		</div>
		<form
			method="POST"
			action="?/remove"
			use:enhance
			class="mt-2"
			onsubmit={(e) => {
				if (!confirm('Disconnect? Linked accounts keep their transactions.')) e.preventDefault();
			}}
		>
			<input type="hidden" name="id" value={c.id} />
			<button class="text-sm text-red-600 hover:underline">Disconnect</button>
		</form>
	</section>
{/each}

<section class="card">
	<h2 class="mb-2 font-medium">Connect with SimpleFIN</h2>
	<ol class="mb-3 list-decimal space-y-1 pl-5 text-sm text-slate-600">
		<li>
			Sign up at <a
				class="text-teal-700 underline"
				href="https://bridge.simplefin.org"
				target="_blank"
				rel="noreferrer">SimpleFIN Bridge</a
			>
			(about $15/year) and connect your banks there.
		</li>
		<li>In SimpleFIN, create a new <b>setup token</b> and copy it.</li>
		<li>Paste it below. It can only be used once.</li>
	</ol>
	<p class="mb-3 text-xs text-slate-500">
		Your bank password goes to SimpleFIN, never to this app. This app stores only SimpleFIN's
		read-only access link, encrypted. Transactions sync automatically every few hours.
	</p>
	<form
		method="POST"
		action="?/connect"
		use:enhance={track}
		class="flex flex-col gap-2 sm:flex-row"
	>
		<input
			class="input font-mono"
			name="token"
			placeholder="Setup token"
			aria-label="Setup token"
			required
		/>
		<button class="btn shrink-0" disabled={busy}>Connect</button>
	</form>
</section>
