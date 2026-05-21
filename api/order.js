export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    return cors(res).status(200).end();
  }

  if (req.method !== "POST") {
    return cors(res).status(405).json({ ok: false, message: "Method not allowed" });
  }

  const order = req.body || {};

  try {
    await Promise.all([
      pushOwnerMessage(formatOrderMessage(order)),
      appendToSheet(order)
    ]);

    return cors(res).status(200).json({ ok: true, orderId: order.orderId });
  } catch (error) {
    return cors(res).status(500).json({
      ok: false,
      message: error?.message || "Order notification failed"
    });
  }
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

function formatOrderMessage(order) {
  return [
    "🛒 昌久貹｜新訂單通知",
    "━━━━━━━━━━━━",
    `📋 訂單編號：${order.orderId || ""}`,
    `👤 姓名：${order.name || ""}`,
    `📞 電話：${order.phone || ""}`,
    `💬 LINE：${order.lineId || ""}`,
    `📧 Email：${order.email || ""}`,
    `📍 地址：${order.address || ""}`,
    "━━━━━━━━━━━━",
    "📦 項目：",
    ...(order.items || []).map(item => `・${item}`),
    "━━━━━━━━━━━━",
    `💰 合計：NT$ ${Number(order.total || 0).toLocaleString("zh-TW")}`,
    `💳 付款：${order.paymentMethod || ""}`,
    `⏰ ${order.createdAt || new Date().toLocaleString("zh-TW")}`
  ].filter(Boolean).join("\n");
}

async function pushOwnerMessage(text) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const ownerUserId = process.env.LINE_OWNER_USER_ID;

  if (!token || !ownerUserId) {
    throw new Error("LINE env vars missing");
  }

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      to: ownerUserId,
      messages: [{ type: "text", text }]
    })
  });

  if (!response.ok) {
    throw new Error(`LINE push failed: ${response.status}`);
  }
}

async function appendToSheet(order) {
  const appsScriptUrl = process.env.APPS_SCRIPT_URL;

  if (!appsScriptUrl) {
    return;
  }

  await fetch(appsScriptUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      type: "order",
      ...order
    })
  });
}
