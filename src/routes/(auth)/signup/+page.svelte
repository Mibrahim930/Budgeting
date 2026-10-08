<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
</script>

<h1 class="mb-4 text-lg font-semibold">
	{data.isFirstUser ? 'Create the admin account' : 'Create your account'}
</h1>

{#if !data.isFirstUser && !data.inviteValid}
	<p class="error" role="alert">
		Sign-up is invite-only. This invite link is missing, already used or expired.
	</p>
	<p class="mt-4 text-sm"><a class="text-teal-700 underline" href="/login">Back to sign in</a></p>
{:else}
	<form method="POST" class="card space-y-4" use:enhance>
		{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
		<input type="hidden" name="invite" value={data.invite ?? ''} />
		<div>
			<label class="label" for="name">Name</label>
			<input class="input" id="name" name="name" required value={form?.name ?? ''} />
		</div>
		<div>
			<label class="label" for="email">Email</label>
			<input
				class="input"
				id="email"
				name="email"
				type="email"
				autocomplete="username"
				required
				value={form?.email ?? ''}
			/>
		</div>
		<div>
			<label class="label" for="password">Password (10+ characters)</label>
			<input
				class="input"
				id="password"
				name="password"
				type="password"
				autocomplete="new-password"
				minlength="10"
				required
			/>
		</div>
		<button class="btn w-full">Create account</button>
	</form>
	<p class="mt-4 text-center text-xs text-slate-500">
		See <a class="underline" href="/privacy">what this app stores</a>.
	</p>
{/if}
