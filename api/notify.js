module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  console.log('notify api called');

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const message = body.message || '收到一筆新訂單';

    const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const lineUserId = process.env.LINE_USER_ID;
    const resendApiKey = process.env.RESEND_API_KEY;
    const adminEmail = process.env.ADMIN_EMAIL;
    const mailFrom = process.env.MAIL_FROM || '昌久貹 <onboarding@resend.dev>';

    const jobs = [];

    if (lineToken && lineUserId) {
      jobs.push(
        fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${lineToken}`,
          },
          body: JSON.stringify({
            to: lineUserId,
            messages: [{ type: 'text', text: message }],
          }),
        }).then(async (response) => ({
          service: 'line',
          ok: response.ok,
          status: response.status,
          text: await response.text(),
        }))
      );
    } else {
      console.log('LINE skipped: missing LINE_CHANNEL_ACCESS_TOKEN or LINE_USER_ID');
    }

    if (resendApiKey && adminEmail) {
      jobs.push(
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: mailFrom,
            to: adminEmail,
            subject: '昌久貹｜新訂單通知',
            text: message,
          }),
        }).then(async (response) => ({
          service: 'email',
          ok: response.ok,
          status: response.status,
          text: await response.text(),
        }))
      );
    } else {
      console.log('Email skipped: missing RESEND_API_KEY or ADMIN_EMAIL');
    }

    const results = await Promise.all(jobs);
    console.log('notify results', results);

    return res.status(200).json({
      ok: true,
      sent: {
        line: results.some((result) => result.service === 'line' && result.ok),
        email: results.some((result) => result.service === 'email' && result.ok),
      },
      results,
    });
  } catch (error) {
    console.error('notify error', error);
    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
};
