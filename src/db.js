// D1 database (env.DB). Does nothing if it isn't set up.

function visitInfo(request) {
  return {
    ip: request.headers.get("CF-Connecting-IP"),
    country: request.cf?.country ?? null,
  };
}

// Returns { blocked }
export async function recordVisit(user, request, env) {
  if (!env.DB) {
    return { blocked: false };
  }

  const { ip, country } = visitInfo(request);
  const now = Date.now();

  const row = await env.DB.prepare(
    `INSERT INTO users (id, email, name, picture, created_at, last_seen_at, last_ip, last_country)
     VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?6, ?7)
     ON CONFLICT (id) DO UPDATE SET
       email = ?2, name = ?3, picture = ?4, last_seen_at = ?5, last_ip = ?6, last_country = ?7
     RETURNING blocked`
  )
    .bind(user.id, user.email, user.name ?? null, user.picture ?? null, now, ip, country)
    .first();

  return { blocked: row?.blocked === 1 };
}

// Returns the message ID
export async function saveMessage(m, request, env) {
  if (!env.DB) {
    return null;
  }

  const { ip, country } = visitInfo(request);
  const now = Date.now();

  const [insert] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO messages (user_id, conversation_id, created_at, text, reply, error, refused, ms,
         input_tokens, output_tokens, total_tokens, ip, country)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`
    ).bind(
      m.userId, m.conversationId, now, m.text, m.reply ?? null, m.error ?? null, m.refused ? 1 : 0, m.ms,
      m.usage?.total_input_tokens ?? null, m.usage?.total_output_tokens ?? null, m.usage?.total_tokens ?? null,
      ip, country
    ),
    env.DB.prepare("UPDATE users SET last_chat_at = ? WHERE id = ?").bind(now, m.userId),
  ]);

  return insert.results[0]?.id ?? null;
}

// rating: 1, -1 or null
export async function rateMessage(userId, messageId, rating, env) {
  if (!env.DB) {
    return;
  }
  await env.DB.prepare("UPDATE messages SET rating = ? WHERE id = ? AND user_id = ?")
    .bind(rating, messageId, userId)
    .run();
}

// Admin page

export async function listUsers(env) {
  const { results } = await env.DB.prepare(
    `SELECT u.*,
       COUNT(m.id) AS message_count,
       COUNT(DISTINCT m.conversation_id) AS conversation_count,
       COALESCE(SUM(m.total_tokens), 0) AS total_tokens,
       SUM(m.error IS NOT NULL) AS error_count,
       SUM(m.refused) AS refused_count,
       SUM(m.rating = -1) AS thumbs_down_count
     FROM users u
     LEFT JOIN messages m ON m.user_id = u.id
     GROUP BY u.id
     ORDER BY COALESCE(u.last_chat_at, u.last_seen_at) DESC`
  ).all();
  return results;
}

export async function getUserDetail(userId, env) {
  const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first();
  if (!user) {
    return null;
  }
  const { results } = await env.DB.prepare(
    "SELECT * FROM messages WHERE user_id = ? ORDER BY created_at"
  ).bind(userId).all();
  return { user, messages: results };
}

export async function setBlocked(userId, blocked, env) {
  await env.DB.prepare("UPDATE users SET blocked = ? WHERE id = ?")
    .bind(blocked ? 1 : 0, userId)
    .run();
}

// Errors, refusals, slow replies, thumbs down
export async function listFlagged(slowMs, env) {
  const { results } = await env.DB.prepare(
    `SELECT m.*, u.name, u.email
     FROM messages m JOIN users u ON u.id = m.user_id
     WHERE m.error IS NOT NULL OR m.refused = 1 OR m.ms > ? OR m.rating = -1
     ORDER BY m.created_at DESC
     LIMIT 200`
  ).bind(slowMs).all();
  return results;
}
