const STATUS_LABELS = {
  pending_payment: '待付款',
  paid: '已付款',
  onsite_payment: '現場付款',
  cancelled: '已取消',
  refunded: '已退款',
  deleted: '已刪除',
};

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function sendJson(res, status, data) {
  return res.status(status).json(data);
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body || '{}');
    } catch (error) {
      return {};
    }
  }
  return req.body;
}

function requireAdmin(req, res) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) {
    sendJson(res, 500, { ok: false, error: 'Missing ADMIN_TOKEN' });
    return false;
  }
  const header = req.headers.authorization || '';
  if (header !== `Bearer ${token}`) {
    sendJson(res, 401, { ok: false, error: 'Unauthorized' });
    return false;
  }
  return true;
}

function supabaseConfig() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  return { url, key };
}

async function supabaseFetch(path, options = {}) {
  const config = supabaseConfig();
  if (!config) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const response = await fetch(`${config.url}/rest/v1${path}`, {
    ...options,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      data = text;
    }
  }

  if (!response.ok) {
    const message = typeof data === 'string' ? data : data?.message || response.statusText;
    throw new Error(`Supabase ${response.status}: ${message}`);
  }

  return data;
}

async function sendEmail({ to, subject, text }) {
  const resendApiKey = process.env.RESEND_API_KEY || process.env['重新發送 API 金鑰'];
  const from = process.env.MAIL_FROM || process.env.MAIL_ROM || '昌久貹 <order@changjiusheng.com>';
  if (!resendApiKey || !to) {
    return { service: 'email', ok: false, skipped: true };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, text }),
  });

  return {
    service: 'email',
    ok: response.ok,
    status: response.status,
    text: await response.text(),
  };
}

async function sendLine(text) {
  const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const lineUserId = process.env.LINE_USER_ID || process.env.LINE_OWNER_USER_ID;
  if (!lineToken || !lineUserId) {
    return { service: 'line', ok: false, skipped: true };
  }

  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${lineToken}`,
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: 'text', text }],
    }),
  });

  return {
    service: 'line',
    ok: response.ok,
    status: response.status,
    text: await response.text(),
  };
}

function todayInTaipei() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(`${value.year}-${value.month}-${value.day}T00:00:00+08:00`);
}

function addDays(date, days) {
  const copy = new Date(date.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function ymd(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function parseSessionDate(text) {
  if (!text) return null;
  const now = todayInTaipei();
  const currentYear = now.getFullYear();
  const patterns = [
    /(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})/,
    /(\d{1,2})\s*月\s*(\d{1,2})\s*日/,
    /(\d{1,2})[\/.-](\d{1,2})/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    let year = currentYear;
    let month;
    let day;

    if (match.length === 4) {
      year = Number(match[1]);
      month = Number(match[2]);
      day = Number(match[3]);
    } else {
      month = Number(match[1]);
      day = Number(match[2]);
    }

    const localCandidate = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00+08:00`);
    if (Number.isNaN(localCandidate.getTime())) return null;
    if (match.length !== 4 && localCandidate < addDays(now, -30)) {
      year += 1;
    }

    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return null;
}

function extractMainCourse(order) {
  const cartItems = Array.isArray(order.cartItems) ? order.cartItems : [];
  const candidate = cartItems.find((item) => /(課|班|認證|大賽|考核|模擬考|講師|參賽)/.test(item.name || '')) || cartItems[0];
  const text = candidate?.name || order.items || '';
  return {
    courseTitle: text.replace(/（.*$/, '').replace(/^•\s*/, '').trim(),
    sessionLabel: text,
    sessionDate: parseSessionDate(text),
  };
}

function normalizeOrder(body) {
  const mainCourse = extractMainCourse(body);
  const noteParts = [body.note || ''];
  if (body.shippingAddress && !String(body.note || '').includes('收件地址')) {
    noteParts.push(`收件地址：${body.shippingAddress}`);
  }
  const payment = body.payment || '';
  return {
    order_no: body.orderNo || `CJS-${Date.now().toString().slice(-8)}`,
    status: body.status || body.orderStatus || 'pending_payment',
    order_type: body.orderType || 'registration',
    student_name: body.studentName || body.name || '',
    student_email: body.studentEmail || body.email || '',
    phone: body.phone || '',
    line_id: body.lineId || '',
    city: body.city || '',
    class_city: body.classCity || '',
    items_text: body.items || '',
    items: Array.isArray(body.cartItems) ? body.cartItems : [],
    total: Number(body.total || 0),
    payment,
    note: noteParts.filter(Boolean).join('\n'),
    student_notice: body.studentNotice || '',
    course_title: mainCourse.courseTitle,
    session_label: mainCourse.sessionLabel,
    session_date: mainCourse.sessionDate,
    session_time: body.sessionTime || '',
    session_location: body.sessionLocation || body.shippingAddress || '',
    requested_ship_date: body.requestedShipDate || body.requested_ship_date || body.latestShipDate || null,
    shipping_status: body.shippingStatus || body.shipping_status || 'not_shipped',
    shipped_at: body.shippedAt || body.shipped_at || null,
    shipping_method: body.shippingMethod || body.shipping_method || '',
    tracking_number: body.trackingNumber || body.tracking_number || '',
    shipping_note: body.shippingNote || body.shipping_note || '',
  };
}

