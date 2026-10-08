<script lang="ts">
	let { children } = $props();
</script>

<main class="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
	<div class="mb-6 flex items-center gap-2">
		<img src="/icon.svg" alt="" class="h-8 w-8" />
		<span class="text-xl font-semibold">Budgeting</span>
	</div>
	{@render children()}
</main>
