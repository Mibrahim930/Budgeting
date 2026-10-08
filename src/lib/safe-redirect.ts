/** Only allow same-site relative redirect targets. */
export function safeNext(next: string | null | undefined, fallback = '/budget'): string {
	if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
		return fallback;
	}
	return next;
}
