const {
  setCors,
  sendJson,
  parseBody,
  supabaseFetch,
  sendEmail,
  sendLine,
} = require('./_lib');

function encodeFilter(value) {
  return encodeURIComponent(value || '');
}

function cleanLast5(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 5);
}

function sameText(a, b) {
  return String(a || '').trim() === String(b || '').trim();
}

function appendPaymentCode(note, last5) {
  const line = `匯款後五碼：${last5}`;
  const current = String(note || '').trim();
  if (!current) return line;
  if (/匯款後五碼[:：]\s*\d{5}/.test(current)) {
    return current.replace(/匯款後五碼[:：]\s*\d{5}/, line);
  }
  return `${current}\n${line}`;
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  }

  try {
    const body = parseBody(req);
    const orderNo = String(body.orderNo || body.order_no || '').trim();
    const last5 = cleanLast5(body.last5 || body.paymentLast5 || body.payment_code);

    if (!orderNo) return sendJson(res, 400, { ok: false, error: 'Missing orderNo' });
    if (!/^\d{5}$/.test(last5)) {
      return sendJson(res, 400, { ok: false, error: '請填寫 5 碼數字' });
    }

    const rows = await supabaseFetch(`/orders?order_no=eq.${encodeFilter(orderNo)}&select=*`);
    const order = Array.isArray(rows) ? rows[0] : null;
    if (!order) return sendJson(res, 404, { ok: false, error: 'Order not found' });

    const hasMatch = (
      sameText(body.phone, order.phone) ||
      sameText(body.email, order.student_email) ||
      sameText(body.studentEmail, order.student_email) ||
      sameText(body.lineId, order.line_id)
    );

    if (!hasMatch) {
      return sendJson(res, 403, { ok: false, error: 'Order verification failed' });
    }

    const updatedNote = appendPaymentCode(order.note, last5);
    const updatedRows = await supabaseFetch(`/orders?order_no=eq.${encodeFilter(orderNo)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        note: updatedNote,
        updated_at: new Date().toISOString(),
      }),
    });
    const updated = Array.isArray(updatedRows) ? updatedRows[0] : updatedRows;

    const adminMessage = [
      '💰 昌久貹｜補填匯款後五碼',
      '━━━━━━━━━━━━',
      `訂單編號：${order.order_no}`,
      `姓名：${order.student_name || '未填'}`,
      `電話：${order.phone || '未填'}`,
      `LINE：${order.line_id || '未填'}`,
      `匯款後五碼：${last5}`,
      '━━━━━━━━━━━━',
      '此筆已更新在原本訂單備註，不會新增訂單。',
    ].join('\n');

    const jobs = [
      sendLine(adminMessage),
      sendEmail({
        to: process.env.ADMIN_EMAIL,
        subject: `昌久貹｜補填匯款後五碼 ${order.order_no}`,
        text: adminMessage,
      }),
    ];
    const sent = await Promise.allSettled(jobs);

    return sendJson(res, 200, {
      ok: true,
      order: updated,
      sent: sent.map((result) => result.status === 'fulfilled' ? result.value : { ok: false, error: result.reason?.message }),
    });
  } catch (error) {
    console.error('payment-code error', error);
    return sendJson(res, 500, { ok: false, error: error.message });
  }
};
