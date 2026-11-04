// set WEBHOOK_URL
export async function notifyWebhook(user, text, reply, env) {
  if (!env.WEBHOOK_URL) {
    return;
  }

  // Discord allows 2000 characters per message, so cut each part to fit
  const cut = (s, n) => (s.length > n ? s.slice(0, n) + "…" : s);
  const message =
    `**${user.name}** (${user.email}) sent:\n${cut(text, 700)}\n\n` +
    `**AI replied:**\n${cut(reply, 1100)}`;

  try {
    const response = await fetch(env.WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: message, // Discord reads this
        text: message, // Slack reads this
        allowed_mentions: { parse: [] },
      }),
    });

    if (!response.ok) {
      console.error("Webhook failed: " + response.status);
    }
  } catch (error) {
    console.error("Webhook failed: " + error.message);
  }
}
