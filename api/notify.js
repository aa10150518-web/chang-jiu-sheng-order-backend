const {
  setCors,
  sendJson,
  parseBody,
  supabaseConfig,
  supabaseFetch,
  sendEmail,
  sendLine,
  normalizeOrder,
  composeStudentConfirmation,
} = require('./_lib');

function encodeFilter(value) {
  return encodeURIComponent(value || '');
}

function orderSubjectLabel(orderType) {
  return {
    product: '訂購作品',
    course: '課程報名',
    registration: '課程報名',
    certification: '認證報名',
    competition: '競賽報名',
    contest: '競賽報名',
  }[orderType] || '訂單';
}

function studentReceivedSubject(orderType) {
  return {
    product: '訂購資料已送出',
    course: '報名資料已送出',
    registration: '報名資料已送出',
    certification: '認證報名已送出',
    competition: '競賽報名已送出',
    contest: '競賽報名已送出',
  }[orderType] || '訂單資料已送出';
}

async function findRecentDuplicate(order) {
  if (!supabaseConfig()) return null;
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const filters = [
    'select=*',
    'order=created_at.desc',
    'limit=1',
    `created_at=gte.${encodeFilter(cutoff)}`,
    `student_name=eq.${encodeFilter(order.student_name)}`,
    `phone=eq.${encodeFilter(order.phone)}`,
    `line_id=eq.${encodeFilter(order.line_id)}`,
    `student_email=eq.${encodeFilter(order.student_email)}`,
    `items_text=eq.${encodeFilter(order.items_text)}`,
    `payment=eq.${encodeFilter(order.payment)}`,
    `note=eq.${encodeFilter(order.note)}`,
    `total=eq.${order.total || 0}`,
  ];
  const rows = await supabaseFetch(`/orders?${filters.join('&')}`);
  return Array.isArray(rows) ? rows[0] : null;
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
    const order = normalizeOrder(body);
    const duplicate = await findRecentDuplicate(order);
    if (duplicate) {
      return sendJson(res, 200, {
        ok: true,
        duplicate: true,
        order: duplicate,
        sent: [],
      });
    }
    const adminMessage = body.message || [
      '昌久貹｜新訂單通知',
      `訂單編號：${order.order_no}`,
      `姓名：${order.student_name}`,
      `電話：${order.phone}`,
      `LINE：${order.line_id}`,
      `Email：${order.student_email}`,
      '',
      order.items_text,
      '',
      `合計：${order.total > 0 ? `NT$ ${order.total.toLocaleString('zh-TW')}` : '含洽詢項目'}`,
      `付款：${order.payment}`,
      `狀態：待付款`,
    ].join('\n');

    let savedOrder = null;
    if (supabaseConfig()) {
      const saved = await supabaseFetch('/orders?on_conflict=order_no', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(order),
      });
      savedOrder = Array.isArray(saved) ? saved[0] : saved;
    }

    const jobs = [
      sendLine(adminMessage),
      sendEmail({
        to: process.env.ADMIN_EMAIL,
        subject: `昌久貹｜新${orderSubjectLabel(order.order_type)}待付款 ${order.order_no}`,
        text: adminMessage,
      }),
    ];

    if (order.student_email) {
      jobs.push(
        sendEmail({
          to: order.student_email,
          subject: `昌久貹｜${studentReceivedSubject(order.order_type)} ${order.order_no}`,
          text: composeStudentConfirmation(order),
        })
      );
    }

    const results = await Promise.allSettled(jobs);

    return sendJson(res, 200, {
      ok: true,
      order: savedOrder || order,
      sent: results.map((result) => result.status === 'fulfilled' ? result.value : { ok: false, error: result.reason?.message }),
    });
  } catch (error) {
    console.error('notify error', error);
    return sendJson(res, 500, { ok: false, error: error.message });
  }
};
