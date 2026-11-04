<script lang="ts">
	import type { PaycheckStatus } from '$lib/server/repo/paychecks';

	let { status }: { status: PaycheckStatus } = $props();

	const styles: Record<PaycheckStatus, [string, string]> = {
		planned: ['Planned', 'bg-accent-tint text-accent'],
		partial: ['Partly confirmed', 'bg-warning-tint text-warning-ink'],
		confirmed: ['Confirmed', 'bg-good-tint text-good']
	};
	const style = $derived(styles[status]);
</script>

<span class="pill {style[1]}">{style[0]}</span>
