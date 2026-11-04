<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		value,
		size = 56,
		stroke = 5,
		color = 'var(--color-accent)',
		track = 'var(--color-tonal)',
		label,
		children
	}: {
		/** 0..100, clamped. */
		value: number;
		size?: number;
		/** In viewBox units (the ring is 42 across). */
		stroke?: number;
		color?: string;
		track?: string;
		/** Accessible name; without one the ring is decorative. */
		label?: string;
		/** Centre content, rendered as HTML over the ring. */
		children?: Snippet;
	} = $props();

	// r = 15.9 makes the circumference ~100, so the dash pattern reads in percent.
	const v = $derived(Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0)));
</script>

<div
	class="relative inline-grid shrink-0 place-items-center"
	style:width="{size}px"
	style:height="{size}px"
>
	<svg
		viewBox="0 0 42 42"
		class="absolute inset-0 h-full w-full"
		role={label ? 'img' : undefined}
		aria-label={label}
		aria-hidden={label ? undefined : 'true'}
	>
		<circle cx="21" cy="21" r="15.9" fill="none" stroke-width={stroke} style:stroke={track} />
		{#if v > 0}
			<circle
				cx="21"
				cy="21"
				r="15.9"
				fill="none"
				stroke-width={stroke}
				style:stroke={color}
				stroke-dasharray="{v} {100 - v}"
				stroke-dashoffset="25"
				stroke-linecap="round"
			/>
		{/if}
	</svg>
	{#if children}
		<div class="relative text-center leading-none">{@render children()}</div>
	{/if}
</div>
