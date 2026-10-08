<script lang="ts">
	import { page } from '$app/state';

	let { data, children } = $props();

	const links = $derived([
		{ href: '/budget', label: 'Budget' },
		{ href: '/accounts', label: 'Accounts' },
		{ href: '/transactions', label: 'Transactions' },
		{ href: '/import', label: 'Import' },
		{ href: '/rules', label: 'Rules' },
		{ href: '/reports', label: 'Reports' },
		{ href: '/settings', label: 'Settings' },
		...(data.user.role === 'admin' ? [{ href: '/admin/invites', label: 'Invites' }] : [])
	]);
</script>

<header class="sticky top-0 z-10 border-b border-slate-200 bg-white">
	<div class="mx-auto flex max-w-5xl items-center gap-4 px-4">
		<a href="/budget" class="flex shrink-0 items-center gap-2 py-3 font-semibold">
			<img src="/icon.svg" alt="" class="h-6 w-6" />
			<span class="hidden sm:inline">Budgeting</span>
		</a>
		<nav class="-mb-px flex gap-1 overflow-x-auto text-sm">
			{#each links as link (link.href)}
				{@const active = page.url.pathname.startsWith(link.href)}
				<a
					href={link.href}
					class="border-b-2 px-2 py-3 whitespace-nowrap {active
						? 'border-teal-700 font-medium text-teal-800'
						: 'border-transparent text-slate-600 hover:text-slate-900'}"
					aria-current={active ? 'page' : undefined}>{link.label}</a
				>
			{/each}
		</nav>
	</div>
</header>

<main class="mx-auto max-w-5xl px-4 py-6">
	{@render children()}
</main>
