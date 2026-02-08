-- Prüfungstrainer MVP schema (fresh start)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  username text UNIQUE NULL,
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','student')),
  display_name text NULL,
  leaderboard_opt_in boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pools (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  owner_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE questions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pool_id uuid NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  text text NOT NULL,
  lang text NULL,
  category text NULL,
  explanation text NULL,
  source_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE answers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  text text NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  source_id text NULL
);

CREATE INDEX IF NOT EXISTS questions_pool_lang_idx ON questions (pool_id, lang);
CREATE INDEX IF NOT EXISTS questions_source_id_idx ON questions (source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS answers_source_id_idx ON answers (source_id) WHERE source_id IS NOT NULL;

CREATE TABLE question_images (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  url text NULL,
  alt text NULL,
  local_path text NULL,
  sort_order int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS question_images_qid_idx ON question_images (question_id);

CREATE TABLE user_question_stats (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  asked_count int NOT NULL DEFAULT 0,
  correct_count int NOT NULL DEFAULT 0,
  streak int NOT NULL DEFAULT 0,
  last_seen_at timestamptz NULL,
  last_result text NULL CHECK (last_result IN ('correct','wrong')),
  UNIQUE (user_id, question_id)
);

CREATE TABLE learning_box_sets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  pool_id uuid NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('simple','classic')) DEFAULT 'simple',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE learning_box_items (
  set_id uuid NOT NULL REFERENCES learning_box_sets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  box int NOT NULL DEFAULT 1,
  due_at timestamptz NULL,
  PRIMARY KEY (set_id, user_id, question_id)
);

CREATE UNIQUE INDEX learning_box_sets_user_pool_name_idx ON learning_box_sets (user_id, pool_id, name);
CREATE INDEX learning_box_items_set_user_idx ON learning_box_items (set_id, user_id);
CREATE INDEX learning_box_items_due_idx ON learning_box_items (set_id, user_id, due_at);

CREATE TABLE user_wrong_questions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  wrong_count int NOT NULL DEFAULT 0,
  last_wrong_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, question_id)
);

CREATE TABLE user_later_questions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  marked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, question_id)
);

CREATE TABLE exam_sessions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pool_id uuid NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  total_questions int NOT NULL,
  correct_answers int NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL
);

CREATE TABLE exam_answers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id uuid NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  selected_answer_ids uuid[] NOT NULL,
  is_correct boolean NOT NULL DEFAULT false
);

CREATE TABLE user_gamification (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  xp numeric(10,2) NOT NULL DEFAULT 0,
  level int NOT NULL DEFAULT 0,
  last_awarded_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_gamification_xp_idx ON user_gamification (xp DESC);

CREATE TABLE badges (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  key text UNIQUE NOT NULL,
  name_de text NOT NULL,
  name_en text NOT NULL,
  description_de text NOT NULL,
  description_en text NOT NULL,
  icon text NULL
);

CREATE TABLE user_badges (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_key text NOT NULL REFERENCES badges(key) ON DELETE CASCADE,
  earned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_key)
);

CREATE INDEX user_badges_user_idx ON user_badges (user_id, earned_at DESC);

CREATE TABLE user_activity_daily (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pool_id uuid NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  activity_date date NOT NULL,
  training_correct int NOT NULL DEFAULT 0,
  training_wrong int NOT NULL DEFAULT 0,
  leitner_correct int NOT NULL DEFAULT 0,
  exam_correct int NOT NULL DEFAULT 0,
  exam_total int NOT NULL DEFAULT 0,
  total_answered int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, pool_id, activity_date)
);

CREATE INDEX user_activity_daily_user_date_idx ON user_activity_daily (user_id, activity_date DESC);
CREATE INDEX user_activity_daily_pool_date_idx ON user_activity_daily (pool_id, activity_date DESC);

CREATE TABLE leaderboard_snapshots (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  scope text NOT NULL CHECK (scope IN ('global','weekly','pool')),
  pool_id uuid NULL REFERENCES pools(id) ON DELETE CASCADE,
  period_start date NULL,
  period_end date NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  entries jsonb NOT NULL
);

CREATE INDEX leaderboard_snapshots_scope_time_idx ON leaderboard_snapshots (scope, computed_at DESC);
CREATE INDEX leaderboard_snapshots_period_idx ON leaderboard_snapshots (scope, period_start, period_end);

CREATE TABLE contests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  pool_id uuid NULL REFERENCES pools(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE contest_entries (
  contest_id uuid NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score numeric(10,2) NOT NULL DEFAULT 0,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (contest_id, user_id)
);

CREATE INDEX contests_time_idx ON contests (starts_at, ends_at);
CREATE INDEX contest_entries_contest_idx ON contest_entries (contest_id, score DESC);

CREATE TABLE friendships (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending','accepted','declined')) DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requester_id, addressee_id),
  CHECK (requester_id != addressee_id)
);

CREATE INDEX friendships_requester_idx ON friendships (requester_id, status);
CREATE INDEX friendships_addressee_idx ON friendships (addressee_id, status);
CREATE UNIQUE INDEX friendships_pair_unique_idx ON friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));

CREATE TABLE duels (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  challenger_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opponent_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  pool_id uuid NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  question_count int NOT NULL DEFAULT 5 CHECK (question_count BETWEEN 3 AND 10),
  question_ids jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('waiting','active','finished','expired')) DEFAULT 'waiting',
  CHECK (challenger_id != opponent_id),
  is_open boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL
);

CREATE TABLE duel_answers (
  duel_id uuid NOT NULL REFERENCES duels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  selected_answer_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_correct boolean NOT NULL,
  time_ms int NOT NULL DEFAULT 0 CHECK (time_ms >= 0),
  answered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (duel_id, user_id, question_id)
);

CREATE TABLE duel_results (
  duel_id uuid NOT NULL REFERENCES duels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  correct_count int NOT NULL DEFAULT 0,
  total_time_ms int NOT NULL DEFAULT 0 CHECK (total_time_ms >= 0),
  is_winner boolean NULL,
  xp_earned numeric(6,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (duel_id, user_id)
);

CREATE INDEX duels_status_idx ON duels (status, expires_at DESC);
CREATE INDEX duels_challenger_idx ON duels (challenger_id, status);
CREATE INDEX duels_opponent_idx ON duels (opponent_id, status);
CREATE INDEX duel_answers_user_idx ON duel_answers (user_id, answered_at DESC);
CREATE INDEX duel_results_user_idx ON duel_results (user_id);

CREATE TABLE password_resets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX password_resets_user_idx ON password_resets (user_id, created_at DESC);
CREATE INDEX password_resets_token_idx ON password_resets (token_hash);
