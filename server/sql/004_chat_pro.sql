ALTER TABLE chat_conversations
  ADD COLUMN IF NOT EXISTS unread_guest INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_guest_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_auto_offline_at TIMESTAMPTZ;

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS attachment_url TEXT,
  ADD COLUMN IF NOT EXISTS attachment_name TEXT,
  ADD COLUMN IF NOT EXISTS attachment_type TEXT,
  ADD COLUMN IF NOT EXISTS attachment_size BIGINT,
  ADD COLUMN IF NOT EXISTS is_auto BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_chat_conversations_unread_admin ON chat_conversations(unread_admin);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_unread_guest ON chat_conversations(unread_guest);
