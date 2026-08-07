/** Shared demand ticker helpers (Cloudflare KV binding: TICKER) */

export const LIMITS = { men: 100, women: 50 };
export const BASE = { men: 18, women: 0 };
const COUNTS_KEY = 'counts';

export function normalizeFit(fit) {
  return fit === 'women' || fit === 'men' ? fit : null;
}

export async function readCounts(env) {
  const fallback = { men: BASE.men, women: BASE.women };
  if (!env.TICKER) return fallback;

  try {
    const raw = await env.TICKER.get(COUNTS_KEY, 'json');
    if (!raw || typeof raw !== 'object') return fallback;
    return {
      men: clampCount(raw.men, BASE.men),
      women: clampCount(raw.women, BASE.women),
    };
  } catch {
    return fallback;
  }
}

export async function incrementCount(env, fit, email) {
  const key = normalizeFit(fit);
  if (!key) return readCounts(env);

  if (!env.TICKER) {
    const counts = await readCounts(env);
    counts[key] += 1;
    return { counts, duplicated: false, persisted: false };
  }

  const emailKey = emailKeyFor(email);
  if (emailKey) {
    const seen = await env.TICKER.get(emailKey);
    if (seen) {
      return { counts: await readCounts(env), duplicated: true, persisted: true };
    }
  }

  const counts = await readCounts(env);
  counts[key] += 1;
  await env.TICKER.put(COUNTS_KEY, JSON.stringify(counts));
  if (emailKey) {
    await env.TICKER.put(emailKey, JSON.stringify({ fit: key, at: new Date().toISOString() }));
  }
  return { counts, duplicated: false, persisted: true };
}

function clampCount(value, min) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.floor(n));
}

function emailKeyFor(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;
  return `email:${normalized}`;
}
