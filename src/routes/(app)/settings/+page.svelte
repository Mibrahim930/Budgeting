<script lang="ts">
	import { enhance } from '$app/forms';
	import { authClient } from '$lib/auth-client';
	import { onMount } from 'svelte';

	let { data, form } = $props();

	type PasskeyItem = { id: string; name?: string | null; createdAt: Date | string | null };
	let passkeys = $state<PasskeyItem[]>([]);
	let passkeyError = $state('');

	async function loadPasskeys() {
		const res = await authClient.passkey.listUserPasskeys();
		passkeys = (res.data ?? []) as PasskeyItem[];
	}

	async function addPasskey() {
		passkeyError = '';
		const res = await authClient.passkey.addPasskey({ name: navigator.platform || 'Passkey' });
		if (res?.error) passkeyError = res.error.message ?? 'Could not add passkey';
		await loadPasskeys();
	}

	async function removePasskey(id: string) {
		await authClient.passkey.deletePasskey({ id });
		await loadPasskeys();
	}

	onMount(loadPasskeys);
</script>

<h1 class="mb-4 text-xl font-semibold">Settings</h1>

<div class="space-y-4">
	<section class="card">
		<h2 class="mb-1 font-medium">Account</h2>
		<p class="text-sm text-slate-600">{data.user.name} · {data.user.email}</p>
		<form
			method="POST"
			action="?/signOut"
			class="mt-3"
			onsubmit={() => navigator.serviceWorker?.controller?.postMessage('clear-pages')}
		>
			<button class="btn-secondary">Sign out</button>
		</form>
	</section>

	<section class="card">
		<h2 class="mb-1 font-medium">Bank sync</h2>
		<p class="mb-3 text-sm text-slate-600">
			Pull transactions from your bank automatically through SimpleFIN.
		</p>
		<a class="btn-secondary" href="/settings/bank">Manage bank sync</a>
	</section>

	<section class="card">
		<h2 class="mb-1 font-medium">Budget style</h2>
		<form method="POST" action="?/budgetMode" use:enhance class="space-y-2 text-sm">
			<label class="flex items-start gap-2">
				<input
					type="radio"
					name="mode"
					value="envelope"
					checked={data.user.budgetMode === 'envelope'}
				/>
				<span
					><b>Envelope (zero-based).</b> Give every dollar of income a job. Unspent money rolls over;
					overspending comes out of next month's money to budget.</span
				>
			</label>
			<label class="flex items-start gap-2">
				<input
					type="radio"
					name="mode"
					value="limits"
					checked={data.user.budgetMode === 'limits'}
				/>
				<span
					><b>Monthly limits.</b> Set a spending limit per category each month and track against it. Nothing
					rolls over.</span
				>
			</label>
			<button class="btn">Save</button>
		</form>
	</section>

	<section class="card">
		<h2 class="mb-1 font-medium">Passkeys</h2>
		<p class="mb-3 text-sm text-slate-600">
			Sign in with your fingerprint, face or device PIN instead of a password.
		</p>
		{#if passkeyError}<p class="error mb-2">{passkeyError}</p>{/if}
		<ul class="mb-3 divide-y divide-slate-100 text-sm">
			{#each passkeys as pk (pk.id)}
				<li class="flex items-center justify-between py-2">
					<span>{pk.name || 'Passkey'}</span>
					<button class="text-red-600 hover:underline" onclick={() => removePasskey(pk.id)}
						>Remove</button
					>
				</li>
			{:else}
				<li class="py-2 text-slate-500">No passkeys yet.</li>
			{/each}
		</ul>
		<button class="btn-secondary" onclick={addPasskey}>Add a passkey</button>
	</section>

	<section class="card border-red-200">
		<h2 class="mb-1 font-medium text-red-700">Delete my account</h2>
		<p class="mb-3 text-sm text-slate-600">
			Permanently deletes your accounts, transactions, budgets, rules and bank connections. This
			can't be undone.
		</p>
		{#if form && 'deleteError' in form}<p class="error mb-2">{form.deleteError}</p>{/if}
		<form
			method="POST"
			action="?/deleteAccount"
			class="flex flex-col gap-2 sm:flex-row"
			onsubmit={() => navigator.serviceWorker?.controller?.postMessage('clear-pages')}
		>
			<input
				class="input"
				name="confirmEmail"
				placeholder="Type your email to confirm"
				aria-label="Type your email to confirm"
				autocomplete="off"
			/>
			<button class="btn-danger shrink-0">Delete everything</button>
		</form>
	</section>
</div>
