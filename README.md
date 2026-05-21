# 昌久貹訂單通知後台

這個資料夾要部署到 Vercel

部署完成後會有兩個網址：

```text
https://你的網址.vercel.app/api/webhook
https://你的網址.vercel.app/api/order
```

## Vercel 環境變數

先設定：

```text
LINE_CHANNEL_ACCESS_TOKEN = LINE Developers 的通道訪問令牌
APPS_SCRIPT_URL = Google Apps Script 網頁應用程式網址
```

取得你的 User ID 後再補：

```text
LINE_OWNER_USER_ID = 你的 LINE User ID
```

## LINE Developers

Webhook URL 請填：

```text
https://你的網址.vercel.app/api/webhook
```

這個網址不會經過 Google 轉址，所以 LINE 核實會比較穩定

## 網站前台

`index.html` 裡面的：

```js
const ORDER_API_URL = "";
```

改成：

```js
const ORDER_API_URL = "https://你的網址.vercel.app/api/order";
```
