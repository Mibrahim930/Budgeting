<script lang="ts">
	import type { AccountOption, CategoryGroupOption } from './types';

	let {
		groups,
		value = $bindable(''),
		name,
		id,
		transferAccounts = [],
		allowSplit = false,
		placeholder = 'Uncategorized'
	}: {
		groups: CategoryGroupOption[];
		value?: string;
		name?: string;
		id?: string;
		transferAccounts?: AccountOption[];
		allowSplit?: boolean;
		placeholder?: string;
	} = $props();
</script>

<select class="input" {name} {id} bind:value>
	<option value="">{placeholder}</option>
	{#if allowSplit}<option value="split">Split across categories…</option>{/if}
	{#each groups as g (g.id)}
		<optgroup label={g.name}>
			{#each g.categories as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
		</optgroup>
	{/each}
	{#if transferAccounts.length}
		<optgroup label="Transfer to / from">
			{#each transferAccounts as a (a.id)}<option value={`transfer:${a.id}`}>{a.name}</option
				>{/each}
		</optgroup>
	{/if}
</select>
