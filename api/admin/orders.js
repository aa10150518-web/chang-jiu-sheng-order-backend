const {
  setCors,
  sendJson,
  parseBody,
  requireAdmin,
  supabaseFetch,
  sendEmail,
  composePaymentConfirmation,
  composeRescheduleNotice,
} = require('../_lib');

function encodeFilter(value) {
  return encodeURIComponent(value || '');
}

function monthRangeInTaipei(month) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) return null;
  const [yearText, monthText] = month.split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) return null;
  const taipeiOffsetMs = 8 * 60 * 60 * 1000;
  return {
    start: new Date(Date.UTC(year, monthIndex, 1) - taipeiOffsetMs).toISOString(),
    end: new Date(Date.UTC(year, monthIndex + 1, 1) - taipeiOffsetMs).toISOString(),
  };
}

async function getOrderByNo(orderNo) {
  const rows = await supabaseFetch(`/orders?order_no=eq.${encodeFilter(orderNo)}&select=*`);
  return Array.isArray(rows) ? rows[0] : null;
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!requireAdmin(req, res)) return;

  try {
    if (req.method === 'GET') {
      const status = req.query.status;
      const q = (req.query.q || '').trim();
      const monthRange = monthRangeInTaipei(req.query.month);
      const filters = ['select=*', 'order=created_at.desc', 'limit=300'];
      if (status && status !== 'all') filters.push(`status=eq.${encodeFilter(status)}`);
      if (!status || status === 'all') filters.push('status=neq.deleted');
      if (monthRange) {
        filters.push(`created_at=gte.${encodeFilter(monthRange.start)}`);
        filters.push(`created_at=lt.${encodeFilter(monthRange.end)}`);
      }
      if (q) {
        const pattern = encodeFilter(`*${q}*`);
        filters.push(`or=(order_no.ilike.${pattern},student_name.ilike.${pattern},phone.ilike.${pattern},line_id.ilike.${pattern},student_email.ilike.${pattern},course_title.ilike.${pattern})`);
      }
      const orders = await supabaseFetch(`/orders?${filters.join('&')}`);
      return sendJson(res, 200, { ok: true, orders });
    }

    if (req.method === 'PATCH') {
      const body = parseBody(req);
      const orderNo = body.orderNo || body.order_no;
      if (!orderNo) {
        return sendJson(res, 400, { ok: false, error: 'Missing orderNo' });
      }

      const before = await getOrderByNo(orderNo);
      if (!before) {
        return sendJson(res, 404, { ok: false, error: 'Order not found' });
      }

      const patch = {
        updated_at: new Date().toISOString(),
      };

      if (body.status) patch.status = body.status;
      if (body.note !== undefined) patch.note = body.note;
      if (body.studentNotice !== undefined) patch.student_notice = body.studentNotice || '';
      if (body.sessionDate !== undefined) patch.session_date = body.sessionDate || null;
      if (body.sessionTime !== undefined) patch.session_time = body.sessionTime || '';
      if (body.sessionLocation !== undefined) patch.session_location = body.sessionLocation || '';
      if (body.sessionLabel !== undefined) patch.session_label = body.sessionLabel || '';
      if (body.courseTitle !== undefined) patch.course_title = body.courseTitle || '';
      if (body.status === 'paid' && before.status !== 'paid') patch.paid_at = new Date().toISOString();

      const updatedRows = await supabaseFetch(`/orders?order_no=eq.${encodeFilter(orderNo)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      const updated = Array.isArray(updatedRows) ? updatedRows[0] : updatedRows;

      const emails = [];
      if (updated.student_email && body.status === 'paid' && before.status !== 'paid') {
        emails.push(await sendEmail({
          to: updated.student_email,
          subject: `昌久貹｜付款確認 ${updated.order_no}`,
          text: composePaymentConfirmation(updated),
        }));
      }

      const changedSession = (
        body.notifyReschedule &&
        (
          body.sessionDate !== undefined && body.sessionDate !== before.session_date ||
          body.sessionTime !== undefined && body.sessionTime !== before.session_time ||
          body.sessionLocation !== undefined && body.sessionLocation !== before.session_location ||
          body.studentNotice !== undefined && body.studentNotice !== before.student_notice ||
          body.sessionLabel !== undefined && body.sessionLabel !== before.session_label
        )
      );

      if (updated.student_email && changedSession) {
        emails.push(await sendEmail({
          to: updated.student_email,
          subject: `昌久貹｜課程改期通知 ${updated.order_no}`,
          text: composeRescheduleNotice(updated),
        }));
      }

      return sendJson(res, 200, { ok: true, order: updated, emails });
    }

    return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('admin orders error', error);
    return sendJson(res, 500, { ok: false, error: error.message });
  }
};
