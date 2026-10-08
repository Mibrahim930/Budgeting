<script lang="ts">
	import { formatMoney } from '$lib/money';

	let { cents, colored = false }: { cents: number; colored?: boolean } = $props();
</script>

<span
	class="tabular-nums {colored && cents < 0 ? 'text-red-600' : ''} {colored && cents > 0
		? 'text-emerald-700'
		: ''}">{formatMoney(cents)}</span
>
