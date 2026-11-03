<script lang="ts">
	import type { PaycheckStatus } from '$lib/server/repo/paychecks';

	let { status }: { status: PaycheckStatus } = $props();

	const styles: Record<PaycheckStatus, [string, string]> = {
		planned: ['Planned', 'bg-slate-100 text-slate-700'],
		partial: ['Partly confirmed', 'bg-amber-100 text-amber-800'],
		confirmed: ['Confirmed', 'bg-emerald-100 text-emerald-800']
	};
	const style = $derived(styles[status]);
</script>

<span class="inline-block shrink-0 rounded-full px-2 py-0.5 text-xs font-medium {style[1]}"
	>{style[0]}</span
>
