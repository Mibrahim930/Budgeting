<script lang="ts">
	import type { Snippet } from 'svelte';

	type Segment = { key: string; label: string; value: number; color: string };
	let {
		segments,
		total,
		size = 132,
		stroke = 5,
		label,
		children
	}: {
		segments: readonly Segment[];
		/** What a full circle stands for; the unfilled track is the unallocated part. */
		total: number;
		size?: number;
		/** In viewBox units (the donut is 42 across). */
		stroke?: number;
		/** Accessible name: should list every amount. */
		label: string;
		children?: Snippet;
	} = $props();

	// r = 15.9 makes the circumference ~100, so dash lengths are percentages of the circle.
	const arcs = $derived.by(() => {
		const sum = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
		const scale = Math.max(total, sum, 1);
		let offset = 25;
		return segments
			.filter((x) => x.value > 0)
			.map((x) => {
				const pct = (x.value / scale) * 100;
				const arc = { key: x.key, color: x.color, dash: `${pct} ${100 - pct}`, offset };
				offset -= pct;
				return arc;
			});
	});
</script>

<div
	class="relative inline-grid shrink-0 place-items-center"
	style:width="{size}px"
	style:height="{size}px"
>
	<svg viewBox="0 0 42 42" class="absolute inset-0 h-full w-full" role="img" aria-label={label}>
		<circle
			cx="21"
			cy="21"
			r="15.9"
			fill="none"
			stroke-width={stroke}
			style:stroke="var(--color-tonal)"
		/>
		{#each arcs as a (a.key)}
			<circle
				cx="21"
				cy="21"
				r="15.9"
				fill="none"
				stroke-width={stroke}
				style:stroke={a.color}
				stroke-dasharray={a.dash}
				stroke-dashoffset={a.offset}
			/>
		{/each}
	</svg>
	{#if children}
		<div class="relative text-center leading-none">{@render children()}</div>
	{/if}
</div>
