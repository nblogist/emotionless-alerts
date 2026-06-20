import { Resend } from 'resend';

export async function sendEmail(subject, text, recipientOverride) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log('[EMAIL] No RESEND_API_KEY set.');
    return { ok: false, error: 'No RESEND_API_KEY configured' };
  }

  const recipients = recipientOverride
    ? (Array.isArray(recipientOverride) ? recipientOverride : [recipientOverride])
    : (process.env.ALERT_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

  if (recipients.length === 0) {
    return { ok: false, error: 'No recipients configured' };
  }

  const resend = new Resend(key);
  let sent = 0;
  const failures = [];

  for (const to of recipients) {
    let success = false;
    let lastError;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await resend.emails.send({
          from: 'Emotionless Alerts <onboarding@resend.dev>',
          to: [to],
          subject,
          text,
        });
        sent++;
        success = true;
        break;
      } catch (e) {
        lastError = e.message;
        console.error(`[EMAIL] Attempt ${attempt} to ${to} failed:`, lastError);
        if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
      }
    }
    if (!success) failures.push({ to, error: lastError });
  }

  return {
    ok: sent > 0,
    sent,
    total: recipients.length,
    failures,
    error: failures.length > 0 ? `Failed: ${failures.map(f => f.to).join(', ')}` : null,
  };
}
