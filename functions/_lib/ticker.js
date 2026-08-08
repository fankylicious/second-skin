/** Shared demand ticker helpers (Cloudflare KV binding: TICKER) */

export const LIMITS = { men: 100, women: 50 };
export const BASE = { men: 5, women: 3 };
/** Previous seed — used once to rebase stored counts when BASE.men was lowered. */
const PREV_BASE = { men: 15, women: 3 };
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
    const counts = normalizeStoredCounts(raw);
    // Persist seed rebase once so KV stays consistent across sessions
    if (counts.men !== Number(raw.men) || counts.women !== Number(raw.women)) {
      await env.TICKER.put(COUNTS_KEY, JSON.stringify(counts));
    }
    return counts;
  } catch {
    return fallback;
  }
}

export async function incrementCount(env, fit, email) {
  const key = normalizeFit(fit);
  if (!key) {
    return { counts: await readCounts(env), duplicated: false, persisted: false };
  }

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

  // Bump only the selected fit; the other gender count stays untouched.
  // Email key prevents double-count across sessions/browsers for the same address.
  const counts = await readCounts(env);
  const next = { men: counts.men, women: counts.women };
  next[key] += 1;
  await env.TICKER.put(COUNTS_KEY, JSON.stringify(next));
  if (emailKey) {
    await env.TICKER.put(
      emailKey,
      JSON.stringify({ fit: key, at: new Date().toISOString() })
    );
  }
  return { counts: next, duplicated: false, persisted: true };
}

/** Absolute counts with BASE floor; rebase if KV still carries the old men seed. */
function normalizeStoredCounts(raw) {
  let men = Number(raw.men);
  let women = Number(raw.women);

  if (Number.isFinite(men) && men >= PREV_BASE.men && BASE.men < PREV_BASE.men) {
    men = BASE.men + Math.max(0, Math.floor(men) - PREV_BASE.men);
  }
  if (Number.isFinite(women) && women >= PREV_BASE.women && BASE.women < PREV_BASE.women) {
    women = BASE.women + Math.max(0, Math.floor(women) - PREV_BASE.women);
  }

  return {
    men: clampCount(men, BASE.men),
    women: clampCount(women, BASE.women),
  };
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
