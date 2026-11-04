<script lang="ts">
	import { afterNavigate } from '$app/navigation';

	type Link = { href: string; label: string };
	let {
		tabs,
		more,
		isActive
	}: { tabs: Link[]; more: Link[]; isActive: (href: string) => boolean } = $props();

	let moreOpen = $state(false);
	const moreActive = $derived(more.some((l) => isActive(l.href)));

	afterNavigate(() => {
		moreOpen = false;
	});
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape') moreOpen = false;
	}}
/>

<div
	class="fixed inset-x-0 bottom-0 z-20 px-4 pb-[max(env(safe-area-inset-bottom),12px)] md:hidden"
>
	<nav
		aria-label="Main"
		class="mx-auto grid max-w-md grid-cols-5 gap-1 rounded-row border border-hairline bg-surface p-1.5 text-xs font-extrabold shadow-soft"
	>
		{#each tabs as tab (tab.href)}
			{@const active = isActive(tab.href)}
			<a
				href={tab.href}
				class="flex min-h-11 items-center justify-center rounded-[13px] {active
					? 'bg-accent text-white'
					: 'text-muted hover:text-ink'}"
				aria-current={active ? 'page' : undefined}>{tab.label}</a
			>
		{/each}
		<details bind:open={moreOpen} class="relative">
			<summary
				class="flex min-h-11 cursor-pointer list-none items-center justify-center rounded-[13px] [&::-webkit-details-marker]:hidden {moreActive ||
				moreOpen
					? 'bg-accent text-white'
					: 'text-muted hover:text-ink'}">More</summary
			>
			<ul
				class="absolute right-0 bottom-full mb-2 w-56 rounded-card border border-hairline bg-surface p-2 text-sm shadow-soft"
			>
				{#each more as link (link.href)}
					{@const active = isActive(link.href)}
					<li>
						<a
							href={link.href}
							class="flex min-h-11 items-center rounded-control px-3 {active
								? 'bg-tonal font-extrabold text-accent'
								: 'font-bold text-ink hover:bg-ground'}"
							aria-current={active ? 'page' : undefined}>{link.label}</a
						>
					</li>
				{/each}
			</ul>
		</details>
	</nav>
</div>
