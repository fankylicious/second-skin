/**
 * Cloudflare Pages Function: POST /api/register
 * Env secrets (Pages → Settings → Environment variables):
 *   RESEND_API_KEY  - from resend.com
 *   NOTIFY_EMAIL    - where signup alerts go (e.g. your inbox)
 *   FROM_EMAIL      - optional, default: Second Skin <registration@secondskin.run>
 *   REPLY_TO_EMAIL  - optional reply address for user confirmations
 *
 * KV binding (Pages → Settings → Functions → KV namespace bindings):
 *   Variable name: TICKER  (shared demand counter for men/women)
 *
 * Deliverability (Cloudflare DNS for secondskin.run):
 *   DKIM + send.* SPF are already set via Resend.
 *   Add DMARC if missing:
 *     Type TXT, Name _dmarc, Content:
 *     v=DMARC1; p=none; rua=mailto:dmarc@secondskin.run; fo=1
 */

import { LIMITS, normalizeFit, incrementCount } from '../_lib/ticker.js';

const CI = {
  black: '#080b0a',
  teal: '#3ea89b',
  tealBright: '#2a9d8f',
  text: '#1a1f1e',
  muted: '#5c6b66',
  line: '#d8e0dd',
  bg: '#f4f7f6',
  white: '#ffffff',
};

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
  const email = String(body.email || '').trim().toLowerCase();
  const fit = normalizeFit(String(body.fit || '').trim());
  const size = String(body.size || '').trim().toUpperCase();
  const lang = body.lang === 'en' ? 'en' : 'de';

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!firstname || !lastname || !emailOk || !fit || !size) {
    return json({ ok: false, error: 'Missing fields' }, 400);
  }

  const from = env.FROM_EMAIL || 'Second Skin <registration@secondskin.run>';
  const replyTo = env.REPLY_TO_EMAIL || extractAddress(from) || 'registration@secondskin.run';
  const fitLabel = fitDisplayLabel(fit, lang);
  const copy = userCopy(lang, firstname, fitLabel, size);

  const subjectNotify = `Second Skin interest: ${firstname} ${lastname} (${fitLabel}/${size})`;
  const textNotify = [
    'New Second Skin interest signup',
    '',
    `Name: ${firstname} ${lastname}`,
    `Email: ${email}`,
    `Fit: ${fitLabel}`,
    `Size: ${size}`,
    `Lang: ${lang}`,
    `At: ${new Date().toISOString()}`,
  ].join('\n');

  try {
    // User confirmation first (more important than internal notify)
    await sendResend(env.RESEND_API_KEY, {
      from,
      to: [email],
      reply_to: replyTo,
      subject: copy.subject,
      text: copy.text,
      html: copy.html,
      tags: [
        { name: 'category', value: 'transactional' },
        { name: 'type', value: 'registration' },
      ],
      headers: {
        'X-Entity-Ref-ID': `ss-reg-${Date.now()}`,
      },
    });

    await sendResend(env.RESEND_API_KEY, {
      from,
      to: [env.NOTIFY_EMAIL],
      subject: subjectNotify,
      text: textNotify,
      reply_to: email,
      tags: [{ name: 'category', value: 'internal' }],
    });
  } catch (err) {
    return json({ ok: false, error: 'Send failed' }, 502);
  }

  const result = await incrementCount(env, fit, email);
  return json({
    ok: true,
    counts: result.counts,
    limits: LIMITS,
    duplicated: result.duplicated,
    persisted: result.persisted,
  });
}

function extractAddress(from) {
  const match = String(from).match(/<([^>]+)>/);
  return match ? match[1].trim() : String(from).trim();
}

/** User-facing fit label; API value stays men|women. */
function fitDisplayLabel(fit, lang) {
  if (fit === 'women') return lang === 'de' ? 'Frauen' : 'Women';
  return 'Unisex / Oversize';
}

