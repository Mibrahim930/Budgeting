import { today } from '$lib/month';
import type { RequestEvent } from '@sveltejs/kit';
import { getDb } from './db/client';
import { parseLineForm, parseLinePatch } from './forms';
import { handleValidation, requireUserId } from './page-helpers';
import {
	addLine,
	allocateLeftover,
	confirmIncome,
	confirmLine,
	removeLine,
	unconfirmIncome,
	unconfirmLine,
	updateLine
} from './repo/paychecks';

const field = (form: FormData, k: string) => String(form.get(k) ?? '').trim();

/** Run `fn` with the signed-in user and the posted form, turning validation errors into 400s. */
const action =
	<T>(fn: (userId: string, form: FormData) => T) =>
	async ({ locals, request }: RequestEvent) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		return handleValidation(() => fn(userId, form));
	};

/**
 * Form actions shared by every page that shows a paycheck plan (`/` and `/paychecks/[id]`).
 * Lines are addressed by `id`, paychecks by `paycheckId`.
 */
export const paycheckActions = {
	confirmLine: action((userId, form) => {
		confirmLine(getDb(), userId, field(form, 'id'), today());
		return { confirmed: true };
	}),
	unconfirmLine: action((userId, form) => {
		unconfirmLine(getDb(), userId, field(form, 'id'));
		return { unconfirmed: true };
	}),
	confirmIncome: action((userId, form) => {
		confirmIncome(getDb(), userId, field(form, 'paycheckId'));
		return { confirmed: true };
	}),
	unconfirmIncome: action((userId, form) => {
		unconfirmIncome(getDb(), userId, field(form, 'paycheckId'));
		return { unconfirmed: true };
	}),
	addLine: action((userId, form) => {
		addLine(getDb(), userId, field(form, 'paycheckId'), parseLineForm(form));
		return { added: true };
	}),
	updateLine: action((userId, form) => {
		updateLine(getDb(), userId, field(form, 'id'), parseLinePatch(form));
		return { updated: true };
	}),
	removeLine: action((userId, form) => {
		removeLine(getDb(), userId, field(form, 'id'));
		return { removed: true };
	}),
	allocateLeftover: action((userId, form) => {
		allocateLeftover(
			getDb(),
			userId,
			field(form, 'paycheckId'),
			field(form, 'label') || undefined,
			field(form, 'categoryId') || null
		);
		return { added: true };
	})
};
