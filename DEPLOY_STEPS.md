# 昌久貹報名後台部署設定

這個資料夾是 Vercel 後端部署用：

`notify-backend-upload`

## 1. 建立 Supabase 資料表

到 Supabase 專案的 SQL Editor，貼上 `SUPABASE_SCHEMA.sql` 的內容並執行。

如果資料表已經建立過，後續只要新增上課時間、地點與學員提醒備註欄位，貼上 `SUPABASE_ADD_SESSION_TIME_LOCATION.sql` 的內容並執行。

## 2. Vercel 環境變數

在 Vercel 專案 Settings -> Environment Variables 新增：

```text
SUPABASE_URL=你的 Supabase Project URL
SUPABASE_SERVICE_ROLE_KEY=你的 Supabase service_role key
ADMIN_TOKEN=後台登入密碼
RESEND_API_KEY=目前寄信用的 Resend API Key
ADMIN_EMAIL=管理者收信 Email
MAIL_FROM=昌久貹 <order@changjiusheng.com>
LINE_CHANNEL_ACCESS_TOKEN=目前 LINE 通知用 token
LINE_USER_ID=目前 LINE 接收者 user id
CRON_SECRET=自訂一組排程密碼
BANK_NAME=銀行名稱
BANK_ACCOUNT=匯款帳號
BANK_ACCOUNT_NAME=戶名
```

`LINE_CHANNEL_ACCESS_TOKEN` 與 `LINE_USER_ID` 如果目前已經在 Vercel 設好，可以沿用。

## 3. 後台網址

部署後可用：

```text
https://你的後端網域/admin
```

登入密碼就是 `ADMIN_TOKEN`。

## 4. 狀態流程

- 客人送出報名：訂單進資料庫，狀態為 `待付款`
- 後台改成 `已付款`：系統寄付款確認信
- 後台修改場次並按「儲存並寄改期通知」：系統寄改期通知信
- 每天排程檢查明天上課且已付款的訂單：寄課前提醒信
