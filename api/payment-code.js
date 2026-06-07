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

function cleanText(value) {
  return String(value || '').trim();
}

function sameText(a, b) {
  return cleanText(a) === cleanText(b);
}

function sameLooseText(a, b) {
  return cleanText(a).toLowerCase() === cleanText(b).toLowerCase();
}

function cleanDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function samePhone(a, b) {
  const left = cleanDigits(a);
  const right = cleanDigits(b);
  return left && right && left === right;
}

function contactMatches(body, order) {
  return (
    samePhone(body.phone, order.phone) ||
    sameLooseText(body.email, order.student_email) ||
    sameLooseText(body.studentEmail, order.student_email) ||
    sameLooseText(body.lineId, order.line_id) ||
    sameLooseText(body.line_id, order.line_id)
  );
}

function nameMatches(body, order) {
  return sameText(body.name, order.student_name) || sameText(body.studentName, order.student_name);
}

function appendPaymentCode(note, last5) {
  const line = `匯款後五碼：${last5}`;
  const current = cleanText(note);
  if (!current) return line;
  if (/匯款後五碼：\s*\d{5}/.test(current)) {
    return current.replace(/匯款後五碼：\s*\d{5}/, line);
  }
  return `${current}\n${line}`;
}

async function findOrder(body) {
  const orderNo = cleanText(body.orderNo || body.order_no);
  const name = cleanText(body.name || body.studentName);

  if (orderNo) {
    const rows = await supabaseFetch(`/orders?order_no=eq.${encodeFilter(orderNo)}&select=*`);
    const order = Array.isArray(rows) ? rows[0] : null;
    if (!order) return { errorStatus: 404, error: '找不到這筆訂單，請確認訂單編號。' };
    if (!contactMatches(body, order) && !nameMatches(body, order)) {
      return { errorStatus: 403, error: '資料與訂單不符，請確認姓名、電話或 LINE。' };
    }
    return { order };
  }

  if (!name) {
    return { errorStatus: 400, error: '請填寫下單姓名，或直接填訂單編號。' };
  }
  if (!cleanText(body.phone) && !cleanText(body.lineId || body.line_id) && !cleanText(body.email || body.studentEmail)) {
    return { errorStatus: 400, error: '請至少填寫電話、LINE 或 Email 其中一項，避免補錯訂單。' };
  }

  const rows = await supabaseFetch(`/orders?student_name=eq.${encodeFilter(name)}&status=neq.deleted&select=*&order=created_at.desc&limit=20`);
  const matched = (Array.isArray(rows) ? rows : []).filter((order) => contactMatches(body, order));
  if (!matched.length) {
    return { errorStatus: 404, error: '找不到符合姓名與聯絡資料的訂單。' };
  }

  const pending = matched.filter((order) => order.status === 'pending_payment' || order.status === 'onsite_payment');
  return { order: pending[0] || matched[0] };
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
    const last5 = cleanLast5(body.last5 || body.paymentLast5 || body.payment_code);

    if (!/^\d{5}$/.test(last5)) {
      return sendJson(res, 400, { ok: false, error: '請填寫 5 碼匯款帳號後五碼。' });
    }

    const result = await findOrder(body);
    if (result.error) return sendJson(res, result.errorStatus || 400, { ok: false, error: result.error });

    const order = result.order;
    const updatedNote = appendPaymentCode(order.note, last5);
    const updatedRows = await supabaseFetch(`/orders?order_no=eq.${encodeFilter(order.order_no)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        note: updatedNote,
        updated_at: new Date().toISOString(),
      }),
    });
    const updated = Array.isArray(updatedRows) ? updatedRows[0] : updatedRows;

    const adminMessage = [
      '💰 昌久貹｜客人補填匯款後五碼',
      '━━━━━━━━━━━━',
      `訂單編號：${order.order_no}`,
      `姓名：${order.student_name || '未填'}`,
      `電話：${order.phone || '未填'}`,
      `LINE：${order.line_id || '未填'}`,
      `匯款後五碼：${last5}`,
      '━━━━━━━━━━━━',
      '請到後台依同一筆訂單核對款項。',
    ].join('\n');

    const sent = await Promise.allSettled([
      sendLine(adminMessage),
      sendEmail({
        to: process.env.ADMIN_EMAIL,
        subject: `昌久貹｜補填匯款後五碼 ${order.order_no}`,
        text: adminMessage,
      }),
    ]);

    return sendJson(res, 200, {
      ok: true,
      order: updated,
      orderNo: order.order_no,
      sent: sent.map((item) => item.status === 'fulfilled' ? item.value : { ok: false, error: item.reason?.message }),
    });
  } catch (error) {
    console.error('payment-code error', error);
    return sendJson(res, 500, { ok: false, error: error.message });
  }
};
