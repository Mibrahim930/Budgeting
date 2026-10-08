<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	const keep =
		() =>
		async ({ update }: { update: (o: { reset: boolean }) => Promise<void> }) =>
			update({ reset: false });
	const confirmArchive = (e: SubmitEvent) => {
		if (!confirm('Hide this from your budget? Past transactions keep their category.'))
			e.preventDefault();
	};
</script>

<a href="/budget" class="text-sm text-slate-500 hover:underline">← Budget</a>
<h1 class="mb-4 text-xl font-semibold">Categories</h1>
{#if form?.error}<p class="error mb-3">{form.error}</p>{/if}

<div class="space-y-4">
	{#each data.groups as g (g.id)}
		<section class="card">
			<div class="mb-2 flex items-center gap-2">
				<form method="POST" action="?/renameGroup" use:enhance={keep} class="grow">
					<input type="hidden" name="id" value={g.id} />
					<input
						class="input font-semibold"
						name="name"
						value={g.name}
						aria-label="Group name"
						onchange={(e) => e.currentTarget.form?.requestSubmit()}
					/>
				</form>
				{#if g.isIncome}
					<span class="text-xs text-slate-500">Income</span>
				{:else}
					<form method="POST" action="?/archiveGroup" use:enhance onsubmit={confirmArchive}>
						<input type="hidden" name="id" value={g.id} />
						<button class="text-sm text-red-600 hover:underline">Hide group</button>
					</form>
				{/if}
			</div>
			<ul class="space-y-1 pl-3">
				{#each g.categories as c (c.id)}
					<li class="flex items-center gap-2">
						<form method="POST" action="?/renameCategory" use:enhance={keep} class="grow">
							<input type="hidden" name="id" value={c.id} />
							<input
								class="input"
								name="name"
								value={c.name}
								aria-label="Category name"
								onchange={(e) => e.currentTarget.form?.requestSubmit()}
							/>
						</form>
						<form method="POST" action="?/archiveCategory" use:enhance onsubmit={confirmArchive}>
							<input type="hidden" name="id" value={c.id} />
							<button class="text-sm text-slate-500 hover:text-red-600" aria-label="Hide {c.name}"
								>Hide</button
							>
						</form>
					</li>
				{/each}
				<li>
					<form method="POST" action="?/addCategory" use:enhance class="flex gap-2">
						<input type="hidden" name="id" value={g.id} />
						<input
							class="input"
							name="name"
							placeholder="New category"
							aria-label="New category in {g.name}"
						/>
						<button class="btn-secondary">Add</button>
					</form>
				</li>
			</ul>
		</section>
	{/each}

	<form method="POST" action="?/addGroup" use:enhance class="card flex gap-2">
		<input class="input" name="name" placeholder="New group" aria-label="New group" />
		<button class="btn">Add group</button>
	</form>
</div>
