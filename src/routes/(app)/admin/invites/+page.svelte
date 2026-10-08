<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	const link = (code: string) => `${data.origin}/signup?invite=${code}`;
	const fmt = (d: Date | null) => (d ? new Date(d).toLocaleDateString() : '');
</script>

<div class="mb-4 flex items-center justify-between">
	<h1 class="text-xl font-semibold">Invites</h1>
	<form method="POST" action="?/create" use:enhance>
		<button class="btn">New invite link</button>
	</form>
</div>

{#if form?.created}
	<div class="card mb-4">
		<p class="mb-2 text-sm">Send this link to a friend. It works once and expires in 7 days.</p>
		<input
			class="input font-mono"
			readonly
			value={link(form.created)}
			onfocus={(e) => e.currentTarget.select()}
		/>
	</div>
{/if}

<div class="card overflow-x-auto p-0">
	<table class="w-full text-sm">
		<thead class="bg-slate-50 text-left text-slate-500">
			<tr
				><th class="p-3">Code</th><th class="p-3">Status</th><th class="p-3">Expires</th><th
				></th></tr
			>
		</thead>
		<tbody>
			{#each data.invites as inv (inv.code)}
				<tr class="border-t border-slate-100">
					<td class="p-3 font-mono">{inv.code.slice(0, 8)}…</td>
					<td class="p-3">
						{#if inv.usedAt}Used by {inv.usedByEmail ?? 'deleted user'}
						{:else if new Date(inv.expiresAt) < new Date()}Expired
						{:else}Open{/if}
					</td>
					<td class="p-3">{fmt(inv.expiresAt)}</td>
					<td class="p-3 text-right">
						{#if !inv.usedAt}
							<form method="POST" action="?/revoke" use:enhance>
								<input type="hidden" name="code" value={inv.code} />
								<button class="text-red-600 hover:underline">Revoke</button>
							</form>
						{/if}
					</td>
				</tr>
			{:else}
				<tr><td class="p-3 text-slate-500" colspan="4">No invites yet.</td></tr>
			{/each}
		</tbody>
	</table>
</div>
