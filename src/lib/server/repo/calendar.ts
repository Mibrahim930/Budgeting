import { addMonths, isMonth } from '$lib/month';
import { paydaysBetween } from '$lib/planner/payday';
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client';
import { paycheckLine } from '../db/schema';
import { billsDueBetween } from './bills';
import { getPaySchedule } from './pay-schedule';
import { listPaychecks, type PaycheckStatus } from './paychecks';
import { ValidationError } from './transactions';

export type ChargeStatus = 'unplanned' | 'planned' | 'paid';

export interface CalendarCharge {
	billId: string;
	name: string;
	amountMinor: number;
	dueDate: string;
	accountName: string;
	status: ChargeStatus;
	/** The plan this charge is in, if any. */
	paycheckId: string | null;
}

export interface CalendarPaycheck {
	id: string;
	date: string;
	amountMinor: number;
	status: PaycheckStatus;
}

export interface CalendarMonth {
	month: string;
	/** First day of the month. */
	from: string;
	/** First day of the next month (exclusive). */
	to: string;
	charges: CalendarCharge[];
	/** Paydays the pay schedule predicts in the month. */
	paydays: string[];
	/** Paychecks actually planned in the month. */
	paychecks: CalendarPaycheck[];
	totals: { dueMinor: number; paidMinor: number; count: number; paidCount: number };
}

/** Everything the calendar shows for one month: charges with their plan status, and paydays. */
export function calendarMonth(db: Db, userId: string, month: string): CalendarMonth {
	if (!isMonth(month)) throw new ValidationError('Month must be YYYY-MM');
	const from = `${month}-01`;
	const to = `${addMonths(month, 1)}-01`;

	const due = billsDueBetween(db, userId, from, to);
	const lineIds = due.map((o) => o.plannedLineId).filter((id): id is string => !!id);
	const statusByLine = new Map(
		lineIds.length
			? db
					.select({ id: paycheckLine.id, status: paycheckLine.status })
					.from(paycheckLine)
					.where(and(eq(paycheckLine.userId, userId), inArray(paycheckLine.id, lineIds)))
					.all()
					.map((r) => [r.id, r.status])
			: []
	);
	const charges: CalendarCharge[] = due.map((o) => {
		const lineStatus = o.plannedLineId ? statusByLine.get(o.plannedLineId) : undefined;
		return {
			billId: o.billId,
			name: o.name,
			amountMinor: o.amountMinor,
			dueDate: o.dueDate,
			accountName: o.accountName,
			status: lineStatus === 'done' ? 'paid' : lineStatus === 'planned' ? 'planned' : 'unplanned',
			paycheckId: lineStatus ? o.plannedPaycheckId : null
		};
	});

	const schedule = getPaySchedule(db, userId);
	const paydays = schedule ? paydaysBetween(schedule, from, to) : [];
	const paychecks = listPaychecks(db, userId, { limit: 100_000 })
		.filter((p) => p.date >= from && p.date < to)
		.sort((a, b) => a.date.localeCompare(b.date))
		.map((p) => ({ id: p.id, date: p.date, amountMinor: p.amountMinor, status: p.status }));

	const paid = charges.filter((c) => c.status === 'paid');
	return {
		month,
		from,
		to,
		charges,
		paydays,
		paychecks,
		totals: {
			dueMinor: charges.reduce((a, c) => a + c.amountMinor, 0),
			paidMinor: paid.reduce((a, c) => a + c.amountMinor, 0),
			count: charges.length,
			paidCount: paid.length
		}
	};
}
