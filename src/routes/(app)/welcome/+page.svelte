<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	type SavingsRow = { name: string; balance: string };
	type DebtRow = { name: string; type: 'credit' | 'loan'; owed: string };

	let savings = $state<SavingsRow[]>([]);
	let debts = $state<DebtRow[]>([]);
	let frequency = $state('biweekly');
	let busy = $state(false);

	const addSavings = () => savings.push({ name: '', balance: '' });
	const addDebt = () => debts.push({ name: '', type: 'credit', owed: '' });
</script>

<div class="mx-auto max-w-2xl">
	<h1 class="display">Welcome! Let's get you set up</h1>
	<p class="mt-1 mb-4 text-sm text-muted">
		Tell us where you stand today: what's in your accounts, what you owe, and when you get paid.
		We'll use it to plan each paycheck. Everything here can be changed later.
	</p>

	<form
		method="POST"
		class="space-y-4"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				busy = false;
				await update({ reset: false });
			};
		}}
	>
		{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}

		<section class="card">
			<h2 class="mb-1 font-medium">1. Checking</h2>
			<p class="mb-3 text-sm text-muted">The account your paycheck lands in.</p>
			<div class="grid gap-3 sm:grid-cols-2">
				<div>
					<label class="label" for="w-checking-name">Checking account name</label>
					<input
						class="input"
						id="w-checking-name"
						name="checkingName"
						value="Checking"
						autocomplete="off"
					/>
				</div>
				<div>
					<label class="label" for="w-checking-balance">Checking balance</label>
					<input
						class="input"
						id="w-checking-balance"
						name="checkingBalance"
						inputmode="decimal"
						placeholder="0.00"
					/>
				</div>
			</div>
		</section>

		<section class="card">
			<h2 class="mb-1 font-medium">2. Savings</h2>
			<p class="mb-3 text-sm text-muted">
				Savings or emergency accounts, with their balance today.
			</p>
			<input type="hidden" name="savings" value={JSON.stringify(savings)} />
			<div class="space-y-3">
				{#each savings as row, i (i)}
					<div class="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_9rem]">
						<div class="col-span-2 sm:col-span-1">
							<label class="label" for="w-savings-name-{i}">Savings account name</label>
							<input
								class="input"
								id="w-savings-name-{i}"
								bind:value={row.name}
								placeholder="e.g. Emergency fund"
								autocomplete="off"
							/>
						</div>
						<div class="col-span-2 flex items-end gap-2 sm:col-span-1">
							<div class="min-w-0 flex-1">
								<label class="label" for="w-savings-balance-{i}">Savings balance</label>
								<input
									class="input"
									id="w-savings-balance-{i}"
									bind:value={row.balance}
									inputmode="decimal"
									placeholder="0.00"
								/>
							</div>
							<button
								type="button"
								class="px-2 py-2 text-muted hover:text-danger"
								aria-label="Remove savings account"
								onclick={() => savings.splice(i, 1)}>✕</button
							>
						</div>
					</div>
				{:else}
					<p class="text-sm text-muted">No savings account yet? You can add one later.</p>
				{/each}
			</div>
			<button type="button" class="btn-secondary mt-3" onclick={addSavings}
				>+ Add savings account</button
			>
		</section>

		<section class="card">
			<h2 class="mb-1 font-medium">3. Debts</h2>
			<p class="mb-3 text-sm text-muted">Credit cards and loans, with what you owe today.</p>
			<input type="hidden" name="debts" value={JSON.stringify(debts)} />
			<div class="space-y-3">
				{#each debts as row, i (i)}
					<div class="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_9rem_8rem_auto]">
						<div class="col-span-2 sm:col-span-1">
							<label class="label" for="w-debt-name-{i}">Debt name</label>
							<input
								class="input"
								id="w-debt-name-{i}"
								bind:value={row.name}
								placeholder="e.g. Visa"
								autocomplete="off"
							/>
						</div>
						<div>
							<label class="label" for="w-debt-type-{i}">Debt type</label>
							<select class="input" id="w-debt-type-{i}" bind:value={row.type}>
								<option value="credit">Credit card</option>
								<option value="loan">Loan</option>
							</select>
						</div>
						<div class="flex items-end gap-2 sm:contents">
							<div class="min-w-0 flex-1">
								<label class="label" for="w-debt-owed-{i}">Amount owed</label>
								<input
									class="input"
									id="w-debt-owed-{i}"
									bind:value={row.owed}
									inputmode="decimal"
									placeholder="0.00"
								/>
							</div>
							<button
								type="button"
								class="px-2 py-2 text-muted hover:text-danger"
								aria-label="Remove debt"
								onclick={() => debts.splice(i, 1)}>✕</button
							>
						</div>
					</div>
				{:else}
					<p class="text-sm text-muted">No debts? Great. Skip this step.</p>
				{/each}
			</div>
			<button type="button" class="btn-secondary mt-3" onclick={addDebt}>+ Add debt</button>
		</section>

		<section class="card">
			<h2 class="mb-1 font-medium">4. Income</h2>
			<p class="mb-3 text-sm text-muted">
				How often you're paid and roughly how much. You'll type the exact amount for each paycheck.
			</p>
			<div class="grid gap-3 sm:grid-cols-3">
				<div>
					<label class="label" for="w-frequency">Pay frequency</label>
					<select class="input" id="w-frequency" name="frequency" bind:value={frequency}>
						<option value="weekly">Every week</option>
						<option value="biweekly">Every 2 weeks</option>
						<option value="semimonthly">Twice a month</option>
						<option value="monthly">Once a month</option>
					</select>
				</div>
				<div>
					<label class="label" for="w-amount">Take-home pay</label>
					<input
						class="input"
						id="w-amount"
						name="amount"
						inputmode="decimal"
						placeholder="0.00"
						required
					/>
				</div>
				<div>
					<label class="label" for="w-anchor">Next payday</label>
					<input
						class="input"
						id="w-anchor"
						name="anchorDate"
						type="date"
						value={data.today}
						required
					/>
				</div>
				{#if frequency === 'semimonthly'}
					<div>
						<label class="label" for="w-semi1">First payday of the month</label>
						<input
							class="input"
							id="w-semi1"
							name="semiDay1"
							type="number"
							min="1"
							max="31"
							value="1"
						/>
					</div>
					<div>
						<label class="label" for="w-semi2">Second payday of the month</label>
						<input
							class="input"
							id="w-semi2"
							name="semiDay2"
							type="number"
							min="1"
							max="31"
							value="15"
						/>
					</div>
				{/if}
			</div>
		</section>

		<div class="flex justify-end">
			<button class="btn w-full sm:w-auto" disabled={busy}>Finish setup</button>
		</div>
	</form>
</div>
