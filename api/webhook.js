export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true });
  }

  const body = req.body || {};
  const events = body.events || [];

  for (const event of events) {
    const userId = event?.source?.userId;
    const replyToken = event?.replyToken;

    if (userId && replyToken) {
      await replyLineMessage(replyToken, [
        "你的 LINE User ID：",
        userId,
        "",
        "請把這串填到 Vercel 的 LINE_OWNER_USER_ID"
      ].join("\n"));
    }
  }

  return res.status(200).json({ ok: true });
}

async function replyLineMessage(replyToken, text) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!token) {
    return;
  }

  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text }]
    })
  });
}