function bankText() {
  const bankName = process.env.BANK_NAME || '';
  const bankAccount = process.env.BANK_ACCOUNT || '';
  const bankHolder = process.env.BANK_ACCOUNT_NAME || '';
  const rows = [];
  if (bankName) rows.push(`銀行：${bankName}`);
  if (bankAccount) rows.push(`帳號：${bankAccount}`);
  if (bankHolder) rows.push(`戶名：${bankHolder}`);
  return rows.length ? rows.join('\n') : '請依照網站頁面提供的匯款資訊完成轉帳。';
}

function classInfoLines(order) {
  return [
    order.session_date ? `上課日期：${order.session_date}` : '',
    order.session_time ? `上課時間：${order.session_time}` : '',
    order.session_location ? `上課地點：${order.session_location}` : '',
    order.student_notice ? `提醒事項：${order.student_notice}` : '',
  ].filter(Boolean);
}

function composeStudentConfirmation(order) {
  return [
    `${order.student_name || '您好'}，您好：`,
    '',
    '我們已收到您的報名資料，訂單目前狀態為「待付款」。',
    '請完成匯款後，透過 LINE 傳送匯款截圖與訂單編號，待確認款項後會寄出付款確認通知。',
    '',
    `訂單編號：${order.order_no}`,
    `報名項目：${order.items_text || order.session_label || order.course_title || '報名項目'}`,
    ...classInfoLines(order),
    `合計金額：${order.total > 0 ? `NT$ ${order.total.toLocaleString('zh-TW')}` : '含洽詢項目'}`,
    `付款方式：${order.payment || '未選擇'}`,
    '',
    bankText(),
    '',
    '如有問題，請直接回覆此信或透過 LINE 聯繫我們。',
    '昌久貹',
  ].join('\n');
}

function composePaymentConfirmation(order) {
  return [
    `${order.student_name || '您好'}，您好：`,
    '',
    '您的款項已確認，報名狀態已更新為「已付款」。',
    '',
    `訂單編號：${order.order_no}`,
    `報名項目：${order.items_text || order.session_label || order.course_title || '報名項目'}`,
    ...classInfoLines(order),
    '',
    '課前一天系統會再寄出上課提醒通知。',
    '昌久貹',
  ].filter(Boolean).join('\n');
}

function composeRescheduleNotice(order) {
  return [
    `${order.student_name || '您好'}，您好：`,
    '',
    '您的報名場次已更新。',
    '',
    `訂單編號：${order.order_no}`,
    `報名項目：${order.session_label || order.course_title || order.items_text || '報名項目'}`,
    ...classInfoLines(order),
    '',
    '請依更新後場次安排上課，如有問題請與我們聯繫。',
    '昌久貹',
  ].filter(Boolean).join('\n');
}

function composeReminder(order) {
  return [
    `${order.student_name || '您好'}，您好：`,
    '',
    '提醒您，已報名並完成付款的課程即將上課。',
    '',
    `訂單編號：${order.order_no}`,
    `課程項目：${order.session_label || order.course_title || order.items_text || '報名課程'}`,
    ...classInfoLines(order),
    '',
    '請依課程通知準時出席。如需協助，請透過 LINE 與我們聯繫。',
    '昌久貹',
  ].filter(Boolean).join('\n');
}

function orderKind(order) {
  if (order.order_type === 'product') return 'product';
  if (order.order_type === 'course' || order.order_type === 'registration') return 'course';
  if (order.order_type === 'competition' || order.order_type === 'contest') return 'contest';
  if (order.order_type === 'certification') return 'certification';
  const text = [
    order.order_type,
    order.items_text,
    order.session_label,
    order.course_title,
  ].filter(Boolean).join(' ');
  if (/(大賽|比賽|競賽|參賽)/.test(text)) return 'contest';
  if (/(認證|考核|模擬考|講師)/.test(text)) return 'certification';
  return 'course';
}

