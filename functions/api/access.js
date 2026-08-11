/**
 * Cloudflare Pages Function: POST /api/access
 * Env secret (Pages → Settings → Environment variables):
 *   SITE_ACCESS_PASSWORD — unlock password for full site content
 *
 * If unset, falls back to "SecondSkin.Run-SS227" so the gate still works.
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const password = String(body.password || '');
  const expected = String(env.SITE_ACCESS_PASSWORD || 'SecondSkin.Run-SS227');

  if (!password || !timingSafeEqual(password, expected)) {
    return json({ ok: false, error: 'Unauthorized' }, 401);
  }

  return json({ ok: true });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const aa = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(aa.length, bb.length);
  let diff = aa.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= (aa[i] || 0) ^ (bb[i] || 0);
  }
  return diff === 0;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...corsHeaders(),
    },
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
