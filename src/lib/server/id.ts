import { randomBytes, randomUUID } from 'node:crypto';

export const newId = (): string => randomUUID();

/** URL-safe random token, e.g. for invite codes. */
export const newToken = (bytes = 18): string => randomBytes(bytes).toString('base64url');