function kindText(order) {
  const kind = orderKind(order);
  if (kind === 'contest') {
    return {
      action: '參賽報名',
      item: '賽事項目',
      date: '賽事日期',
      time: '賽事時間',
      location: '賽事地點',
      reminderIntro: '提醒您，已完成報名確認的賽事即將進行。',
      reminderClose: '請依賽事通知準時出席。如需協助，請透過 LINE 與我們聯繫。',
      paidClose: '賽事前一天系統會再寄出提醒通知。',
    };
  }
  if (kind === 'certification') {
    return {
      action: '認證報名',
      item: '認證項目',
      date: '認證日期',
      time: '認證時間',
      location: '認證地點',
      reminderIntro: '提醒您，已完成報名確認的認證即將進行。',
      reminderClose: '請依認證通知準時出席。如需協助，請透過 LINE 與我們聯繫。',
      paidClose: '認證前一天系統會再寄出提醒通知。',
    };
  }
  if (kind === 'product') {
    return {
      action: '訂購',
      item: '訂購項目',
      date: '預計日期',
      time: '預計時間',
      location: '收件資訊',
      reminderIntro: '提醒您，訂購作品的後續通知請留意 Email 或 LINE。',
      reminderClose: '如需修改收件資料或訂製內容，請透過 LINE 與我們聯繫。',
      paidClose: '我們會依訂單內容安排製作與後續通知。',
    };
  }
  return {
    action: '課程報名',
    item: '課程項目',
    date: '上課日期',
    time: '上課時間',
    location: '上課地點',
    reminderIntro: '提醒您，已完成報名確認的課程即將上課。',
    reminderClose: '請依課程通知準時出席。如需協助，請透過 LINE 與我們聯繫。',
    paidClose: '課前一天系統會再寄出上課提醒通知。',
  };
}

function classInfoLines(order) {
  const labels = kindText(order);
  return [
    order.session_date ? `${labels.date}：${order.session_date}` : '',
    order.session_time ? `${labels.time}：${order.session_time}` : '',
    order.session_location ? `${labels.location}：${order.session_location}` : '',
    order.student_notice ? `提醒事項：${order.student_notice}` : '',
  ].filter(Boolean);
}

function composeStudentConfirmation(order) {
  const labels = kindText(order);
  const isOnsitePayment = order.status === 'onsite_payment' || /現場/.test(order.payment || '');
  const statusLines = isOnsitePayment
    ? [
      `${labels.action}成功，系統已為您保留名額。`,
      '這封信即為報名成功通知，付款狀態為「現場付款」。',
      '請依課前通知準時到現場完成繳費與核對。',
    ]
    : [
      `我們已收到您的${labels.action}資料，訂單目前狀態為「待付款」。`,
      '請完成匯款後，透過 LINE 傳送匯款截圖與訂單編號，待確認款項後會寄出付款確認通知。',
    ];
  return [
    `${order.student_name || '您好'}，您好：`,
    '',
    ...statusLines,
    '',
    `訂單編號：${order.order_no}`,
    `${labels.item}：${order.items_text || order.session_label || order.course_title || labels.item}`,
    ...classInfoLines(order),
    `合計金額：${order.total > 0 ? `NT$ ${order.total.toLocaleString('zh-TW')}` : '含洽詢項目'}`,
    `付款方式：${order.payment || '未選擇'}`,
    '',
    isOnsitePayment ? '付款提醒：請於上課或活動當天現場完成付款。' : bankText(),
    '',
    '如有問題，請直接回覆此信或透過 LINE 聯繫我們。',
    '昌久貹',
  ].join('\n');
}

function composePaymentConfirmation(order) {
  const labels = kindText(order);
  return [
    `${order.student_name || '您好'}，您好：`,
    '',
    `您的款項已確認，${labels.action}狀態已更新為「已付款」。`,
    '',
    `訂單編號：${order.order_no}`,
    `${labels.item}：${order.items_text || order.session_label || order.course_title || labels.item}`,
    ...classInfoLines(order),
    '',
    labels.paidClose,
    '昌久貹',
  ].filter(Boolean).join('\n');
}

function composeRescheduleNotice(order) {
  const labels = kindText(order);
  return [
    `${order.student_name || '您好'}，您好：`,
    '',
    `您的${labels.action}資訊已更新。`,
    '',
    `訂單編號：${order.order_no}`,
    `${labels.item}：${order.session_label || order.course_title || order.items_text || labels.item}`,
    ...classInfoLines(order),
    '',
    '請依更新後資訊安排出席，如有問題請與我們聯繫。',
    '昌久貹',
  ].filter(Boolean).join('\n');
}

function composeReminder(order) {
  const labels = kindText(order);
  return [
    `${order.student_name || '您好'}，您好：`,
    '',
    labels.reminderIntro,
    '',
    `訂單編號：${order.order_no}`,
    `${labels.item}：${order.session_label || order.course_title || order.items_text || labels.item}`,
    ...classInfoLines(order),
    '',
    labels.reminderClose,
    '昌久貹',
  ].filter(Boolean).join('\n');
}

module.exports = {
  STATUS_LABELS,
  setCors,
  sendJson,
  parseBody,
  requireAdmin,
  supabaseConfig,
  supabaseFetch,
  sendEmail,
  sendLine,
  todayInTaipei,
  addDays,
  ymd,
  normalizeOrder,
  composeStudentConfirmation,
  composePaymentConfirmation,
  composeRescheduleNotice,
  composeReminder,
};
