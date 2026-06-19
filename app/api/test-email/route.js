import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';

export async function POST() {
  try {
    const result = await sendEmail(
      'Emotionless Alerts — Test Email',
      'This is a test email from your Emotionless Trading Alerts app.\n\nIf you received this, email alerts are working correctly.\n\nYou will receive alerts here whenever a trading rule fires (buy zone, sell zone, drawdown, etc).'
    );
    if (result) {
      return NextResponse.json({ ok: true, message: 'Email sent!' });
    } else {
      return NextResponse.json({ ok: false, error: 'sendEmail returned false — check RESEND_API_KEY and ALERT_EMAILS env vars' });
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message });
  }
}
