import { and, count, desc, eq, gt, isNull } from 'drizzle-orm';
import type { Db } from '../db/client';
import { invite, user } from '../db/schema';
import { newToken } from '../id';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function countUsers(db: Db): number {
	return db.select({ n: count() }).from(user).get()?.n ?? 0;
}

export function createInvite(db: Db, createdBy: string, now = new Date()) {
	const row = {
		code: newToken(),
		createdBy,
		expiresAt: new Date(now.getTime() + INVITE_TTL_MS)
	};
	db.insert(invite).values(row).run();
	return row;
}

export function listInvites(db: Db, createdBy: string) {
	return db
		.select({
			code: invite.code,
			expiresAt: invite.expiresAt,
			usedAt: invite.usedAt,
			createdAt: invite.createdAt,
			usedByEmail: user.email
		})
		.from(invite)
		.leftJoin(user, eq(user.id, invite.usedBy))
		.where(eq(invite.createdBy, createdBy))
		.orderBy(desc(invite.createdAt))
		.all();
}

export function revokeInvite(db: Db, createdBy: string, code: string) {
	db.delete(invite)
		.where(and(eq(invite.code, code), eq(invite.createdBy, createdBy), isNull(invite.usedBy)))
		.run();
}

/** An invite that exists, is unused and has not expired. */
export function findUsableInvite(db: Db, code: string, now = new Date()) {
	return db
		.select()
		.from(invite)
		.where(and(eq(invite.code, code), isNull(invite.usedBy), gt(invite.expiresAt, now)))
		.get();
}

export function markInviteUsed(db: Db, code: string, userId: string, now = new Date()) {
	db.update(invite).set({ usedBy: userId, usedAt: now }).where(eq(invite.code, code)).run();
}
