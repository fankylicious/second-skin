/**
 * Cloudflare Pages Function: POST /api/register
 * Env secrets (Pages → Settings → Environment variables):
 *   RESEND_API_KEY  - from resend.com
 *   NOTIFY_EMAIL    - where signup alerts go (e.g. your inbox)
 *   FROM_EMAIL      - optional, default: Second Skin <noreply@secondskin.run>
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.RESEND_API_KEY || !env.NOTIFY_EMAIL) {
    return json({ ok: false, error: 'Email not configured' }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  // Honeypot
  if (body.website) {
    return json({ ok: true });
  }

  const firstname = String(body.firstname || '').trim();
  const lastname = String(body.lastname || '').trim();
  const email = String(body.email || '').trim();
  const fit = String(body.fit || '').trim();
  const size = String(body.size || '').trim();
  const lang = body.lang === 'en' ? 'en' : 'de';

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!firstname || !lastname || !emailOk || !fit || !size) {
    return json({ ok: false, error: 'Missing fields' }, 400);
  }

  const from = env.FROM_EMAIL || 'Second Skin <noreply@secondskin.run>';
  const subjectNotify = `Second Skin signup: ${firstname} ${lastname} (${fit}/${size})`;
  const textNotify = [
    'New Second Skin pre-release registration',
    '',
    `Name: ${firstname} ${lastname}`,
    `Email: ${email}`,
    `Fit: ${fit}`,
    `Size: ${size}`,
    `Lang: ${lang}`,
    `At: ${new Date().toISOString()}`,
  ].join('\n');

  const subjectUser = lang === 'de'
    ? 'Second Skin — danke für dein Interesse'
    : 'Second Skin — thanks for your interest';

  const textUser = lang === 'de'
    ? [
        `Hallo ${firstname},`,
        '',
        'danke für dein Interesse am Second Skin Shirt.',
        'Du bist auf der Pre-Release-Liste. Wir melden uns vor dem Launch (voraussichtlich Feb / März 2027) mit deinem Vorkaufsrecht.',
        '',
        `Schnitt: ${fit}`,
        `Grösse: ${size}`,
        '',
        'Less Pain. More Endurance.',
        'Second Skin · X-Bionic Exclusive',
      ].join('\n')
    : [
        `Hi ${firstname},`,
        '',
        'thanks for your interest in the Second Skin shirt.',
        'You are on the pre-release list. We will contact you before launch (expected Feb / Mar 2027) with your priority purchase rights.',
        '',
        `Fit: ${fit}`,
        `Size: ${size}`,
        '',
        'Less Pain. More Endurance.',
        'Second Skin · X-Bionic Exclusive',
      ].join('\n');

  try {
    await sendResend(env.RESEND_API_KEY, {
      from,
      to: [env.NOTIFY_EMAIL],
      subject: subjectNotify,
      text: textNotify,
      reply_to: email,
    });

    await sendResend(env.RESEND_API_KEY, {
      from,
      to: [email],
      subject: subjectUser,
      text: textUser,
    });
  } catch (err) {
    return json({ ok: false, error: 'Send failed' }, 502);
  }

  return json({ ok: true });
}

async function sendResend(apiKey, payload) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || 'Resend error');
  }
  return res.json();
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
