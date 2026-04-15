import type { APIRoute } from 'astro';

export const prerender = false;

interface CacheEntry {
	data: unknown;
	expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60 * 1000;

function getCached(username: string): unknown | null {
	const entry = cache.get(username);
	if (!entry) return null;
	if (Date.now() > entry.expiresAt) {
		cache.delete(username);
		return null;
	}
	return entry.data;
}

function setCached(username: string, data: unknown): void {
	cache.set(username, { data, expiresAt: Date.now() + TTL_MS });
}

function jsonResponse(body: unknown, status: number, extraHeaders?: Record<string, string>): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', ...extraHeaders },
	});
}

export const GET: APIRoute = async ({ params }) => {
	const { username } = params;

	if (!username) {
		return jsonResponse({ error: 'Username is required' }, 400);
	}

	const cached = getCached(username);
	if (cached !== null) {
		return jsonResponse(cached, 200, { 'Cache-Control': 'public, max-age=300' });
	}

	let upstream: Response;
	try {
		upstream = await fetch(`https://github.com/${username}.contribs`, {
			headers: {
				Accept: 'application/json',
				'User-Agent': 'mona-mayhem/1.0',
			},
		});
	} catch {
		return jsonResponse({ error: 'Failed to fetch contribution data' }, 502);
	}

	if (!upstream.ok) {
		return jsonResponse({ error: `GitHub returned ${upstream.status}` }, upstream.status);
	}

	let data: unknown;
	try {
		data = await upstream.json();
	} catch {
		return jsonResponse({ error: 'Failed to parse contribution data' }, 502);
	}

	setCached(username, data);
	return jsonResponse(data, 200, { 'Cache-Control': 'public, max-age=300' });
};
