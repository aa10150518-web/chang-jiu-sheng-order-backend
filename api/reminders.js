const {
  setCors,
  sendJson,
  supabaseFetch,
  sendEmail,
  todayInTaipei,
  addDays,
  ymd,
  composeReminder,
} = require('./_lib');

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return sendJson(res, 401, { ok: false, error: 'Unauthorized' });
  }

  try {
    const targetDate = ymd(addDays(todayInTaipei(), 1));
    const orders = await supabaseFetch(`/orders?status=in.(paid,onsite_payment)&session_date=eq.${targetDate}&reminder_sent_at=is.null&student_email=not.is.null&select=*`);
    const sent = [];

    for (const order of orders || []) {
      const result = await sendEmail({
        to: order.student_email,
        subject: `昌久貹｜課前提醒 ${order.order_no}`,
        text: composeReminder(order),
      });

      if (result.ok) {
        await supabaseFetch(`/orders?order_no=eq.${encodeURIComponent(order.order_no)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            reminder_sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
        });
      }

      sent.push({ orderNo: order.order_no, email: order.student_email, ok: result.ok, status: result.status });
    }

    return sendJson(res, 200, { ok: true, targetDate, sent });
  } catch (error) {
    console.error('reminders error', error);
    return sendJson(res, 500, { ok: false, error: error.message });
  }
};
