/**
 * GET /api/ticker — public demand counts
 * Requires Cloudflare Pages KV binding: TICKER
 */

import { LIMITS, readCounts } from '../_lib/ticker.js';

export async function onRequestGet(context) {
  const counts = await readCounts(context.env);
  return json({
    ok: true,
    counts,
    limits: LIMITS,
    persisted: !!context.env.TICKER,
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
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
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
