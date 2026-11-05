CREATE TABLE users (
  id TEXT PRIMARY KEY, -- Google ID
  email TEXT NOT NULL,
  name TEXT,
  picture TEXT,
  created_at INTEGER NOT NULL, -- ms timestamps
  last_seen_at INTEGER,
  last_ip TEXT,
  last_country TEXT,
  last_chat_at INTEGER,
  blocked INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  conversation_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  text TEXT NOT NULL,
  reply TEXT,
  error TEXT,
  refused INTEGER NOT NULL DEFAULT 0,
  ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  ip TEXT,
  country TEXT,
  rating INTEGER -- 1, -1 or null
);

CREATE INDEX messages_by_user ON messages (user_id, created_at);
CREATE INDEX messages_by_time ON messages (created_at);
