<script lang="ts">
	import { page } from '$app/state';
	import TabBar from '$lib/components/TabBar.svelte';

	let { data, children } = $props();

	const links = $derived([
		{ href: '/', label: 'Paychecks' },
		{ href: '/bills', label: 'Bills' },
		{ href: '/calendar', label: 'Calendar' },
		{ href: '/accounts', label: 'Accounts' },
		{ href: '/transactions', label: 'Transactions' },
		{ href: '/import', label: 'Import' },
		{ href: '/rules', label: 'Rules' },
		{ href: '/reports', label: 'Reports' },
		{ href: '/settings', label: 'Settings' },
		...(data.user.role === 'admin' ? [{ href: '/admin/invites', label: 'Invites' }] : [])
	]);

	/** The phone tab bar: four tabs, everything else behind "More". */
	const tabs = [
		{ href: '/', label: 'Plan' },
		{ href: '/calendar', label: 'Calendar' },
		{ href: '/bills', label: 'Bills' },
		{ href: '/reports', label: 'Reports' }
	];
	const more = $derived(links.filter((l) => !tabs.some((t) => t.href === l.href)));

	/** `/` covers the home page and every paycheck page; the rest match by prefix. */
	const isActive = (href: string, path: string) =>
		href === '/' ? path === '/' || path.startsWith('/paychecks') : path.startsWith(href);
</script>

<header
	class="sticky top-0 z-10 hidden border-b border-hairline bg-surface/90 backdrop-blur md:block"
>
	<div class="mx-auto flex max-w-5xl items-center gap-x-4 px-4">
		<a href="/" class="flex shrink-0 items-center gap-2 py-3 font-extrabold">
			<img src="/icon.svg" alt="" class="h-7 w-7" />
			<span>Budgeting</span>
		</a>
		<nav class="flex flex-wrap items-center gap-x-1 gap-y-1 py-2 text-sm">
			{#each links as link (link.href)}
				{@const active = isActive(link.href, page.url.pathname)}
				<a
					href={link.href}
					class="rounded-full px-3 py-1.5 whitespace-nowrap {active
						? 'bg-tonal font-bold text-accent'
						: 'font-medium text-muted hover:text-ink'}"
					aria-current={active ? 'page' : undefined}>{link.label}</a
				>
			{/each}
		</nav>
	</div>
</header>

<main class="mx-auto max-w-5xl px-4 pt-5 pb-28 md:pb-8">
	{@render children()}
</main>

<TabBar {tabs} {more} isActive={(href) => isActive(href, page.url.pathname)} />
