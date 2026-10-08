<script lang="ts">
	import { goto } from '$app/navigation';
	import { authClient } from '$lib/auth-client';

	let { data } = $props();
	let email = $state('');
	let password = $state('');
	let error = $state('');
	let busy = $state(false);

	async function signIn(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		error = '';
		const res = await authClient.signIn.email({ email, password });
		busy = false;
		if (res.error) error = res.error.message ?? 'Sign-in failed';
		else await goto(data.next, { invalidateAll: true });
	}

	async function signInWithPasskey() {
		error = '';
		const res = await authClient.signIn.passkey();
		if (res?.error) error = res.error.message ?? 'Passkey sign-in failed';
		else await goto(data.next, { invalidateAll: true });
	}
</script>

<h1 class="mb-4 text-lg font-semibold">Sign in</h1>
<form class="card space-y-4" onsubmit={signIn}>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	<div>
		<label class="label" for="email">Email</label>
		<input
			class="input"
			id="email"
			type="email"
			autocomplete="username webauthn"
			required
			bind:value={email}
		/>
	</div>
	<div>
		<label class="label" for="password">Password</label>
		<input
			class="input"
			id="password"
			type="password"
			autocomplete="current-password"
			required
			bind:value={password}
		/>
	</div>
	<button class="btn w-full" disabled={busy}>Sign in</button>
	<button type="button" class="btn-secondary w-full" onclick={signInWithPasskey}>
		Sign in with a passkey
	</button>
</form>
<p class="mt-4 text-center text-sm text-slate-500">
	New here? Ask the person who runs this app for an invite link.
</p>