function userCopy(lang, firstname, fit, size) {
  const safeName = escapeHtml(firstname);
  const safeFit = escapeHtml(fit);
  const safeSize = escapeHtml(size);

  if (lang === 'de') {
    const subject = 'Second Skin — danke für dein Interesse';
    const greeting = `Hallo ${firstname},`;
    const thanks = 'vielen Dank für dein Interesse am Second Skin Konzept.';
    const body =
      'Wir haben deine Meldung erhalten. Das ist noch keine Bestellung — wir melden uns vor dem Launch. Second Skin erscheint Anfang 2027.';
    const fitLabel = 'Schnitt (Präferenz)';
    const sizeLabel = 'Grösse (Präferenz)';
    const preheader = 'Danke für dein Interesse an Second Skin.';
    return {
      subject,
      text: plainText({ greeting, thanks, body, fitLabel, sizeLabel, fit, size }),
      html: buildHtml({
        lang: 'de',
        preheader,
        greeting: `Hallo ${safeName},`,
        thanks,
        body,
        fitLabel,
        sizeLabel,
        fit: safeFit,
        size: safeSize,
      }),
    };
  }

  const subject = 'Second Skin — thanks for your interest';
  const greeting = `Hi ${firstname},`;
  const thanks = 'thank you for your interest in the Second Skin concept.';
  const body =
    'We received your note. This is not an order — we will get in touch before launch. Second Skin will be released early 2027.';
  const fitLabel = 'Fit (preference)';
  const sizeLabel = 'Size (preference)';
  const preheader = 'Thanks for your interest in Second Skin.';
  return {
    subject,
    text: plainText({ greeting, thanks, body, fitLabel, sizeLabel, fit, size }),
    html: buildHtml({
      lang: 'en',
      preheader,
      greeting: `Hi ${safeName},`,
      thanks,
      body,
      fitLabel,
      sizeLabel,
      fit: safeFit,
      size: safeSize,
    }),
  };
}

function plainText({ greeting, thanks, body, fitLabel, sizeLabel, fit, size }) {
  return [
    greeting,
    '',
    thanks,
    body,
    '',
    `${fitLabel}: ${fit}`,
    `${sizeLabel}: ${size}`,
    '',
    'Less Pain. More Endurance.',
    'Second Skin / X-Bionic Exclusive',
    'https://secondskin.run',
  ].join('\n');
}

function buildHtml({ lang, preheader, greeting, thanks, body, fitLabel, sizeLabel, fit, size }) {
  // Light transactional layout with teal/black accents — better inbox placement than all-black HTML
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Second Skin</title>
</head>
<body style="margin:0;padding:0;background:${CI.bg};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">
    ${preheader}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CI.bg};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:${CI.white};border:1px solid ${CI.line};">
          <tr>
            <td style="padding:20px 28px;background:${CI.black};">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${CI.teal};">
                Second Skin
              </p>
              <p style="margin:6px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:1.3;color:${CI.white};font-weight:700;">
                X-Bionic Exclusive
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:${CI.text};">
                ${greeting}
              </p>
              <p style="margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:${CI.text};">
                ${thanks}
              </p>
              <p style="margin:0 0 22px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:${CI.muted};">
                ${body}
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CI.bg};border:1px solid ${CI.line};">
                <tr>
                  <td style="padding:12px 14px 4px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${CI.muted};">
                    <strong style="color:${CI.tealBright};">${fitLabel}:</strong> ${fit}
                  </td>
                </tr>
                <tr>
                  <td style="padding:4px 14px 12px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${CI.muted};">
                    <strong style="color:${CI.tealBright};">${sizeLabel}:</strong> ${size}
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;color:${CI.tealBright};">
                Less Pain. More Endurance.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;border-top:1px solid ${CI.line};">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:${CI.muted};">
                Second Skin / X-Bionic Exclusive<br>
                <a href="https://secondskin.run" style="color:${CI.tealBright};text-decoration:underline;">secondskin.run</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
