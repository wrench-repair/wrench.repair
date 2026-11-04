// set WEBHOOK_URL
// Posts each chat message to a Discord webhook as an embed:
// green = fine, yellow = worth a look, red = Gemini failed

const GREEN = 0x2ecc71;
const YELLOW = 0xf1c40f;
const RED = 0xe74c3c;

const SLOW_MS = 15000;

const cut = (s, n) => (s.length > n ? s.slice(0, n) + "…" : s);

// "US" -> "🇺🇸 US"
function countryWithFlag(code) {
  if (!code || !/^[A-Z]{2}$/.test(code) || code === "XX") {
    return "Unknown";
  }
  const flag = String.fromCodePoint(...[...code].map(c => 0x1f1e6 + c.charCodeAt(0) - 65));
  return flag + " " + code;
}

function describeError(error) {
  if (error.reason === "API_KEY_INVALID") {
    return "API key problem (" + error.status + ")";
  }
  switch (error.status) {
    case 429: return "Quota or rate limit hit (429)";
    case 503: return "Gemini is overloaded (503)";
    case 400: return "Bad request (400)";
    case 401:
    case 403: return "API key problem (" + error.status + ")";
    case undefined: return "Couldn't reach Gemini";
    default: return "Gemini error (" + error.status + ")";
  }
}

// log: { user, text, messageNumber, country, ms, reply, usage } or { ..., error }
export async function notifyWebhook(log, env) {
  if (!env.WEBHOOK_URL) {
    return;
  }

  const { user, text, messageNumber, country, ms, reply, usage, error } = log;

  let color = GREEN;
  const notes = [];
  const fields = [];

  if (error) {
    color = RED;
    fields.push({ name: "❌ " + describeError(error), value: cut(error.message, 1000) });
  } else {
    const refused = /I can only help with car|I can't help with that/i.test(reply);
    if (refused) notes.push("Refused (off-topic or not allowed)");
    if (!reply.trim()) notes.push("Empty reply");
    if (ms > SLOW_MS) notes.push("Slow reply");
    if (notes.length) color = YELLOW;

    fields.push({ name: "AI replied", value: cut(reply || "(empty)", 1000) });
    fields.push({
      name: "Tokens",
      value: `${usage.total_tokens ?? "?"} (${usage.total_input_tokens ?? "?"} in / ${usage.total_output_tokens ?? "?"} out)`,
      inline: true,
    });
  }

  fields.push({ name: "Response time", value: (ms / 1000).toFixed(1) + "s", inline: true });
  fields.push({ name: "Message #", value: String(messageNumber), inline: true });
  fields.push({ name: "Country", value: countryWithFlag(country), inline: true });

  if (notes.length) {
    fields.push({ name: "⚠️ Notes", value: notes.join(", ") });
  }

  const embed = {
    color,
    author: { name: cut(`${user.name} (${user.email})`, 250), icon_url: user.picture || undefined },
    description: cut(text, 2000),
    fields,
    timestamp: new Date().toISOString(),
  };

  try {
    const response = await fetch(env.WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }),
    });

    if (!response.ok) {
      console.error("Webhook failed: " + response.status);
    }
  } catch (error) {
    console.error("Webhook failed: " + error.message);
  }
}
