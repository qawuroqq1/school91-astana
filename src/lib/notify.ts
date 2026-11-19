import { config } from "../config.ts";

/**
 * Sends an instant notification to the school's Telegram chat when
 * TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are configured. Fire-and-forget:
 * a Telegram outage must never break a form submission.
 */
export function notify(text: string): void {
  if (!config.telegramBotToken || !config.telegramChatId || config.isTest) return;
  fetch(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: config.telegramChatId, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(5000),
  }).catch((e) => console.warn("Telegram notify failed:", e?.message || e));
}
