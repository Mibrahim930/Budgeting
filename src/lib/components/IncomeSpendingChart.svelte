<script lang="ts">
	import { formatMoney } from '$lib/money';
	import { monthLabel } from '$lib/month';

	type Point = { month: string; income: number; spending: number };
	let { data }: { data: Point[] } = $props();

	const COLORS = { income: '#2a78d6', spending: '#eb6834' };
	const W = 640;
	const H = 220;
	const PAD = { top: 12, right: 8, bottom: 24, left: 56 };
	const plotW = W - PAD.left - PAD.right;
	const plotH = H - PAD.top - PAD.bottom;

	let hover = $state<number | null>(null);

	const max = $derived(Math.max(1, ...data.flatMap((d) => [d.income, d.spending])));
	const ticks = $derived.by(() => {
		const raw = max / 4;
		const mag = 10 ** Math.floor(Math.log10(raw));
		const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
		return Array.from({ length: Math.floor(max / step) + 2 }, (_, i) => i * step).filter(
			(t) => t <= max + step
		);
	});
	const top = $derived(ticks[ticks.length - 1] || max);
	const y = (v: number) => PAD.top + plotH - (Math.max(0, v) / top) * plotH;
	const band = $derived(plotW / Math.max(1, data.length));
	const barW = $derived(Math.max(3, Math.min(18, band / 2 - 4)));

	/** Bar with 4px rounded top, flat on the baseline. */
	function bar(x: number, v: number) {
		const y0 = PAD.top + plotH;
		const y1 = y(v);
		const h = y0 - y1;
		if (h <= 0) return '';
		const r = Math.min(4, h, barW / 2);
		return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + barW - r}Q${x + barW},${y1} ${x + barW},${y1 + r}V${y0}Z`;
	}
	const short = (m: string) => monthLabel(m).slice(0, 3);
	const compact = (c: number) =>
		new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			notation: 'compact'
		}).format(c / 100);
</script>

<div class="relative">
	<div class="mb-2 flex gap-4 text-xs text-slate-600">
		<span class="flex items-center gap-1.5"
			><span class="h-2.5 w-2.5 rounded-sm" style="background:{COLORS.income}"></span>Income</span
		>
		<span class="flex items-center gap-1.5"
			><span class="h-2.5 w-2.5 rounded-sm" style="background:{COLORS.spending}"
			></span>Spending</span
		>
	</div>
	<svg viewBox="0 0 {W} {H}" class="w-full" role="img" aria-label="Income and spending by month">
		{#each ticks as t (t)}
			<line
				x1={PAD.left}
				x2={W - PAD.right}
				y1={y(t)}
				y2={y(t)}
				stroke="#e2e8f0"
				stroke-width="1"
			/>
			<text
				x={PAD.left - 6}
				y={y(t)}
				dy="0.32em"
				text-anchor="end"
				class="fill-slate-500 text-[10px]">{compact(t)}</text
			>
		{/each}
		{#each data as d, i (d.month)}
			{@const x0 = PAD.left + i * band + band / 2}
			<g opacity={hover === null || hover === i ? 1 : 0.45}>
				<path d={bar(x0 - barW - 1, d.income)} fill={COLORS.income} />
				<path d={bar(x0 + 1, d.spending)} fill={COLORS.spending} />
			</g>
			<text x={x0} y={H - 6} text-anchor="middle" class="fill-slate-500 text-[10px]"
				>{short(d.month)}</text
			>
			<rect
				x={PAD.left + i * band}
				y={PAD.top}
				width={band}
				height={plotH}
				fill="transparent"
				role="presentation"
				onpointerenter={() => (hover = i)}
				onpointerleave={() => (hover = null)}
			/>
		{/each}
	</svg>
	{#if hover !== null}
		{@const d = data[hover]}
		<div
			class="pointer-events-none absolute top-6 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow"
			style="left: clamp(0px, calc({((PAD.left + (hover + 0.5) * band) / W) *
				100}% - 70px), calc(100% - 150px))"
		>
			<p class="mb-1 font-medium">{monthLabel(d.month)}</p>
			<p class="text-slate-700">Income {formatMoney(d.income)}</p>
			<p class="text-slate-700">Spending {formatMoney(d.spending)}</p>
			<p class="text-slate-500">Net {formatMoney(d.income - d.spending)}</p>
		</div>
	{/if}
</div>
