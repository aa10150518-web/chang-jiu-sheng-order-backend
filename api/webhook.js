const { setCors, sendJson, parseBody } = require('./_lib');

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  }

  try {
    // LINE webhook only needs a quick 200 response here.
    // Do not auto-reply to customers from this endpoint.
    parseBody(req);
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error('webhook error', error);
    return sendJson(res, 200, { ok: true });
  }
};
