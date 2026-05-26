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
    const studentEmail = body.studentEmail || '';
    const studentName = body.studentName || '學員';
    const orderNo = body.orderNo || '';
    const items = body.items || '';
    const total = Number(body.total || 0);
    const payment = body.payment || '未選擇';
    const note = body.note || '';

    const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const lineUserId = process.env.LINE_USER_ID;
    const resendApiKey = process.env.RESEND_API_KEY;
    const adminEmail = process.env.ADMIN_EMAIL;
    const mailFrom = process.env.MAIL_FROM || '昌久貹 <onboarding@resend.dev>';

    const studentMessage = [
      `${studentName} 您好：`,
      '',
      '我們已收到您的報名資料，以下是本次報名內容：',
      '',
      `訂單編號：${orderNo || '系統已建立'}`,
      '報名項目：',
      items || '詳見報名資料',
      '',
      `合計金額：${total > 0 ? `NT$ ${total.toLocaleString('zh-TW')}` : '含洽詢項目'}`,
      `付款方式：${payment}`,
      note ? `備註：${note}` : '',
      '',
      '若資料有誤，請直接回覆 LINE 官方帳號與我們聯繫。',
      '謝謝您報名昌久貹課程。',
    ].filter(Boolean).join('\n');

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
            subject: `昌久貹｜新訂單通知${orderNo ? ` ${orderNo}` : ''}`,
            text: message,
          }),
        }).then(async (response) => ({
          service: 'admin-email',
          ok: response.ok,
          status: response.status,
          text: await response.text(),
        }))
      );
    } else {
      console.log('Admin email skipped: missing RESEND_API_KEY or ADMIN_EMAIL');
    }

    if (resendApiKey && studentEmail) {
      jobs.push(
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: mailFrom,
            to: studentEmail,
            subject: `昌久貹｜報名確認${orderNo ? ` ${orderNo}` : ''}`,
            text: studentMessage,
          }),
        }).then(async (response) => ({
          service: 'student-email',
          ok: response.ok,
          status: response.status,
          text: await response.text(),
        }))
      );
    } else {
      console.log('Student email skipped: missing RESEND_API_KEY or studentEmail');
    }

    const results = await Promise.all(jobs);
    console.log('notify results', results);

    return res.status(200).json({
      ok: true,
      sent: {
        line: results.some((result) => result.service === 'line' && result.ok),
        adminEmail: results.some((result) => result.service === 'admin-email' && result.ok),
        studentEmail: results.some((result) => result.service === 'student-email' && result.ok),
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
