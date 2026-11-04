<script lang="ts">
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

<h1 class="mb-4 display">Settings</h1>

<div class="space-y-4">
	<section class="card">
		<h2 class="mb-1 text-sm font-extrabold">Account</h2>
		<p class="text-sm text-muted">{data.user.name} · {data.user.email}</p>
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
		<h2 class="mb-1 text-sm font-extrabold">Pay schedule</h2>
		<p class="mb-3 text-sm text-muted">
			How often you're paid, your typical take-home pay and where it lands.
		</p>
		<a class="btn-secondary" href="/settings/pay">Edit pay schedule</a>
	</section>

	<section class="card">
		<h2 class="mb-1 text-sm font-extrabold">Bank sync</h2>
		<p class="mb-3 text-sm text-muted">
			Pull transactions from your bank automatically through SimpleFIN.
		</p>
		<a class="btn-secondary" href="/settings/bank">Manage bank sync</a>
	</section>

	<section class="card">
		<h2 class="mb-1 text-sm font-extrabold">Categories</h2>
		<p class="mb-3 text-sm text-muted">Add, rename or hide the categories for your spending.</p>
		<a class="btn-secondary" href="/categories">Manage categories</a>
	</section>

	<section class="card">
		<h2 class="mb-1 text-sm font-extrabold">Passkeys</h2>
		<p class="mb-3 text-sm text-muted">
			Sign in with your fingerprint, face or device PIN instead of a password.
		</p>
		{#if passkeyError}<p class="error mb-2">{passkeyError}</p>{/if}
		<ul class="mb-3 divide-y divide-hairline text-sm">
			{#each passkeys as pk (pk.id)}
				<li class="flex items-center justify-between py-2">
					<span>{pk.name || 'Passkey'}</span>
					<button class="text-danger hover:underline" onclick={() => removePasskey(pk.id)}
						>Remove</button
					>
				</li>
			{:else}
				<li class="py-2 text-muted">No passkeys yet.</li>
			{/each}
		</ul>
		<button class="btn-secondary" onclick={addPasskey}>Add a passkey</button>
	</section>

	<section class="card border-danger-tint">
		<h2 class="mb-1 text-sm font-extrabold text-danger">Delete my account</h2>
		<p class="mb-3 text-sm text-muted">
			Permanently deletes your accounts, transactions, paycheck plans, bills, rules and bank
			connections. This can't be undone.
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
