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
  try {
    console.log('[EMAIL] Sending to:', recipients.join(', '));
    const result = await resend.emails.send({
      from: 'Emotionless Alerts <onboarding@resend.dev>',
      to: recipients,
      subject,
      text,
    });
    console.log('[EMAIL] Resend response:', JSON.stringify(result));
    return true;
  } catch (e) {
    console.error('[EMAIL] Send failed:', e.message, JSON.stringify(e));
    return false;
  }
}
