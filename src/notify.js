const fetch = require('node-fetch');

/**
 * Push a notification when a book becomes available.
 *
 * Configured through env vars; any combination may be set:
 *   NTFY_TOPIC          — topic name on ntfy.sh (or NTFY_URL for a self-hosted server)
 *   NOTIFY_WEBHOOK_URL  — any URL that accepts a JSON POST ({ title, body, url })
 * With nothing configured the notification is only logged.
 */
async function notifyAvailable({ book, libraryName, result }) {
  const title = `Available: ${book.label}`;
  const body  = `${result.title || book.label} is available at ${libraryName}` +
                (result.format === 'audiobook' ? ' (audiobook)' : '');
  const url   = result.checkoutUrl || null;

  console.log(`[notify] ${title} — ${body}`);

  const sends = [];
  if (process.env.NTFY_TOPIC) sends.push(sendNtfy({ title, body, url }));
  if (process.env.NOTIFY_WEBHOOK_URL) sends.push(sendWebhook({ title, body, url }));

  const outcomes = await Promise.allSettled(sends);
  for (const o of outcomes) {
    if (o.status === 'rejected') console.error(`[notify] failed: ${o.reason && o.reason.message}`);
  }
}

async function sendNtfy({ title, body, url }) {
  const base  = (process.env.NTFY_URL || 'https://ntfy.sh').replace(/\/$/, '');
  const topic = process.env.NTFY_TOPIC;
  const headers = { 'Title': title, 'Tags': 'books' };
  if (url) headers['Click'] = url;
  if (process.env.NTFY_TOKEN) headers['Authorization'] = `Bearer ${process.env.NTFY_TOKEN}`;

  const res = await fetch(`${base}/${encodeURIComponent(topic)}`, {
    method: 'POST', headers, body, timeout: 10000,
  });
  if (!res.ok) throw new Error(`ntfy returned HTTP ${res.status}`);
}

async function sendWebhook({ title, body, url }) {
  const res = await fetch(process.env.NOTIFY_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body, url }),
    timeout: 10000,
  });
  if (!res.ok) throw new Error(`webhook returned HTTP ${res.status}`);
}

module.exports = { notifyAvailable };
