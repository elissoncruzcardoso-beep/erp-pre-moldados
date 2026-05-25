import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnv() {
  const envPath = resolve(process.cwd(), ".env");

  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split("=");
    const value = valueParts.join("=").trim().replace(/^["']|["']$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;

if (!token) {
  throw new Error("Defina TELEGRAM_BOT_TOKEN antes de configurar o webhook.");
}

if (!secret) {
  throw new Error("Defina TELEGRAM_WEBHOOK_SECRET antes de configurar o webhook.");
}

if (!appUrl) {
  throw new Error("Defina NEXT_PUBLIC_APP_URL com a URL publica do Vercel.");
}

const normalizedUrl = appUrl.startsWith("http") ? appUrl : `https://${appUrl}`;
const webhookUrl = `${normalizedUrl.replace(/\/$/, "")}/api/bot/telegram`;
const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ["message"],
    drop_pending_updates: process.env.TELEGRAM_DROP_PENDING_UPDATES === "true"
  })
});
const result = await response.json();

if (!response.ok || !result.ok) {
  throw new Error(`Telegram recusou o webhook: ${JSON.stringify(result)}`);
}

console.log(`Webhook configurado em ${webhookUrl}`);
