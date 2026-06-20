import { Resend } from 'resend';

/**
 * Convert plain-text alert message into styled HTML email.
 * Parses the structured signal format into visual cards.
 */
function alertsToHtml(text) {
  // Split into individual alerts (double newline separated)
  // Each alert is: AI reason paragraph + \n\n + [Portfolio] SIGNAL HEADER + \n + structured data
  const alerts = text.split(/\n\n(?=\[|Hey |Your |BTC |ETH |SOL |AQUARI |XAUT |Monthly |SIGNAL )/);

  let cards = '';
  let i = 0;
  while (i < alerts.length) {
    const block = alerts[i].trim();
    if (!block) { i++; continue; }

    // Detect if this is an AI reason (no bracket prefix) followed by a signal block
    const isReason = !block.startsWith('[') && !block.startsWith('SIGNAL');
    let reason = '';
    let signalBlock = block;

    if (isReason) {
      reason = block;
      // Next block should be the signal details
      if (i + 1 < alerts.length) {
        i++;
        signalBlock = alerts[i].trim();
      } else {
        // Standalone text (e.g., news alert)
        cards += renderTextCard(block);
        i++;
        continue;
      }
    }

    cards += renderSignalCard(reason, signalBlock);
    i++;
  }

  if (!cards) {
    cards = renderTextCard(text);
  }

  return emailWrapper(cards);
}

function renderSignalCard(reason, signalBlock) {
  const lines = signalBlock.split('\n');
  const header = lines[0] || '';

  // Parse header: [Portfolio] ACTION ASSET — detail
  const headerMatch = header.match(/^\[([^\]]+)\]\s*(.+)$/);
  const portfolio = headerMatch ? headerMatch[1] : '';
  const action = headerMatch ? headerMatch[2] : header;

  // Determine signal type for color
  const isBuy = /BUY/i.test(action);
  const isSell = /SELL|SKIM|TRIM/i.test(action);
  const isError = /FAILED|ERROR|SUPPRESSED/i.test(action);
  const isCrash = /CRASH/i.test(action);
  const isMonthly = /MONTHLY/i.test(action);

  let accentColor, accentBg, accentBorder, emoji;
  if (isError) {
    accentColor = '#f87171'; accentBg = 'rgba(239,68,68,0.08)'; accentBorder = 'rgba(239,68,68,0.2)'; emoji = '&#9888;&#65039;';
  } else if (isCrash) {
    accentColor = '#f59e0b'; accentBg = 'rgba(245,158,11,0.08)'; accentBorder = 'rgba(245,158,11,0.2)'; emoji = '&#9888;&#65039;';
  } else if (isBuy) {
    accentColor = '#34d399'; accentBg = 'rgba(16,185,129,0.08)'; accentBorder = 'rgba(16,185,129,0.2)'; emoji = '&#128994;';
  } else if (isSell) {
    accentColor = '#f87171'; accentBg = 'rgba(239,68,68,0.08)'; accentBorder = 'rgba(239,68,68,0.2)'; emoji = '&#128308;';
  } else if (isMonthly) {
    accentColor = '#818cf8'; accentBg = 'rgba(129,140,248,0.08)'; accentBorder = 'rgba(129,140,248,0.2)'; emoji = '&#128202;';
  } else {
    accentColor = '#a1a1aa'; accentBg = 'rgba(161,161,170,0.06)'; accentBorder = 'rgba(161,161,170,0.15)'; emoji = '&#128276;';
  }

  // Parse body lines into sections
  const body = lines.slice(1).join('\n').trim();
  const sections = parseBodySections(body);

  return `
    <tr><td style="padding:8px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:${accentBg};border:1px solid ${accentBorder};border-radius:12px;border-left:4px solid ${accentColor};">
        <tr><td style="padding:20px 24px;">
          ${portfolio ? `<p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#71717a;font-weight:600;">${esc(portfolio)}</p>` : ''}
          <p style="margin:0 0 ${reason ? '12' : '4'}px;font-size:16px;font-weight:700;color:${accentColor};">${emoji} ${esc(action)}</p>
          ${reason ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#d4d4d8;">${esc(reason)}</p>` : ''}
          ${sections}
        </td></tr>
      </table>
    </td></tr>`;
}

function parseBodySections(body) {
  if (!body) return '';
  const lines = body.split('\n');
  let html = '';
  let inWhatToDo = false;
  let todoItems = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (/^What to do:$/i.test(trimmed)) {
      inWhatToDo = true;
      continue;
    }

    if (inWhatToDo) {
      const stepMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
      if (stepMatch) {
        todoItems.push(stepMatch[2]);
        continue;
      } else {
        // End of todo section
        if (todoItems.length > 0) {
          html += renderTodoBox(todoItems);
          todoItems = [];
        }
        inWhatToDo = false;
      }
    }

    // Key-value lines (Price: $X, Current value: $X, etc.)
    const kvMatch = trimmed.match(/^([A-Za-z\s\/&]+):\s*(.+)$/);
    if (kvMatch) {
      html += `<p style="margin:2px 0;font-size:13px;line-height:1.5;"><span style="color:#71717a;">${esc(kvMatch[1])}:</span> <span style="color:#e4e4e7;font-family:'JetBrains Mono',monospace;font-weight:600;">${esc(kvMatch[2])}</span></p>`;
    } else if (/^\d+\.\s/.test(trimmed)) {
      // Numbered item outside "what to do"
      todoItems.push(trimmed.replace(/^\d+\.\s*/, ''));
    } else {
      html += `<p style="margin:4px 0;font-size:13px;line-height:1.5;color:#a1a1aa;">${esc(trimmed)}</p>`;
    }
  }

  if (todoItems.length > 0) {
    html += renderTodoBox(todoItems);
  }

  return html;
}

function renderTodoBox(items) {
  const steps = items.map((item, i) => {
    // Highlight dollar amounts
    const highlighted = esc(item).replace(/(\$[\d,.]+)/g, '<strong style="color:#e4e4e7;">$1</strong>');
    return `<tr>
      <td style="padding:4px 8px 4px 0;vertical-align:top;width:24px;">
        <span style="display:inline-block;width:20px;height:20px;line-height:20px;text-align:center;border-radius:50%;background:rgba(16,185,129,0.15);color:#34d399;font-size:11px;font-weight:700;">${i + 1}</span>
      </td>
      <td style="padding:4px 0;font-size:13px;line-height:1.5;color:#d4d4d8;">${highlighted}</td>
    </tr>`;
  }).join('');

  return `
    <table style="margin:12px 0 4px;padding:12px 16px;background:rgba(24,24,27,0.5);border:1px solid rgba(63,63,70,0.3);border-radius:8px;width:100%;" cellpadding="0" cellspacing="0">
      <tr><td style="padding:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#71717a;font-weight:600;">What to do</td></tr>
      ${steps}
    </table>`;
}

function renderTextCard(text) {
  return `
    <tr><td style="padding:8px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(39,39,42,0.4);border:1px solid rgba(63,63,70,0.3);border-radius:12px;">
        <tr><td style="padding:20px 24px;">
          <p style="margin:0;font-size:14px;line-height:1.6;color:#d4d4d8;">${esc(text)}</p>
        </td></tr>
      </table>
    </td></tr>`;
}

function emailWrapper(cards) {
  const now = new Date();
  const timeStr = now.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');
</style>
</head>
<body style="margin:0;padding:0;background-color:#09090b;font-family:'Inter',system-ui,-apple-system,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#09090b;padding:20px 0;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;">
      <!-- Logo -->
      <tr><td style="padding:16px 24px 24px;text-align:center;">
        <table cellpadding="0" cellspacing="0" align="center">
          <tr>
            <td style="width:32px;height:32px;background:linear-gradient(135deg,#10b981,#059669);border-radius:10px;text-align:center;line-height:32px;">
              <span style="color:white;font-size:12px;font-weight:800;letter-spacing:-0.5px;">EA</span>
            </td>
            <td style="padding-left:10px;font-size:15px;font-weight:700;color:#e4e4e7;letter-spacing:-0.3px;">Emotionless Alerts</td>
          </tr>
        </table>
      </td></tr>

      <!-- Alert cards -->
      <tr><td style="padding:0 16px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${cards}
        </table>
      </td></tr>

      <!-- Footer -->
      <tr><td style="padding:24px 24px 16px;text-align:center;">
        <p style="margin:0 0 4px;font-size:11px;color:#52525b;">Generated ${esc(timeStr)}</p>
        <p style="margin:0;font-size:11px;color:#3f3f46;">Prices are checked hourly. You place every trade yourself.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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
  const html = alertsToHtml(text);
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
          html,
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

// Exported for testing
export { alertsToHtml };
