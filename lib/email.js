import { Resend } from 'resend';

export async function sendEmail(subject, text) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log('[EMAIL] No RESEND_API_KEY set. Would send:', subject);
    return false;
  }

  const recipients = (process.env.ALERT_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);
  if (recipients.length === 0) {
    console.log('[EMAIL] No ALERT_EMAILS set.');
    return false;
  }

  const resend = new Resend(key);
  let sent = 0;
  for (const to of recipients) {
    try {
      console.log('[EMAIL] Sending to:', to);
      const result = await resend.emails.send({
        from: 'Emotionless Alerts <onboarding@resend.dev>',
        to: [to],
        subject,
        text,
      });
      console.log('[EMAIL] Resend response:', JSON.stringify(result));
      sent++;
    } catch (e) {
      console.error(`[EMAIL] Send to ${to} failed:`, e.message);
    }
  }
  return sent > 0;
}
