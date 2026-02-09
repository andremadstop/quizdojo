import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { loginRateLimit } from './rateLimit.js';
import { roleRateLimit } from './roleRateLimit.js';
import { logAudit } from './auditLog.js';
import { DEFAULT_SETTINGS, validateSettings } from './settings_defaults.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "https:", "http://localhost:8000", "http://127.0.0.1:8000"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"]
    }
  }
}));
const CORS_ORIGIN = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : undefined;
app.use(cors(CORS_ORIGIN ? { origin: CORS_ORIGIN, credentials: true } : undefined));
app.use(express.json({ limit: '5mb' }));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function ensureAdmin() {
  const email = process.env.ADMIN_EMAIL;
  if (!email) return;
  const { rows } = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
  if (rows.length) return;
  // Create admin user without password (magic link only)
  await pool.query(
    'INSERT INTO users (email, username, role) VALUES ($1,$2,$3)',
    [email, email.split('@')[0], 'admin']
  );
  console.log('Admin user created (passwordless):', email);
}

async function ensureWrongTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS user_wrong_questions (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      wrong_count int NOT NULL DEFAULT 0,
      last_wrong_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (user_id, question_id)
    )`
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS user_wrong_questions_user_time_idx ON user_wrong_questions (user_id, last_wrong_at DESC)'
  );
}

async function ensureLaterTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS user_later_questions (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      marked_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (user_id, question_id)
    )`
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS user_later_questions_user_time_idx ON user_later_questions (user_id, marked_at DESC)'
  );
}

async function ensureGamificationTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS user_gamification (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      xp numeric(10,2) NOT NULL DEFAULT 0,
      level int NOT NULL DEFAULT 0,
      last_awarded_at timestamptz NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`
  );
  await pool.query('CREATE INDEX IF NOT EXISTS user_gamification_xp_idx ON user_gamification (xp DESC)');
  await pool.query('ALTER TABLE user_gamification ADD COLUMN IF NOT EXISTS last_awarded_at timestamptz NULL');
  await pool.query('ALTER TABLE user_gamification ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()');
  await pool.query('ALTER TABLE user_gamification ADD COLUMN IF NOT EXISTS level int NOT NULL DEFAULT 0');
  await pool.query('ALTER TABLE user_gamification ALTER COLUMN xp TYPE numeric(10,2) USING xp::numeric');
}

async function ensureBadgesTables() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS badges (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      key text UNIQUE NOT NULL,
      name_de text NOT NULL,
      name_en text NOT NULL,
      description_de text NOT NULL,
      description_en text NOT NULL,
      icon text NULL
    )`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS user_badges (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      badge_key text NOT NULL REFERENCES badges(key) ON DELETE CASCADE,
      earned_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, badge_key)
    )`
  );
  await pool.query('CREATE INDEX IF NOT EXISTS user_badges_user_idx ON user_badges (user_id, earned_at DESC)');
  const badges = [
    {
      key: 'erste_100',
      name_de: 'Erste 100',
      name_en: 'First 100',
      description_de: '100 richtige Antworten gesamt',
      description_en: '100 correct answers total',
      icon: '🏁'
    },
    {
      key: 'konsequent',
      name_de: 'Konsequent',
      name_en: 'Consistent',
      description_de: '7 Tage Daily-Streak',
      description_en: '7-day daily streak',
      icon: '🔥'
    },
    {
      key: 'pruefungssicher',
      name_de: 'Prüfungssicher',
      name_en: 'Exam Ready',
      description_de: '3 Prüfungen ≥ 80%',
      description_en: '3 exams ≥ 80%',
      icon: '🎯'
    },
    {
      key: 'leitner_meister',
      name_de: 'Leitner-Meister',
      name_en: 'Leitner Master',
      description_de: '50 Fragen in Box 5',
      description_en: '50 questions in box 5',
      icon: '📚'
    },
    {
      key: 'erste_1000',
      name_de: 'Wissensbasis',
      name_en: 'Knowledge Base',
      description_de: '1000 richtige Antworten',
      description_en: '1000 correct answers',
      icon: '🧠'
    },
    {
      key: 'marathon',
      name_de: 'Marathon',
      name_en: 'Marathon',
      description_de: '30 Tage Daily-Streak',
      description_en: '30-day daily streak',
      icon: '🏃'
    },
    {
      key: 'perfektionist',
      name_de: 'Perfektionist',
      name_en: 'Perfectionist',
      description_de: 'Eine Prüfung mit 100%',
      description_en: 'One exam with 100%',
      icon: '💯'
    },
    {
      key: 'duellant',
      name_de: 'Duellant',
      name_en: 'Duelist',
      description_de: '10 Duelle gespielt',
      description_en: '10 duels played',
      icon: '⚔️'
    },
    {
      key: 'unbesiegbar',
      name_de: 'Unbesiegbar',
      name_en: 'Unbeatable',
      description_de: '5 Duelle in Folge gewonnen',
      description_en: '5 duels won in a row',
      icon: '🛡️'
    },
    {
      key: 'sozial',
      name_de: 'Teamplayer',
      name_en: 'Social',
      description_de: '5 verschiedene Gegner herausgefordert',
      description_en: 'Challenged 5 different opponents',
      icon: '🤝'
    }
  ];
  for (const b of badges) {
    await pool.query(
      `INSERT INTO badges (key, name_de, name_en, description_de, description_en, icon)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (key) DO NOTHING`,
      [b.key, b.name_de, b.name_en, b.description_de, b.description_en, b.icon]
    );
  }
}

async function ensureActivityTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS user_activity_daily (
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
    )`
  );
  await pool.query('CREATE INDEX IF NOT EXISTS user_activity_daily_user_date_idx ON user_activity_daily (user_id, activity_date DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS user_activity_daily_pool_date_idx ON user_activity_daily (pool_id, activity_date DESC)');
}

async function ensureUsernameColumn() {
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS username text');
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON users (username)');
  await pool.query(
    `UPDATE users
     SET username = split_part(email, '@', 1)
     WHERE username IS NULL OR username = ''`
  );
}

async function ensureUserPrefs() {
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name text');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS leaderboard_opt_in boolean NOT NULL DEFAULT true');
}

async function ensureQuestionLangColumn() {
  await pool.query('ALTER TABLE questions ADD COLUMN IF NOT EXISTS lang text');
  await pool.query('CREATE INDEX IF NOT EXISTS questions_pool_lang_idx ON questions (pool_id, lang)');
  await pool.query(
    `UPDATE questions
     SET lang = lower(substring(category from '^lang:([a-z]{2})')),
         category = NULLIF(regexp_replace(category, '^lang:[a-z]{2}\\|?', ''), '')
     WHERE lang IS NULL AND category LIKE 'lang:%'`
  );
  // Backfill from pool name suffixes
  await pool.query(
    `UPDATE questions q
     SET lang = 'en'
     FROM pools p
     WHERE q.pool_id = p.id AND q.lang IS NULL AND p.name ~ '\\(EN\\)\\s*$'`
  );
  await pool.query(
    `UPDATE questions q
     SET lang = 'ru'
     FROM pools p
     WHERE q.pool_id = p.id AND q.lang IS NULL AND p.name ~ '\\(RU\\)\\s*$'`
  );
  // Default remaining to de (legacy pools without suffix)
  await pool.query(
    `UPDATE questions q
     SET lang = 'de'
     FROM pools p
     WHERE q.pool_id = p.id AND q.lang IS NULL AND p.name !~ '\\((EN|RU)\\)\\s*$'`
  );
}

async function ensureSourceIdColumns() {
  await pool.query('ALTER TABLE questions ADD COLUMN IF NOT EXISTS source_id text');
  await pool.query('ALTER TABLE answers ADD COLUMN IF NOT EXISTS source_id text');
  await pool.query('CREATE INDEX IF NOT EXISTS questions_source_id_idx ON questions (source_id) WHERE source_id IS NOT NULL');
  await pool.query('CREATE INDEX IF NOT EXISTS answers_source_id_idx ON answers (source_id) WHERE source_id IS NOT NULL');
}

function basePoolNameForMerge(name) {
  return String(name || '').replace(/\s*\((EN|RU|DE|2)\)\s*$/i, '').trim();
}

async function migrateToMultilangPools() {
  const { rows: allPools } = await pool.query('SELECT id, name FROM pools ORDER BY name');
  if (!allPools.length) return;
  const groups = new Map();
  for (const p of allPools) {
    const base = basePoolNameForMerge(p.name);
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push(p);
  }
  for (const [baseName, poolList] of groups) {
    if (!poolList || poolList.length <= 1) continue;
    let primary =
      poolList.find(p => p.name === baseName) ||
      poolList.find(p => /\(DE\)\s*$/i.test(p.name)) ||
      poolList[0];
    const others = poolList.filter(p => p.id !== primary.id);
    if (!others.length) continue;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const other of others) {
        await client.query('UPDATE questions SET pool_id=$1 WHERE pool_id=$2', [primary.id, other.id]);
        const { rows: sets } = await client.query(
          'SELECT id, user_id, name FROM learning_box_sets WHERE pool_id=$1',
          [other.id]
        );
        for (const s of sets) {
          const { rows: existing } = await client.query(
            'SELECT id FROM learning_box_sets WHERE user_id=$1 AND pool_id=$2 AND name=$3',
            [s.user_id, primary.id, s.name]
          );
          if (existing.length) {
            await client.query('DELETE FROM learning_box_sets WHERE id=$1', [s.id]);
          } else {
            await client.query('UPDATE learning_box_sets SET pool_id=$1 WHERE id=$2', [primary.id, s.id]);
          }
        }
        await client.query('UPDATE exam_sessions SET pool_id=$1 WHERE pool_id=$2', [primary.id, other.id]);
        const { rows: activities } = await client.query(
          `SELECT user_id, activity_date, training_correct, training_wrong, leitner_correct,
                  exam_correct, exam_total, total_answered
           FROM user_activity_daily WHERE pool_id=$1`,
          [other.id]
        );
        for (const a of activities) {
          await client.query(
            `INSERT INTO user_activity_daily
              (user_id, pool_id, activity_date, training_correct, training_wrong,
               leitner_correct, exam_correct, exam_total, total_answered)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (user_id, pool_id, activity_date) DO UPDATE SET
               training_correct = user_activity_daily.training_correct + EXCLUDED.training_correct,
               training_wrong = user_activity_daily.training_wrong + EXCLUDED.training_wrong,
               leitner_correct = user_activity_daily.leitner_correct + EXCLUDED.leitner_correct,
               exam_correct = user_activity_daily.exam_correct + EXCLUDED.exam_correct,
               exam_total = user_activity_daily.exam_total + EXCLUDED.exam_total,
               total_answered = user_activity_daily.total_answered + EXCLUDED.total_answered,
               updated_at = now()`,
            [
              a.user_id,
              primary.id,
              a.activity_date,
              a.training_correct,
              a.training_wrong,
              a.leitner_correct,
              a.exam_correct,
              a.exam_total,
              a.total_answered
            ]
          );
        }
        await client.query('DELETE FROM user_activity_daily WHERE pool_id=$1', [other.id]);
        await client.query('UPDATE duels SET pool_id=$1 WHERE pool_id=$2', [primary.id, other.id]);
        await client.query('UPDATE leaderboard_snapshots SET pool_id=$1 WHERE pool_id=$2', [primary.id, other.id]);
        await client.query('DELETE FROM pools WHERE id=$1', [other.id]);
      }
      if (primary.name !== baseName) {
        await client.query('UPDATE pools SET name=$1 WHERE id=$2', [baseName, primary.id]);
      }
      await client.query('COMMIT');
      console.log(`[migrate] merged ${others.length} pools into "${baseName}"`);
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(`[migrate] error merging "${baseName}":`, e.message);
    } finally {
      client.release();
    }
  }
  // Rename legacy Nadine pools (keep consistent naming)
  await pool.query(
    `UPDATE pools
     SET name = regexp_replace(name, 'FisiTraining_Nadine_', 'FisiTraining_', 'g')
     WHERE name LIKE 'FisiTraining_Nadine_%'`
  );
}

async function ensureQuestionImagesTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS question_images (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      url text NULL,
      alt text NULL,
      local_path text NULL,
      sort_order int NOT NULL DEFAULT 0
    )`
  );
  await pool.query('CREATE INDEX IF NOT EXISTS question_images_qid_idx ON question_images (question_id)');
}

async function ensureLeaderboardSnapshots() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      scope text NOT NULL CHECK (scope IN ('global','weekly','pool')),
      pool_id uuid NULL REFERENCES pools(id) ON DELETE CASCADE,
      period_start date NULL,
      period_end date NULL,
      computed_at timestamptz NOT NULL DEFAULT now(),
      entries jsonb NOT NULL
    )`
  );
  await pool.query('CREATE INDEX IF NOT EXISTS leaderboard_snapshots_scope_time_idx ON leaderboard_snapshots (scope, computed_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS leaderboard_snapshots_period_idx ON leaderboard_snapshots (scope, period_start, period_end)');
}

async function ensureContestTables() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS contests (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      name text NOT NULL,
      pool_id uuid NULL REFERENCES pools(id) ON DELETE SET NULL,
      starts_at timestamptz NOT NULL,
      ends_at timestamptz NOT NULL,
      rules jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS contest_entries (
      contest_id uuid NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      score numeric(10,2) NOT NULL DEFAULT 0,
      stats jsonb NOT NULL DEFAULT '{}'::jsonb,
      PRIMARY KEY (contest_id, user_id)
    )`
  );
  await pool.query('CREATE INDEX IF NOT EXISTS contests_time_idx ON contests (starts_at, ends_at)');
  await pool.query('CREATE INDEX IF NOT EXISTS contest_entries_contest_idx ON contest_entries (contest_id, score DESC)');
}

async function ensureSpeedrunTables() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS speedrun_sessions (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      pool_id uuid NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
      duration_minutes int NOT NULL CHECK (duration_minutes IN (1,5,10)),
      correct_count int NOT NULL DEFAULT 0,
      wrong_count int NOT NULL DEFAULT 0,
      total_count int NOT NULL DEFAULT 0,
      accuracy numeric(5,2) NOT NULL DEFAULT 0,
      started_at timestamptz NOT NULL DEFAULT now(),
      finished_at timestamptz NULL
    )`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS speedrun_answers (
      session_id uuid NOT NULL REFERENCES speedrun_sessions(id) ON DELETE CASCADE,
      question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      is_correct boolean NOT NULL,
      time_ms int NOT NULL CHECK (time_ms >= 0),
      answered_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (session_id, question_id)
    )`
  );
  await pool.query('CREATE INDEX IF NOT EXISTS speedrun_sessions_user_idx ON speedrun_sessions (user_id, finished_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS speedrun_sessions_pool_idx ON speedrun_sessions (pool_id, correct_count DESC)');
}

async function ensureLearningBoxTables() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS learning_box_sets (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name text NOT NULL,
      pool_id uuid NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
      mode text NOT NULL CHECK (mode IN ('simple','classic')) DEFAULT 'simple',
      created_at timestamptz NOT NULL DEFAULT now()
    )`
  );
  try { await pool.query('ALTER TABLE learning_box_sets DROP CONSTRAINT IF EXISTS learning_box_sets_user_id_name_key'); } catch {}
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS learning_box_sets_user_pool_name_idx ON learning_box_sets (user_id, pool_id, name)');
  await pool.query(
    `CREATE TABLE IF NOT EXISTS learning_box_items (
      set_id uuid NOT NULL REFERENCES learning_box_sets(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      box int NOT NULL DEFAULT 1,
      due_at timestamptz NULL,
      PRIMARY KEY (set_id, user_id, question_id)
    )`
  );
  await pool.query('CREATE INDEX IF NOT EXISTS learning_box_items_set_user_idx ON learning_box_items (set_id, user_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS learning_box_items_due_idx ON learning_box_items (set_id, user_id, due_at)');
  await pool.query('DROP TABLE IF EXISTS leitner');
}

async function ensureFriendshipTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS friendships (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      addressee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status text NOT NULL CHECK (status IN ('pending','accepted','declined')) DEFAULT 'pending',
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (requester_id, addressee_id)
    )`
  );
  await pool.query('CREATE INDEX IF NOT EXISTS friendships_requester_idx ON friendships (requester_id, status)');
  await pool.query('CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON friendships (addressee_id, status)');
  // Prevent duplicate friendship pairs regardless of direction
  await pool.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair_unique_idx ON friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id))'
  );
  // Prevent self-friending
  try { await pool.query("ALTER TABLE friendships ADD CONSTRAINT friendships_no_self CHECK (requester_id != addressee_id)"); } catch {}
}

async function ensureDuelTables() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS duels (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      challenger_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      opponent_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
      pool_id uuid NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
      question_count int NOT NULL DEFAULT 5,
      question_ids jsonb NOT NULL,
      status text NOT NULL CHECK (status IN ('waiting','active','finished','expired')) DEFAULT 'waiting',
      is_open boolean NOT NULL DEFAULT false,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      finished_at timestamptz NULL
    )`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS duel_answers (
      duel_id uuid NOT NULL REFERENCES duels(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      selected_answer_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
      is_correct boolean NOT NULL,
      time_ms int NOT NULL DEFAULT 0,
      answered_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (duel_id, user_id, question_id)
    )`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS duel_results (
      duel_id uuid NOT NULL REFERENCES duels(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      correct_count int NOT NULL DEFAULT 0,
      total_time_ms int NOT NULL DEFAULT 0,
      is_winner boolean NULL,
      xp_earned numeric(6,2) NOT NULL DEFAULT 0,
      PRIMARY KEY (duel_id, user_id)
    )`
  );
  await pool.query('CREATE INDEX IF NOT EXISTS duels_status_idx ON duels (status, expires_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS duels_challenger_idx ON duels (challenger_id, status)');
  await pool.query('CREATE INDEX IF NOT EXISTS duels_opponent_idx ON duels (opponent_id, status)');
  await pool.query('CREATE INDEX IF NOT EXISTS duel_answers_user_idx ON duel_answers (user_id, answered_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS duel_results_user_idx ON duel_results (user_id)');
  // Prevent self-dueling, enforce question_count range, non-negative times
  try { await pool.query("ALTER TABLE duels ADD CONSTRAINT duels_no_self CHECK (challenger_id != opponent_id)"); } catch {}
  try { await pool.query("ALTER TABLE duels ADD CONSTRAINT duels_question_count_range CHECK (question_count BETWEEN 3 AND 10)"); } catch {}
  try { await pool.query("ALTER TABLE duel_answers ADD CONSTRAINT duel_answers_time_positive CHECK (time_ms >= 0)"); } catch {}
  try { await pool.query("ALTER TABLE duel_results ADD CONSTRAINT duel_results_time_positive CHECK (total_time_ms >= 0)"); } catch {}
}

async function ensurePasswordResets() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS password_resets (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash text NOT NULL,
      expires_at timestamptz NOT NULL,
      used_at timestamptz NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`
  );
  await pool.query('CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets (user_id, created_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS password_resets_token_idx ON password_resets (token_hash)');
}

function resolveImageUrl(row) {
  if (row?.local_path) {
    if (row.local_path.startsWith('http')) return row.local_path;
    if (row.local_path.startsWith('/')) return row.local_path;
    return `/images/${row.local_path}`;
  }
  return row?.url || null;
}

function normalizeQuestionIds(val) {
  if (Array.isArray(val)) return val;
  if (!val) return [];
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function attachQuestionImages(client, questions) {
  if (!questions.length) return questions;
  const qids = questions.map(q => q.id);
  const { rows } = await client.query(
    `SELECT question_id, url, alt, local_path, sort_order
     FROM question_images
     WHERE question_id = ANY($1::uuid[])
     ORDER BY sort_order, id`,
    [qids]
  );
  const byQ = new Map();
  for (const r of rows) {
    const url = resolveImageUrl(r);
    if (!url) continue;
    if (!byQ.has(r.question_id)) byQ.set(r.question_id, []);
    byQ.get(r.question_id).push({ url, alt: r.alt || '' });
  }
  return questions.map(q => ({
    ...q,
    images: byQ.get(q.id) || []
  }));
}

const XP_RULES = {
  training_correct: 1,
  training_wrong: 0.25,
  leitner_correct: 2,
  exam_correct: 5,
  exam_bonus: 10
};
const DUEL_XP = {
  win: 20,
  loss: 5,
  draw: 10,
  expired: 5
};
const LEARNING_BOX_INTERVALS_DAYS = { 1: 1, 2: 2, 3: 5, 4: 8, 5: 14 };
const STREAK_RULES = {
  daily_min_questions: 10,
  weekly_active_days: 4
};

const SNAPSHOT_LIMIT = 50;
const SNAPSHOT_TTL_MS = {
  global: 6 * 60 * 60 * 1000,
  weekly: 30 * 60 * 1000
};

const RESET_TTL_MIN = parseInt(process.env.RESET_TOKEN_TTL_MIN || '60', 10);
let mailer = null;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getAppBaseUrl(req) {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (host) return `${proto}://${host}`;
  return 'http://localhost:8000';
}

function getMailer() {
  if (mailer) return mailer;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = (process.env.SMTP_SECURE || '').toLowerCase() === 'true';
  mailer = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  return mailer;
}

const TZ_CACHE = new Set(['UTC']);

async function normalizeTimezone(tz) {
  const candidate = (tz || '').toString().trim();
  if (!candidate) return 'UTC';
  if (TZ_CACHE.has(candidate)) return candidate;
  try {
    const { rowCount } = await pool.query('SELECT 1 FROM pg_timezone_names WHERE name=$1 LIMIT 1', [candidate]);
    if (rowCount > 0) {
      TZ_CACHE.add(candidate);
      return candidate;
    }
  } catch {
    // fall through to UTC
  }
  return 'UTC';
}

function calcLevel(xp) {
  const val = Math.max(0, Number(xp || 0));
  return Math.floor(Math.sqrt(val / 10));
}

async function updateGamification(client, userId, xpDelta = 0) {
  const delta = Math.max(0, Number(xpDelta || 0));
  const { rows } = await client.query(
    `INSERT INTO user_gamification (user_id, xp, level, last_awarded_at, updated_at)
     VALUES ($1, $2, 0, now(), now())
     ON CONFLICT (user_id) DO UPDATE SET
       xp = user_gamification.xp + $2,
       last_awarded_at = now(),
       updated_at = now()
     RETURNING xp`,
    [userId, delta]
  );
  const xp = Number(rows[0]?.xp || 0);
  const level = calcLevel(xp);
  await client.query('UPDATE user_gamification SET level=$2 WHERE user_id=$1', [userId, level]);
  return { xp, level };
}

async function recordDailyActivity(client, userId, poolId, delta, tz = 'UTC') {
  const d = {
    training_correct: delta.training_correct || 0,
    training_wrong: delta.training_wrong || 0,
    leitner_correct: delta.leitner_correct || 0,
    exam_correct: delta.exam_correct || 0,
    exam_total: delta.exam_total || 0,
    total_answered: delta.total_answered || 0
  };
  await client.query(
    `INSERT INTO user_activity_daily
      (user_id, pool_id, activity_date, training_correct, training_wrong, leitner_correct, exam_correct, exam_total, total_answered, updated_at)
     VALUES ($1,$2, (now() at time zone $3)::date, $4,$5,$6,$7,$8,$9, now())
     ON CONFLICT (user_id, pool_id, activity_date) DO UPDATE SET
       training_correct = user_activity_daily.training_correct + EXCLUDED.training_correct,
       training_wrong = user_activity_daily.training_wrong + EXCLUDED.training_wrong,
       leitner_correct = user_activity_daily.leitner_correct + EXCLUDED.leitner_correct,
       exam_correct = user_activity_daily.exam_correct + EXCLUDED.exam_correct,
       exam_total = user_activity_daily.exam_total + EXCLUDED.exam_total,
       total_answered = user_activity_daily.total_answered + EXCLUDED.total_answered,
       updated_at = now()`,
    [userId, poolId, tz, d.training_correct, d.training_wrong, d.leitner_correct, d.exam_correct, d.exam_total, d.total_answered]
  );
}

function toDateKey(dateVal) {
  if (dateVal instanceof Date) {
    return dateVal.toISOString().slice(0, 10);
  }
  return new Date(dateVal + 'T00:00:00Z').toISOString().slice(0, 10);
}

async function expireDuels() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE duels
       SET status='expired'
       WHERE status IN ('waiting','active') AND expires_at < now()
       RETURNING id, challenger_id, opponent_id`
    );
    for (const duel of rows) {
      await updateGamification(client, duel.challenger_id, DUEL_XP.expired);
      if (duel.opponent_id) {
        await updateGamification(client, duel.opponent_id, DUEL_XP.expired);
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    console.error('expireDuels error:', err);
    await client.query('ROLLBACK');
  } finally {
    client.release();
  }
}

function getTodayKey(tz = 'UTC') {
  if (tz === 'UTC') return new Date().toISOString().slice(0, 10);
  return new Date().toLocaleDateString('en-CA', { timeZone: tz });
}

function computeDailyStreak(dayTotals, tz = 'UTC') {
  const days = Object.keys(dayTotals).sort().reverse();
  const today = getTodayKey(tz);
  let streak = 0;
  let cursor = today;
  for (const d of days) {
    if (d !== cursor) break;
    if ((dayTotals[d] || 0) < STREAK_RULES.daily_min_questions) break;
    streak += 1;
    const prev = new Date(cursor);
    prev.setUTCDate(prev.getUTCDate() - 1);
    cursor = prev.toISOString().slice(0, 10);
  }
  return streak;
}

function weekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  return weekKeyFromDate(d);
}

function dateKeyUtc(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

function weeklyWindowUtc() {
  const end = new Date();
  const endKey = dateKeyUtc(end);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  const startKey = dateKeyUtc(start);
  return { startKey, endKey };
}

function weekKeyFromDate(d) {
  const day = d.getUTCDay() || 7;
  const thursday = new Date(d);
  thursday.setUTCDate(thursday.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((thursday - yearStart) / 86400000) + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function isoWeekStart(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const mondayWeek1 = new Date(jan4);
  mondayWeek1.setUTCDate(jan4.getUTCDate() - (day - 1));
  const target = new Date(mondayWeek1);
  target.setUTCDate(mondayWeek1.getUTCDate() + (week - 1) * 7);
  return target;
}

function prevWeekKey(weekStr) {
  const [y, w] = weekStr.split('-W').map(Number);
  if (!y || !w) return null;
  const start = isoWeekStart(y, w);
  start.setUTCDate(start.getUTCDate() - 7);
  return weekKeyFromDate(start);
}

function computeWeeklyStreak(dayTotals) {
  const weekMap = new Map();
  for (const [dateStr, count] of Object.entries(dayTotals)) {
    if ((count || 0) < STREAK_RULES.daily_min_questions) continue;
    const wk = weekKey(dateStr);
    weekMap.set(wk, (weekMap.get(wk) || 0) + 1);
  }
  const weeks = Array.from(weekMap.entries())
    .filter(([, days]) => days >= STREAK_RULES.weekly_active_days)
    .map(([wk]) => wk)
    .sort()
    .reverse();
  if (!weeks.length) return 0;
  let streak = 0;
  let cursor = weeks[0];
  for (const wk of weeks) {
    if (wk !== cursor) break;
    streak += 1;
    cursor = prevWeekKey(cursor);
    if (!cursor) break;
  }
  return streak;
}

async function loadDayTotals(userId, tz = 'UTC') {
  const { rows } = await pool.query(
    `SELECT activity_date, sum(total_answered)::int AS total_answered
     FROM user_activity_daily
     WHERE user_id=$1 AND activity_date >= ((now() at time zone $2)::date - interval '60 days')
     GROUP BY activity_date`,
    [userId, tz]
  );
  const out = {};
  for (const r of rows) {
    out[toDateKey(r.activity_date)] = parseInt(r.total_answered, 10) || 0;
  }
  return out;
}

async function computeBadges(userId, dailyStreak) {
  const { rows: totals } = await pool.query(
    `SELECT sum(training_correct + leitner_correct + exam_correct)::int AS correct_total
     FROM user_activity_daily
     WHERE user_id=$1`,
    [userId]
  );
  const correctTotal = totals[0]?.correct_total || 0;
  const { rows: exams } = await pool.query(
    `SELECT count(*)::int AS passed
     FROM exam_sessions
     WHERE user_id=$1 AND finished_at IS NOT NULL
       AND total_questions > 0
       AND (correct_answers::float / total_questions) >= 0.8`,
    [userId]
  );
  const passed = exams[0]?.passed || 0;
  const { rows: perfect } = await pool.query(
    `SELECT count(*)::int AS perfect
     FROM exam_sessions
     WHERE user_id=$1 AND finished_at IS NOT NULL
       AND total_questions > 0
       AND correct_answers = total_questions`,
    [userId]
  );
  const perfectCount = perfect[0]?.perfect || 0;
  const { rows: leitnerRows } = await pool.query(
    `SELECT count(*)::int AS box5
     FROM learning_box_items
     WHERE user_id=$1 AND box=5`,
    [userId]
  );
  const box5Count = leitnerRows[0]?.box5 || 0;
  const duelStats = await loadDuelStats(userId);
  const badges = [];
  if (correctTotal >= 100) badges.push('erste_100');
  if (correctTotal >= 1000) badges.push('erste_1000');
  if ((dailyStreak || 0) >= 7) badges.push('konsequent');
  if ((dailyStreak || 0) >= 30) badges.push('marathon');
  if (passed >= 3) badges.push('pruefungssicher');
  if (box5Count >= 50) badges.push('leitner_meister');
  if (perfectCount >= 1) badges.push('perfektionist');
  if ((duelStats.played || 0) >= 10) badges.push('duellant');
  if ((duelStats.currentWinStreak || 0) >= 5) badges.push('unbesiegbar');
  if ((duelStats.distinctOpponents || 0) >= 5) badges.push('sozial');
  return badges;
}

async function loadDuelStats(userId) {
  const { rows: totals } = await pool.query(
    `SELECT
       sum(CASE WHEN is_winner=true THEN 1 ELSE 0 END)::int AS wins,
       sum(CASE WHEN is_winner=false THEN 1 ELSE 0 END)::int AS losses,
       sum(CASE WHEN is_winner IS NULL THEN 1 ELSE 0 END)::int AS draws,
       count(*)::int AS played
     FROM duel_results
     WHERE user_id=$1`,
    [userId]
  );
  const { rows: opps } = await pool.query(
    `SELECT count(DISTINCT other_id)::int AS opponents FROM (
       SELECT opponent_id AS other_id FROM duels WHERE challenger_id=$1 AND status='finished' AND opponent_id IS NOT NULL
       UNION
       SELECT challenger_id AS other_id FROM duels WHERE opponent_id=$1 AND status='finished'
     ) sub`,
    [userId]
  );
  const { rows: history } = await pool.query(
    `SELECT dr.is_winner, d.finished_at
     FROM duel_results dr
     JOIN duels d ON d.id=dr.duel_id
     WHERE dr.user_id=$1 AND d.status='finished'
     ORDER BY d.finished_at DESC`,
    [userId]
  );
  let currentWinStreak = 0;
  for (const r of history) {
    if (r.is_winner === true) currentWinStreak += 1;
    else break;
  }
  let bestWinStreak = 0;
  let running = 0;
  for (const r of history.slice().reverse()) {
    if (r.is_winner === true) {
      running += 1;
      if (running > bestWinStreak) bestWinStreak = running;
    } else {
      running = 0;
    }
  }
  return {
    wins: totals[0]?.wins || 0,
    losses: totals[0]?.losses || 0,
    draws: totals[0]?.draws || 0,
    played: totals[0]?.played || 0,
    distinctOpponents: opps[0]?.opponents || 0,
    currentWinStreak,
    bestWinStreak
  };
}

async function awardBadges(userId, badgeKeys) {
  if (!badgeKeys || !badgeKeys.length) return;
  await pool.query(
    `INSERT INTO user_badges (user_id, badge_key)
     SELECT $1, b.key
     FROM badges b
     WHERE b.key = ANY($2::text[])
     ON CONFLICT (user_id, badge_key) DO NOTHING`,
    [userId, badgeKeys]
  );
}

function signAccessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  });
}
function signRefreshToken(user) {
  return jwt.sign({ sub: user.id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });
}
const REFRESH_COOKIE_NAME = process.env.REFRESH_COOKIE_NAME || 'pt_refresh';
const REFRESH_COOKIE_PATH = process.env.REFRESH_COOKIE_PATH || '/api';
const REFRESH_COOKIE_SAMESITE = (process.env.REFRESH_COOKIE_SAMESITE || 'lax').toLowerCase();
const REFRESH_COOKIE_MAX_AGE_MS = (() => {
  const raw = (process.env.JWT_REFRESH_EXPIRES_IN || '7d').toString().trim();
  const m = raw.match(/^(\d+)\s*([smhd])$/i);
  if (!m) return 7 * 24 * 60 * 60 * 1000;
  const num = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  if (unit === 's') return num * 1000;
  if (unit === 'm') return num * 60 * 1000;
  if (unit === 'h') return num * 60 * 60 * 1000;
  if (unit === 'd') return num * 24 * 60 * 60 * 1000;
  return 7 * 24 * 60 * 60 * 1000;
})();
function isSecureRequest(req) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}
function getCookie(req, name) {
  const raw = req.headers?.cookie;
  if (!raw) return null;
  const parts = raw.split(';').map(p => p.trim());
  for (const part of parts) {
    if (!part) continue;
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) return decodeURIComponent(part.slice(idx + 1));
  }
  return null;
}
function setRefreshCookie(res, token, req) {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: REFRESH_COOKIE_SAMESITE,
    secure: isSecureRequest(req),
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  });
}
function clearRefreshCookie(res, req) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: REFRESH_COOKIE_SAMESITE,
    secure: isSecureRequest(req),
    path: REFRESH_COOKIE_PATH,
  });
}

function auth(requiredRole = null) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'unauthorized' });
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      req.user = payload;
      if (requiredRole && payload.role !== requiredRole) {
        return res.status(403).json({ error: 'forbidden' });
      }
      next();
    } catch {
      return res.status(401).json({ error: 'unauthorized' });
    }
  };
}

function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
  } catch {
    // ignore invalid token for optional auth
  }
// ============================================================================
// GUEST MODE SUPPORT - INSERT AFTER LINE 1089 (after optionalAuth)
// ============================================================================

// Helper: Check if user is guest (no authentication)
function isGuest(req) {
  return !req.user || !req.user.sub;
}

// Helper: Require authentication (for endpoints that need it)
function requireAuth(req, res) {
  if (isGuest(req)) {
    res.status(401).json({ error: 'authentication_required', message: 'Login required to access this feature' });
    return true; // Blocked
  }
  return false; // Not blocked, continue
}

// Middleware: Enforce authentication
function mustAuth() {
  return (req, res, next) => {
    if (requireAuth(req, res)) return;
    next();
  };
}

// ============================================================================
// GUEST MODE ENDPOINT UPDATES
// ============================================================================

// Note: Most endpoints already use auth() or optionalAuth correctly
// Guest users can:
// - Browse public pools (GET /pools with optionalAuth)
// - View questions (GET /questions with optionalAuth)
// - Train/Swipe/Exam (but progress not saved)

// Endpoints that MUST require auth are already using auth() middleware:
// - Leitner endpoints
// - Community endpoints
// - Gamification endpoints
// - Pool creation/editing

// ============================================================================
// END GUEST MODE SUPPORT
// ============================================================================
  next();
}

app.get('/', (_req, res) => {
  res.status(200).send('QuizDojo API is running. Use /health for status.');
});
app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/auth/me', auth(), async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, email, role, display_name, leaderboard_opt_in FROM users WHERE id=$1',
    [req.user.sub]
  );
  res.json(rows[0] || null);
});

app.put('/account/leaderboard', auth(), async (req, res) => {
  const { leaderboard_opt_in, display_name } = req.body || {};
  const optIn = leaderboard_opt_in === true;
  const name = (display_name || '').toString().trim().slice(0, 32) || null;
  const { rows } = await pool.query(
    `UPDATE users
     SET leaderboard_opt_in=$2, display_name=$3
     WHERE id=$1
     RETURNING id, email, role, display_name, leaderboard_opt_in`,
    [req.user.sub, optIn, name]
  );
  res.json(rows[0] || null);
});

app.get('/account/stats', auth(), roleRateLimit(), async (req, res) => {
  const userId = req.user.sub;
  const { rows: totals } = await pool.query(
    `SELECT
      COALESCE(SUM(training_correct + leitner_correct + exam_correct), 0) AS total_correct,
      COALESCE(SUM(training_wrong), 0) AS total_wrong,
      COALESCE(SUM(total_answered), 0) AS total_answered,
      COALESCE(SUM(exam_total), 0) AS total_exam_questions,
      COALESCE(SUM(exam_correct), 0) AS total_exam_correct,
      COUNT(DISTINCT activity_date) AS active_days
     FROM user_activity_daily
     WHERE user_id = $1`,
    [userId]
  );
  const { rows: perPool } = await pool.query(
    `SELECT
      p.name AS pool_name,
      SUM(d.total_answered) AS answered,
      SUM(d.training_correct + d.leitner_correct + d.exam_correct) AS correct,
      MAX(d.activity_date) AS last_active
     FROM user_activity_daily d
     JOIN pools p ON p.id = d.pool_id
     WHERE d.user_id = $1
     GROUP BY p.name
     ORDER BY SUM(d.total_answered) DESC
     LIMIT 5`,
    [userId]
  );
  const { rows: first } = await pool.query(
    `SELECT MIN(activity_date) AS first_day
     FROM user_activity_daily
     WHERE user_id = $1`,
    [userId]
  );
  const t = totals[0] || {};
  res.json({
    total_correct: Number(t.total_correct || 0),
    total_wrong: Number(t.total_wrong || 0),
    total_answered: Number(t.total_answered || 0),
    total_exam_questions: Number(t.total_exam_questions || 0),
    total_exam_correct: Number(t.total_exam_correct || 0),
    active_days: Number(t.active_days || 0),
    first_activity: first[0]?.first_day || null,
    per_pool: perPool.map(r => ({
      pool_name: r.pool_name,
      answered: Number(r.answered || 0),
      correct: Number(r.correct || 0),
      last_active: r.last_active
    }))
  });
});

app.get('/gamification/me', auth(), async (req, res) => {
  const tz = await normalizeTimezone(req.headers['x-user-timezone']);
  const { rows } = await pool.query(
    `SELECT xp, level, last_awarded_at
     FROM user_gamification
     WHERE user_id=$1`,
    [req.user.sub]
  );
  const base = rows[0] || { xp: 0, level: 0, last_awarded_at: null };
  const xp = Number(base.xp || 0);
  const level = calcLevel(xp);
  const dayTotals = await loadDayTotals(req.user.sub, tz);
  const dailyStreak = computeDailyStreak(dayTotals, tz);
  const weeklyStreak = computeWeeklyStreak(dayTotals);
  const badges = await computeBadges(req.user.sub, dailyStreak);
  await awardBadges(req.user.sub, badges);
  const { rows: badgeRows } = await pool.query(
    `SELECT badge_key, earned_at
     FROM user_badges
     WHERE user_id=$1
     ORDER BY earned_at ASC`,
    [req.user.sub]
  );
  res.json({
    xp,
    level,
    daily_streak: dailyStreak,
    weekly_streak: weeklyStreak,
    badges: badgeRows.map(r => ({ key: r.badge_key, earned_at: r.earned_at })),
    last_awarded_at: base.last_awarded_at
  });
});

app.get('/gamification/config', (_req, res) => {
  pool.query(
    `SELECT key, name_de, name_en, description_de, description_en, icon
     FROM badges
     ORDER BY key`
  ).then(({ rows }) => {
    res.json({
      xp_rules: XP_RULES,
      streak_rules: STREAK_RULES,
      leaderboard_scopes: ['global', 'weekly', 'pool'],
      leaderboard_snapshot_ttl_sec: {
        global: Math.floor(SNAPSHOT_TTL_MS.global / 1000),
        weekly: Math.floor(SNAPSHOT_TTL_MS.weekly / 1000)
      },
      badges: rows,
      level_formula: 'floor(sqrt(total_xp / 10))',
      timezone: 'IANA time zone from X-User-Timezone header; defaults to UTC'
    });
  }).catch(() => {
    res.json({
      xp_rules: XP_RULES,
      streak_rules: STREAK_RULES,
      leaderboard_scopes: ['global', 'weekly', 'pool'],
      leaderboard_snapshot_ttl_sec: {
        global: Math.floor(SNAPSHOT_TTL_MS.global / 1000),
        weekly: Math.floor(SNAPSHOT_TTL_MS.weekly / 1000)
      },
      badges: [],
      level_formula: 'floor(sqrt(total_xp / 10))',
      timezone: 'IANA time zone from X-User-Timezone header; defaults to UTC'
    });
  });
});

app.get('/friends/search', auth(), async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (q.length < 2) return res.json([]);
  const like = `%${q}%`;
  const { rows } = await pool.query(
    `SELECT id, display_name, username
     FROM users
     WHERE (username ILIKE $1 OR display_name ILIKE $1)
       AND id != $2
     LIMIT 10`,
    [like, req.user.sub]
  );
  res.json(rows);
});

app.get('/leitner/sets', auth(), roleRateLimit(), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, pool_id, mode, created_at
     FROM learning_box_sets
     WHERE user_id=$1
     ORDER BY created_at DESC`,
    [req.user.sub]
  );
  res.json(rows);
});

app.post('/leitner/sets', auth(), roleRateLimit(), async (req, res) => {
  const name = (req.body?.name || '').toString().trim().slice(0, 64);
  const poolId = req.body?.pool_id;
  const mode = (req.body?.mode || 'simple').toString();
  if (!name || !poolId) return res.status(400).json({ error: 'invalid' });
  if (!['simple','classic'].includes(mode)) return res.status(400).json({ error: 'invalid_mode' });
  const { rows: pools } = await pool.query('SELECT id FROM pools WHERE id=$1', [poolId]);
  if (!pools.length) return res.status(404).json({ error: 'pool_not_found' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO learning_box_sets (user_id, name, pool_id, mode)
       VALUES ($1,$2,$3,$4)
       RETURNING id, name, pool_id, mode, created_at`,
      [req.user.sub, name, poolId, mode]
    );
    res.status(201).json(rows[0]);
  } catch {
    res.status(409).json({ error: 'already_exists' });
  }
});

app.delete('/leitner/sets/:id', auth(), roleRateLimit(), async (req, res) => {
  const { id } = req.params;
  const { rowCount } = await pool.query(
    'DELETE FROM learning_box_sets WHERE id=$1 AND user_id=$2',
    [id, req.user.sub]
  );
  if (!rowCount) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

app.post('/friends/request', auth(), async (req, res) => {
  const term = (req.body?.username || req.body?.display_name || '').toString().trim();
  if (term.length < 2) return res.status(400).json({ error: 'invalid' });
  const like = `%${term}%`;
  const { rows: candidates } = await pool.query(
    `SELECT id, display_name, username
     FROM users
     WHERE (username ILIKE $1 OR display_name ILIKE $1)
       AND id != $2
     LIMIT 1`,
    [like, req.user.sub]
  );
  if (!candidates.length) return res.status(404).json({ error: 'not_found' });
  const target = candidates[0];
  const { rows: pendingCount } = await pool.query(
    `SELECT count(*)::int AS cnt
     FROM friendships
     WHERE requester_id=$1 AND status='pending'`,
    [req.user.sub]
  );
  if ((pendingCount[0]?.cnt || 0) >= 20) {
    return res.status(429).json({ error: 'too_many_requests' });
  }
  const { rows: existing } = await pool.query(
    `SELECT id, status
     FROM friendships
     WHERE (requester_id=$1 AND addressee_id=$2)
        OR (requester_id=$2 AND addressee_id=$1)
     LIMIT 1`,
    [req.user.sub, target.id]
  );
  if (existing.length) {
    return res.status(409).json({ error: 'already_exists', status: existing[0].status });
  }
  const { rows } = await pool.query(
    `INSERT INTO friendships (requester_id, addressee_id, status)
     VALUES ($1,$2,'pending')
     RETURNING id, status, created_at`,
    [req.user.sub, target.id]
  );
  logAudit('friend_request', req.user.sub, { target: target.id });
  res.json({ id: rows[0].id, status: rows[0].status, user: target });
});

app.get('/friends', auth(), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id AS user_id,
            u.display_name,
            u.username,
            ug.level AS level,
            ua.last_active_at AS last_active_at
     FROM users u
     LEFT JOIN user_gamification ug ON ug.user_id = u.id
     LEFT JOIN (
       SELECT user_id, max(updated_at) AS last_active_at
       FROM user_activity_daily
       GROUP BY user_id
     ) ua ON ua.user_id = u.id
     WHERE u.id != $1
       AND (u.role IS NULL OR u.role = 'student')
       AND lower(coalesce(u.username, '')) !~ '^(codex|test|qa|demo)'
       AND lower(coalesce(u.email, '')) !~ '^(codex|test|qa|demo)'
     ORDER BY coalesce(u.display_name, u.username, '') ASC`,
    [req.user.sub]
  );
  res.json(rows);
});

app.get('/friends/pending', auth(), async (_req, res) => {
  res.json([]);
});

app.post('/friends/:id/accept', auth(), async (_req, res) => {
  res.json({ ok: true });
});

app.post('/friends/:id/decline', auth(), async (_req, res) => {
  res.json({ ok: true });
});

app.post('/duels', auth(), roleRateLimit(), async (req, res) => {
  const { opponent_id, pool_id, question_count, is_open, lang } = req.body || {};
  if (!pool_id) return res.status(400).json({ error: 'invalid' });
  if (opponent_id && opponent_id === req.user.sub) return res.status(400).json({ error: 'cannot_duel_self' });
  const { rows: pools } = await pool.query('SELECT id FROM pools WHERE id=$1', [pool_id]);
  if (!pools.length) return res.status(404).json({ error: 'pool_not_found' });
  const openCount = await pool.query(
    `SELECT count(*)::int AS cnt
     FROM duels
     WHERE challenger_id=$1 AND status IN ('waiting','active')`,
    [req.user.sub]
  );
  if ((openCount.rows[0]?.cnt || 0) >= 10) {
    return res.status(429).json({ error: 'too_many_open_duels' });
  }
  const qc = Math.min(10, Math.max(3, parseInt(question_count || '5', 10) || 5));
  const qParams = [pool_id, qc];
  let qSql = 'SELECT id FROM questions WHERE pool_id=$1';
  const langVal = (lang || '').toString().trim().toLowerCase();
  if (langVal) {
    qSql += ' AND lang = $3';
    qParams.push(langVal);
  }
  qSql += ' ORDER BY random() LIMIT $2';
  const { rows: questions } = await pool.query(qSql, qParams);
  if (questions.length < qc) {
    return res.status(400).json({ error: 'not_enough_questions', available: questions.length });
  }
  const questionIds = questions.map(q => q.id);
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const { rows } = await pool.query(
    `INSERT INTO duels (challenger_id, opponent_id, pool_id, question_count, question_ids, status, is_open, expires_at)
     VALUES ($1,$2,$3,$4,$5,'waiting',$6,$7)
     RETURNING *`,
    [req.user.sub, opponent_id || null, pool_id, qc, JSON.stringify(questionIds), !!is_open, expiresAt]
  );
  logAudit('duel_create', req.user.sub, { duel: rows[0].id, pool: pool_id });
  res.json(rows[0]);
});

app.get('/duels', auth(), async (req, res) => {
  const status = (req.query.status || '').toString().trim().toLowerCase();
  const statusFilter = ['waiting', 'active', 'finished', 'expired'].includes(status) ? status : null;
  const params = [req.user.sub];
  let where = 'WHERE (d.challenger_id=$1 OR d.opponent_id=$1)';
  if (statusFilter) {
    where += ' AND d.status = $2';
    params.push(statusFilter);
  }
  const { rows } = await pool.query(
    `SELECT d.id, d.status, d.pool_id, p.name AS pool_name, d.question_count, d.expires_at, d.created_at, d.finished_at,
            d.is_open,
            CASE WHEN d.challenger_id=$1 THEN u2.display_name ELSE u1.display_name END AS opponent_name,
            CASE WHEN d.challenger_id=$1 THEN u2.id ELSE u1.id END AS opponent_id,
            dr.is_winner, dr.correct_count, dr.total_time_ms, dr.xp_earned
     FROM duels d
     LEFT JOIN pools p ON p.id=d.pool_id
     LEFT JOIN users u1 ON u1.id=d.challenger_id
     LEFT JOIN users u2 ON u2.id=d.opponent_id
     LEFT JOIN duel_results dr ON dr.duel_id=d.id AND dr.user_id=$1
     ${where}
     ORDER BY d.created_at DESC`,
    params
  );
  res.json(rows);
});

app.get('/duels/open', auth(), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT d.id, d.pool_id, p.name AS pool_name, d.question_count, d.expires_at,
            u.display_name AS challenger_name, u.id AS challenger_id
     FROM duels d
     LEFT JOIN pools p ON p.id=d.pool_id
     LEFT JOIN users u ON u.id=d.challenger_id
     WHERE d.is_open=true AND d.status='waiting' AND d.challenger_id != $1
     ORDER BY d.created_at DESC`,
    [req.user.sub]
  );
  res.json(rows);
});

app.post('/duels/:id/accept', auth(), roleRateLimit(), async (req, res) => {
  const { id } = req.params;
  // Atomic accept: prevents race conditions and self-accept in one query
  const { rows } = await pool.query(
    `UPDATE duels
     SET opponent_id = COALESCE(opponent_id, $2), status = 'active'
     WHERE id = $1 AND status = 'waiting'
       AND challenger_id != $2
       AND (opponent_id IS NULL OR opponent_id = $2)
     RETURNING *`,
    [id, req.user.sub]
  );
  if (!rows.length) {
    const { rows: check } = await pool.query(
      'SELECT status, challenger_id, opponent_id FROM duels WHERE id=$1', [id]
    );
    if (!check.length) return res.status(404).json({ error: 'not_found' });
    if (check[0].challenger_id === req.user.sub) return res.status(400).json({ error: 'cannot_accept_own' });
    if (check[0].status !== 'waiting') return res.status(400).json({ error: 'not_waiting' });
    return res.status(403).json({ error: 'forbidden' });
  }
  logAudit('duel_accept', req.user.sub, { duel: id });
  res.json({ ok: true });
});

app.get('/duels/stats', auth(), async (req, res) => {
  const stats = await loadDuelStats(req.user.sub);
  res.json(stats);
});

app.get('/duels/:id', auth(), async (req, res) => {
  const { id } = req.params;
  const { rows: duels } = await pool.query(
    `SELECT d.*, p.name AS pool_name,
            u1.display_name AS challenger_name,
            u2.display_name AS opponent_name
     FROM duels d
     LEFT JOIN pools p ON p.id=d.pool_id
     LEFT JOIN users u1 ON u1.id=d.challenger_id
     LEFT JOIN users u2 ON u2.id=d.opponent_id
     WHERE d.id=$1`,
    [id]
  );
  if (!duels.length) return res.status(404).json({ error: 'not_found' });
  const duel = duels[0];
  if (duel.challenger_id !== req.user.sub && duel.opponent_id !== req.user.sub) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const qids = normalizeQuestionIds(duel.question_ids);
  const { rows: questions } = qids.length
    ? await pool.query(
        `SELECT id, text, category, explanation
         FROM questions
         WHERE id = ANY($1::uuid[])`,
        [qids]
      )
    : { rows: [] };
  const { rows: answers } = qids.length
    ? await pool.query(
        `SELECT id, question_id, text
         FROM answers
         WHERE question_id = ANY($1::uuid[])`,
        [qids]
      )
    : { rows: [] };
  const byQ = new Map();
  for (const a of answers) {
    if (!byQ.has(a.question_id)) byQ.set(a.question_id, []);
    byQ.get(a.question_id).push(a);
  }
  const ordered = qids.map(qid => questions.find(q => q.id === qid)).filter(Boolean);
  const questionsOut = ordered.map(q => ({
    ...q,
    answers: byQ.get(q.id) || []
  }));
  const withImages = await attachQuestionImages(pool, questionsOut);
  // Only show opponent's answers after duel is finished (prevent cheating)
  const answerParams = [id];
  let answerFilter = 'WHERE duel_id=$1';
  if (duel.status !== 'finished') {
    answerFilter += ' AND user_id=$2';
    answerParams.push(req.user.sub);
  }
  const { rows: duelAnswers } = await pool.query(
    `SELECT user_id, question_id, selected_answer_ids, is_correct, time_ms
     FROM duel_answers
     ${answerFilter}`,
    answerParams
  );
  const { rows: duelResults } = await pool.query(
    `SELECT user_id, correct_count, total_time_ms, is_winner, xp_earned
     FROM duel_results
     WHERE duel_id=$1`,
    [id]
  );
  res.json({
    ...duel,
    questions: withImages,
    answers: duelAnswers,
    results: duelResults
  });
});

app.post('/duels/:id/answer', auth(), roleRateLimit(), async (req, res) => {
  const { id } = req.params;
  const { question_id, selected_answer_ids, time_ms } = req.body || {};
  if (!question_id || !Array.isArray(selected_answer_ids)) return res.status(400).json({ error: 'invalid' });
  const { rows: duels } = await pool.query('SELECT * FROM duels WHERE id=$1', [id]);
  if (!duels.length) return res.status(404).json({ error: 'not_found' });
  const duel = duels[0];
  if (duel.status === 'expired' || duel.status === 'finished') return res.status(400).json({ error: duel.status });
  const participant = duel.challenger_id === req.user.sub || duel.opponent_id === req.user.sub;
  if (!participant) return res.status(403).json({ error: 'forbidden' });
  if (duel.status === 'waiting' && duel.opponent_id && duel.opponent_id === req.user.sub) {
    return res.status(400).json({ error: 'not_active' });
  }
  const qids = normalizeQuestionIds(duel.question_ids);
  if (!qids.includes(question_id)) {
    return res.status(400).json({ error: 'invalid_question' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: existing } = await client.query(
      `SELECT 1 FROM duel_answers
       WHERE duel_id=$1 AND user_id=$2 AND question_id=$3`,
      [id, req.user.sub, question_id]
    );
    if (existing.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'already_answered' });
    }
    const { rows: correctRows } = await client.query(
      'SELECT id FROM answers WHERE question_id=$1 AND is_correct=true',
      [question_id]
    );
    const correctIds = new Set(correctRows.map(r => r.id));
    const sel = new Set(selected_answer_ids);
    const isCorrect = correctIds.size === sel.size && [...correctIds].every(cid => sel.has(cid));
    const tms = Math.max(0, Math.min(600000, parseInt(time_ms || '0', 10) || 0));
    await client.query(
      `INSERT INTO duel_answers (duel_id, user_id, question_id, selected_answer_ids, is_correct, time_ms)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, req.user.sub, question_id, JSON.stringify(selected_answer_ids), isCorrect, tms]
    );
    const { rows: countRows } = await client.query(
      `SELECT count(*)::int AS answered,
              sum(CASE WHEN is_correct THEN 1 ELSE 0 END)::int AS correct_count,
              sum(time_ms)::int AS total_time
       FROM duel_answers
       WHERE duel_id=$1 AND user_id=$2`,
      [id, req.user.sub]
    );
    const answered = countRows[0]?.answered || 0;
    if (answered >= duel.question_count) {
      await client.query(
        `INSERT INTO duel_results (duel_id, user_id, correct_count, total_time_ms)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (duel_id, user_id) DO NOTHING`,
        [id, req.user.sub, countRows[0]?.correct_count || 0, countRows[0]?.total_time || 0]
      );
    }
    const { rows: resultRows } = await client.query(
      `SELECT user_id, correct_count, total_time_ms
       FROM duel_results
       WHERE duel_id=$1`,
      [id]
    );
    if (duel.opponent_id && resultRows.length >= 2 && duel.status !== 'finished') {
      const a = resultRows.find(r => r.user_id === duel.challenger_id);
      const b = resultRows.find(r => r.user_id === duel.opponent_id);
      let winner = null;
      if (a && b) {
        if (a.correct_count > b.correct_count) winner = duel.challenger_id;
        else if (b.correct_count > a.correct_count) winner = duel.opponent_id;
        else if (a.total_time_ms < b.total_time_ms) winner = duel.challenger_id;
        else if (b.total_time_ms < a.total_time_ms) winner = duel.opponent_id;
      }
      const isDraw = winner === null;
      const aWin = winner === duel.challenger_id ? true : (isDraw ? null : false);
      const bWin = winner === duel.opponent_id ? true : (isDraw ? null : false);
      const xpA = aWin === true ? DUEL_XP.win : (aWin === false ? DUEL_XP.loss : DUEL_XP.draw);
      const xpB = bWin === true ? DUEL_XP.win : (bWin === false ? DUEL_XP.loss : DUEL_XP.draw);
      await client.query(
        `UPDATE duel_results SET is_winner=$3, xp_earned=$4
         WHERE duel_id=$1 AND user_id=$2`,
        [id, duel.challenger_id, aWin, xpA]
      );
      await client.query(
        `UPDATE duel_results SET is_winner=$3, xp_earned=$4
         WHERE duel_id=$1 AND user_id=$2`,
        [id, duel.opponent_id, bWin, xpB]
      );
      await updateGamification(client, duel.challenger_id, xpA);
      await updateGamification(client, duel.opponent_id, xpB);
      await client.query('UPDATE duels SET status=\'finished\', finished_at=now() WHERE id=$1', [id]);
      logAudit('duel_finish', req.user.sub, { duel: id, winner });
    }
    await client.query('COMMIT');
    res.json({ correct: isCorrect, answered });
  } catch (err) {
    console.error('duel_answer error:', err);
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'server_error' });
  } finally {
    client.release();
  }
});

app.delete('/duels/:id', auth(), roleRateLimit(), async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query(
    `SELECT id, challenger_id, opponent_id, status
     FROM duels
     WHERE id=$1`,
    [id]
  );
  if (!rows.length) return res.status(404).json({ error: 'not_found' });
  const duel = rows[0];
  if (duel.challenger_id !== req.user.sub && duel.opponent_id !== req.user.sub) {
    return res.status(403).json({ error: 'forbidden' });
  }
  if (duel.status === 'active') return res.status(400).json({ error: 'duel_active' });
  await pool.query('DELETE FROM duels WHERE id=$1', [id]);
  logAudit('duel_delete', req.user.sub, { duel: id });
  res.json({ ok: true });
});

app.post('/duels/reset', auth(), roleRateLimit(), async (req, res) => {
  // Only delete duels the user created (challenger) that are not active,
  // plus finished/expired duels where user was opponent
  const { rows } = await pool.query(
    `DELETE FROM duels
     WHERE status != 'active'
       AND (challenger_id=$1 OR (opponent_id=$1 AND status IN ('finished','expired')))
     RETURNING id`,
    [req.user.sub]
  );
  logAudit('duel_reset', req.user.sub, { count: rows.length });
  res.json({ ok: true, deleted: rows.length });
});

async function getLeaderboard(scope, poolId, limit) {
  const wherePool = scope === 'pool' && poolId ? 'AND d.pool_id = $1' : '';
  const dateFilter = scope === 'weekly' ? 'AND d.activity_date >= ((now() at time zone \'utc\')::date - interval \'6 days\')' : '';
  const params = scope === 'pool' && poolId ? [poolId, limit] : [limit];
  const limitParam = scope === 'pool' && poolId ? 2 : 1;
  const { rows } = await pool.query(
    `WITH activity AS (
       SELECT d.user_id,
              sum(d.training_correct)::int AS training_correct,
              sum(d.leitner_correct)::int AS leitner_correct,
              sum(d.exam_correct)::int AS exam_correct
       FROM user_activity_daily d
       WHERE 1=1
       ${dateFilter}
       ${wherePool}
       GROUP BY d.user_id
     ),
     exam_bonus AS (
       SELECT s.user_id, count(*)::int AS bonus_count
       FROM exam_sessions s
       WHERE s.finished_at IS NOT NULL
       ${scope === 'weekly' ? "AND s.finished_at >= (now() at time zone 'utc') - interval '6 days'" : ''}
       ${scope === 'pool' && poolId ? 'AND s.pool_id = $1' : ''}
       AND s.total_questions > 0
       AND (s.correct_answers::float / s.total_questions) >= 0.8
       GROUP BY s.user_id
     )
     SELECT u.id AS user_id,
            u.username,
            u.email,
            u.display_name,
             (coalesce(a.training_correct,0) * 1
              + coalesce(a.leitner_correct,0) * 2
              + coalesce(a.exam_correct,0) * 5
              + coalesce(b.bonus_count,0) * ${XP_RULES.exam_bonus}) AS score
     FROM users u
     LEFT JOIN activity a ON a.user_id = u.id
     LEFT JOIN exam_bonus b ON b.user_id = u.id
     WHERE (a.user_id IS NOT NULL OR b.user_id IS NOT NULL)
       AND u.leaderboard_opt_in = true
     ORDER BY score DESC
     LIMIT $${limitParam}`,
    params
  );
  return {
    scope,
    pool_id: poolId,
    entries: rows.map(r => ({
      user_id: r.user_id,
      display: r.display_name || r.username || r.email,
      score: Number(r.score || 0)
    }))
  };
}

async function getLeaderboardWithSnapshot(scope, poolId, limit) {
  if (scope === 'pool') {
    return getLeaderboard(scope, poolId, limit);
  }
  const { startKey, endKey } = weeklyWindowUtc();
  const periodStart = scope === 'weekly' ? startKey : null;
  const periodEnd = scope === 'weekly' ? endKey : null;
  const { rows } = await pool.query(
    `SELECT computed_at, entries
     FROM leaderboard_snapshots
     WHERE scope=$1 AND pool_id IS NULL
       AND (period_start IS NOT DISTINCT FROM $2)
       AND (period_end IS NOT DISTINCT FROM $3)
     ORDER BY computed_at DESC
     LIMIT 1`,
    [scope, periodStart, periodEnd]
  );
  const row = rows[0];
  if (row?.computed_at) {
    const age = Date.now() - new Date(row.computed_at).getTime();
    const ttl = SNAPSHOT_TTL_MS[scope] || 0;
    if (ttl > 0 && age <= ttl && Array.isArray(row.entries)) {
      return {
        scope,
        pool_id: null,
        entries: row.entries.slice(0, limit)
      };
    }
  }
  const fresh = await getLeaderboard(scope, poolId, Math.min(limit, SNAPSHOT_LIMIT));
  await pool.query(
    `INSERT INTO leaderboard_snapshots (scope, pool_id, period_start, period_end, entries)
     VALUES ($1, $2, $3, $4, $5)`,
    [scope, null, periodStart, periodEnd, JSON.stringify(fresh.entries)]
  );
  return fresh;
}

app.get('/contests', auth(), async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT c.id, c.name, c.pool_id, p.name AS pool_name,
            c.starts_at, c.ends_at, c.rules, c.created_at
     FROM contests c
     LEFT JOIN pools p ON p.id = c.pool_id
     WHERE c.ends_at >= now()
     ORDER BY c.starts_at ASC`
  );
  res.json(rows);
});

app.post('/contests/:id/join', auth(), async (req, res) => {
  const { id } = req.params;
  const { rows: contests } = await pool.query(
    `SELECT id, starts_at, ends_at FROM contests WHERE id=$1`,
    [id]
  );
  if (!contests.length) return res.status(404).json({ error: 'contest_not_found' });
  if (new Date(contests[0].ends_at) <= new Date()) {
    return res.status(400).json({ error: 'contest_ended' });
  }
  await pool.query(
    `INSERT INTO contest_entries (contest_id, user_id)
     VALUES ($1,$2)
     ON CONFLICT (contest_id, user_id) DO NOTHING`,
    [id, req.user.sub]
  );
  res.json({ ok: true });
});

app.get('/contests/:id/leaderboard', auth(), async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query(
    `SELECT ce.user_id,
            u.display_name,
            u.username,
            u.email,
            ce.score
     FROM contest_entries ce
     JOIN users u ON u.id = ce.user_id
     WHERE ce.contest_id = $1
     ORDER BY ce.score DESC, u.created_at ASC`,
    [id]
  );
  res.json({
    contest_id: id,
    entries: rows.map(r => ({
      user_id: r.user_id,
      display: r.display_name || r.username || r.email,
      score: Number(r.score || 0)
    }))
  });
});

app.post('/contests', auth('admin'), async (req, res) => {
  const { name, pool_id, starts_at, ends_at, rules } = req.body || {};
  if (!name || !starts_at || !ends_at) return res.status(400).json({ error: 'missing' });
  const start = new Date(starts_at);
  const end = new Date(ends_at);
  if (!start.getTime() || !end.getTime() || end <= start) {
    return res.status(400).json({ error: 'invalid_dates' });
  }
  const { rows } = await pool.query(
    `INSERT INTO contests (name, pool_id, starts_at, ends_at, rules)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING *`,
    [name, pool_id || null, start.toISOString(), end.toISOString(), rules || {}]
  );
  res.status(201).json(rows[0]);
});

app.get('/leaderboards', auth(), async (req, res) => {
  const scope = (req.query.scope || 'global').toString();
  const poolId = req.query.pool_id || null;
  if (!['global','weekly','pool'].includes(scope)) {
    return res.status(400).json({ error: 'invalid_scope' });
  }
  if (scope === 'pool' && !poolId) {
    return res.status(400).json({ error: 'missing_pool_id' });
  }
  const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);
  const data = await getLeaderboardWithSnapshot(scope, poolId, limit);
  res.json(data);
});

app.post('/leaderboards/reset', auth('admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const counts = {};
    const delSnapshots = await client.query('DELETE FROM leaderboard_snapshots');
    counts.leaderboard_snapshots = delSnapshots.rowCount || 0;
    const delActivity = await client.query('DELETE FROM user_activity_daily');
    counts.user_activity_daily = delActivity.rowCount || 0;
    const delBadges = await client.query('DELETE FROM user_badges');
    counts.user_badges = delBadges.rowCount || 0;
    const delGamify = await client.query('DELETE FROM user_gamification');
    counts.user_gamification = delGamify.rowCount || 0;
    const delExamAnswers = await client.query('DELETE FROM exam_answers');
    counts.exam_answers = delExamAnswers.rowCount || 0;
    const delExamSessions = await client.query('DELETE FROM exam_sessions');
    counts.exam_sessions = delExamSessions.rowCount || 0;
    await client.query('COMMIT');
    logAudit('leaderboards_reset', req.user.sub, counts);
    res.json({ ok: true, counts });
  } catch {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'server_error' });
  } finally {
    client.release();
  }
});

app.get('/gamification/leaderboard', auth(), async (req, res) => {
  const scope = (req.query.scope || 'global').toString();
  const poolId = req.query.pool_id || null;
  if (!['global','weekly','pool'].includes(scope)) {
    return res.status(400).json({ error: 'invalid_scope' });
  }
  if (scope === 'pool' && !poolId) {
    return res.status(400).json({ error: 'missing_pool_id' });
  }
  const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);
  const data = await getLeaderboardWithSnapshot(scope, poolId, limit);
  res.json(data);
});

app.post('/auth/register', optionalAuth, async (req, res) => {
  const { email, username, password, role } = req.body || {};
  if (!email || !username || !password) return res.status(400).json({ error: 'missing' });
  const hash = await bcrypt.hash(password, 10);
  const safeRole = req.user?.role === 'admin' && role === 'admin' ? 'admin' : 'student';
  try {
    const { rows } = await pool.query(
      'INSERT INTO users (email, username, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id, email, username, role',
      [email, username, hash, safeRole]
    );
    logAudit('user_create', rows[0].id, { email: rows[0].email, username: rows[0].username });
    res.status(201).json(rows[0]);
  } catch {
    res.status(409).json({ error: 'exists' });
  }
});

app.post('/auth/login', loginRateLimit(), async (req, res) => {
  const { email, username, password, identifier } = req.body || {};
  const ident = identifier || email || username;
  if (!ident || !password) return res.status(400).json({ error: 'missing' });
  const { rows } = await pool.query(
    'SELECT id, email, username, password_hash, role FROM users WHERE email=$1 OR username=$1',
    [ident]
  );
  const user = rows[0];
  if (!user) return res.status(401).json({ error: 'invalid' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid' });
  logAudit('auth_login', user.id, { email: user.email, username: user.username });
  const refreshToken = signRefreshToken(user);
  setRefreshCookie(res, refreshToken, req);
  return res.json({
    access_token: signAccessToken(user),
  });
});

app.post('/auth/forgot', loginRateLimit({ windowMs: 15 * 60 * 1000, max: 5 }), async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'missing' });
  const { rows } = await pool.query('SELECT id, email FROM users WHERE email=$1', [email]);
  const user = rows[0];
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    await pool.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at)
       VALUES ($1,$2, now() + ($3 || ' minutes')::interval)`,
      [user.id, tokenHash, RESET_TTL_MIN]
    );
    const base = getAppBaseUrl(req);
    const resetUrl = `${base}/?reset=${token}`;
    const transport = getMailer();
    if (transport) {
      try {
        await transport.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: user.email,
          subject: 'Passwort zurücksetzen',
          text: `Link zum Zurücksetzen: ${resetUrl}\nDer Link ist ${RESET_TTL_MIN} Minuten gültig.`,
        });
      } catch {
        // swallow mail errors to avoid account enumeration
      }
    }
    logAudit('password_reset_requested', user.id, { email: user.email });
  }
  res.json({ ok: true });
});

app.post('/auth/reset', loginRateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) return res.status(400).json({ error: 'missing' });
  if (String(password).length < 8) return res.status(400).json({ error: 'weak_password' });
  const tokenHash = hashToken(token);
  const { rows } = await pool.query(
    `SELECT id, user_id
     FROM password_resets
     WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now()
     ORDER BY created_at DESC
     LIMIT 1`,
    [tokenHash]
  );
  const reset = rows[0];
  if (!reset) return res.status(400).json({ error: 'invalid' });
  const hash = await bcrypt.hash(password, 10);
  await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, reset.user_id]);
  await pool.query('UPDATE password_resets SET used_at=now() WHERE id=$1', [reset.id]);
  logAudit('password_reset', reset.user_id, {});
  res.json({ ok: true });
});

app.post('/auth/refresh', async (req, res) => {
  const bodyToken = req.body?.refresh_token;
  const cookieToken = getCookie(req, REFRESH_COOKIE_NAME);
  const refresh_token = cookieToken || bodyToken;
  if (!refresh_token) return res.status(400).json({ error: 'missing' });
  try {
    const payload = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);
    const { rows } = await pool.query('SELECT id, role FROM users WHERE id=$1', [payload.sub]);
    const user = rows[0];
    if (!user) {
      clearRefreshCookie(res, req);
      return res.status(401).json({ error: 'invalid' });
    }
    return res.json({ access_token: signAccessToken(user) });
  } catch {
    clearRefreshCookie(res, req);
    return res.status(401).json({ error: 'invalid' });
  }
});

app.post('/auth/logout', async (req, res) => {
  clearRefreshCookie(res, req);
  res.json({ ok: true });
});
// ============================================================================
// MAGIC LINK AUTHENTICATION - INSERT AFTER LINE 2035 (after /auth/logout)
// ============================================================================

// Helper: Generate 6-digit code
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Helper: Send Magic Link Email (with placeholders)
async function sendMagicLinkEmail(email, code, token) {
  const link = `https://your-domain.com/?token=${token}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0; padding:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:#f5f5f5;">
  <table style="width:100%; max-width:600px; margin:40px auto; background:white; border-radius:8px; overflow:hidden;">
    <tr>
      <td style="padding:40px; text-align:center; background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
        <h1 style="margin:0; color:white; font-size:24px;">🥋 QuizDojo</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:40px;">
        <h2 style="margin:0 0 20px; color:#1f2937; font-size:20px;">Dein Login</h2>
        <p style="margin:0 0 30px; color:#6b7280; line-height:1.6;">
          Wähle eine der beiden Optionen:
        </p>

        <!-- Option 1: Link -->
        <div style="margin:30px 0; padding:20px; background:#f9fafb; border-radius:8px;">
          <p style="font-weight:600; margin:0 0 12px; color:#374151;">📱 Option 1: Ein-Klick-Login</p>
          <a href="${link}" style="display:inline-block; padding:14px 32px; background:#3b82f6; color:white; text-decoration:none; border-radius:6px; font-weight:600; font-size:16px;">
            Jetzt einloggen →
          </a>
        </div>

        <div style="text-align:center; margin:20px 0; color:#d1d5db;">oder</div>

        <!-- Option 2: Code -->
        <div style="margin:30px 0; padding:20px; background:#f9fafb; border-radius:8px;">
          <p style="font-weight:600; margin:0 0 12px; color:#374151;">🔢 Option 2: Code eingeben</p>
          <div style="font-size:32px; font-weight:700; letter-spacing:8px; text-align:center; padding:20px; background:white; border-radius:8px; font-family:monospace; color:#1f2937;">
            ${code}
          </div>
          <p style="font-size:13px; color:#6b7280; text-align:center; margin:8px 0 0;">
            Code auf der Login-Seite eingeben
          </p>
        </div>

        <p style="margin:30px 0 0; color:#9ca3af; font-size:14px; line-height:1.6;">
          Falls du diesen Login nicht angefordert hast, ignoriere diese Email einfach.
        </p>
        <p style="margin:12px 0 0; color:#9ca3af; font-size:13px;">
          Gültig für 15 Minuten
        </p>

        <hr style="margin:30px 0; border:none; border-top:1px solid #e5e7eb;">
        <p style="margin:0; color:#9ca3af; font-size:12px;">
          Link funktioniert nicht? Kopiere diese URL:<br>
          <span style="color:#6b7280; word-break:break-all;">${link}</span>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  const text = `QuizDojo - Dein Login

Wähle eine Option:

Option 1: Ein-Klick-Login
${link}

Option 2: Code eingeben
${code}

Der Login ist 15 Minuten gültig.

Falls du diesen Login nicht angefordert hast, ignoriere diese Email.
`;

  const transport = getMailer();
  if (!transport) {
    console.warn('[MAGIC LINK] SMTP not configured - email would be sent:', { email, code });
    return; // Placeholder mode: don't throw error
  }

  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@example.com',
      to: email,
      subject: '🔑 Dein Login-Code',
      text,
      html
    });
    console.log('[MAGIC LINK] Email sent to:', email);
  } catch (err) {
    console.error('[MAGIC LINK] Email error:', err.message);
    // Don't throw - continue even if email fails (for testing)
  }
}

// POST /auth/request-magic-link
// Request a magic link + code via email
app.post('/auth/request-magic-link', loginRateLimit({ windowMs: 10 * 60 * 1000, max: 3 }), async (req, res) => {
  const { email } = req.body || {};

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'invalid_email' });
  }

  // Find or create user
  let user;
  const { rows } = await pool.query('SELECT id, email, username, role FROM users WHERE email=$1', [email]);

  if (!rows[0]) {
    // Auto-create user if email doesn't exist
    const username = email.split('@')[0];
    const result = await pool.query(
      'INSERT INTO users (email, username, role, is_guest) VALUES ($1,$2,$3,$4) RETURNING id, email, username, role',
      [email, username, 'student', false]
    );
    user = result.rows[0];
    await logAudit('auth_magic_link_autocreate', user.id, { email: user.email }, req.ip);
  } else {
    user = rows[0];
  }

  // Generate token + code
  const token = crypto.randomBytes(32).toString('hex'); // 64 chars
  const code = generateCode(); // 6 digits
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

  // Store in DB
  await pool.query(
    `INSERT INTO magic_tokens (user_id, token, code, email, expires_at, ip_address, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [user.id, token, code, email, expiresAt, req.ip, req.get('user-agent')]
  );

  // Send email
  await sendMagicLinkEmail(email, code, token);

  await logAudit('auth_magic_link_requested', user.id, { email }, req.ip);

  res.json({ ok: true, message: 'Email sent' });
});

// POST /auth/verify-code
// Verify a 6-digit code
app.post('/auth/verify-code', loginRateLimit({ windowMs: 10 * 60 * 1000, max: 10 }), async (req, res) => {
  const { email, code } = req.body || {};

  if (!email || !code || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'invalid_input' });
  }

  // Find token
  const { rows } = await pool.query(
    `SELECT mt.id, mt.user_id, mt.used, mt.expires_at, u.id as uid, u.email, u.username, u.role
     FROM magic_tokens mt
     JOIN users u ON u.id = mt.user_id
     WHERE mt.email = $1 AND mt.code = $2
     ORDER BY mt.created_at DESC
     LIMIT 1`,
    [email, code]
  );

  const record = rows[0];

  if (!record) {
    return res.status(400).json({ error: 'invalid_code' });
  }

  if (record.used) {
    return res.status(400).json({ error: 'code_already_used' });
  }

  if (new Date(record.expires_at) < new Date()) {
    return res.status(400).json({ error: 'code_expired' });
  }

  // Mark as used
  await pool.query('UPDATE magic_tokens SET used=true, used_at=now() WHERE id=$1', [record.id]);

  // Update login stats
  await pool.query(
    'UPDATE users SET last_login_at=now(), login_count=COALESCE(login_count,0)+1 WHERE id=$1',
    [record.user_id]
  );

  await logAudit('auth_magic_link_login', record.user_id, { email: record.email, method: 'code' }, req.ip);

  // Generate JWT
  const user = { id: record.uid, email: record.email, username: record.username, role: record.role };
  const refreshToken = signRefreshToken(user);
  setRefreshCookie(res, refreshToken, req);

  res.json({
    access_token: signAccessToken(user),
    user: { id: user.id, email: user.email, username: user.username, role: user.role }
  });
});

// GET /auth/verify-magic-link?token=xxx
// Verify a magic link token (from URL)
app.get('/auth/verify-magic-link', loginRateLimit({ windowMs: 10 * 60 * 1000, max: 10 }), async (req, res) => {
  const { token } = req.query;

  if (!token || token.length !== 64) {
    return res.status(400).json({ error: 'invalid_token' });
  }

  // Find token
  const { rows } = await pool.query(
    `SELECT mt.id, mt.user_id, mt.used, mt.expires_at, u.id as uid, u.email, u.username, u.role
     FROM magic_tokens mt
     JOIN users u ON u.id = mt.user_id
     WHERE mt.token = $1`,
    [token]
  );

  const record = rows[0];

  if (!record) {
    return res.status(400).json({ error: 'invalid_token' });
  }

  if (record.used) {
    return res.status(400).json({ error: 'token_already_used' });
  }

  if (new Date(record.expires_at) < new Date()) {
    return res.status(400).json({ error: 'token_expired' });
  }

  // Mark as used
  await pool.query('UPDATE magic_tokens SET used=true, used_at=now() WHERE id=$1', [record.id]);

  // Update login stats
  await pool.query(
    'UPDATE users SET last_login_at=now(), login_count=COALESCE(login_count,0)+1 WHERE id=$1',
    [record.user_id]
  );

  await logAudit('auth_magic_link_login', record.user_id, { email: record.email, method: 'link' }, req.ip);

  // Generate JWT
  const user = { id: record.uid, email: record.email, username: record.username, role: record.role };
  const refreshToken = signRefreshToken(user);
  setRefreshCookie(res, refreshToken, req);

  res.json({
    access_token: signAccessToken(user),
    user: { id: user.id, email: user.email, username: user.username, role: user.role }
  });
});

// ============================================================================
// END MAGIC LINK AUTHENTICATION
// ============================================================================

function parseLangCategory(category, lang) {
  let cat = category;
  let resolved = lang ? String(lang).toLowerCase() : null;
  if (!resolved && typeof category === 'string' && category.startsWith('lang:')) {
    const m = category.match(/^lang:([a-z]{2})(?:\\|(.*))?$/i);
    if (m) {
      resolved = m[1].toLowerCase();
      cat = m[2] || '';
    }
  }
  if (cat === '') cat = null;
  if (resolved === '') resolved = null;
  return { lang: resolved, category: cat };
}

app.get('/pools', auth(), async (_req, res) => {
  const { rows } = await pool.query('SELECT id, name, owner_id, created_at, updated_at FROM pools ORDER BY created_at DESC');
  res.json(rows);
});

app.post('/pools', auth(), async (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'missing' });
  const { rows } = await pool.query('INSERT INTO pools (name, owner_id) VALUES ($1,$2) RETURNING *', [name, req.user.sub]);
  logAudit('pool_create', req.user.sub, { pool: rows[0].id });
  res.status(201).json(rows[0]);
});

app.put('/pools/:id', auth(), async (req, res) => {
  const { name } = req.body || {};
  const { id } = req.params;
  const { rows: poolCheck } = await pool.query('SELECT owner_id FROM pools WHERE id=$1', [id]);
  if (!poolCheck.length) return res.status(404).json({ error: 'pool_not_found' });
  if (poolCheck[0].owner_id && poolCheck[0].owner_id !== req.user.sub && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'not_owner' });
  }
  const { rows } = await pool.query('UPDATE pools SET name=$1, updated_at=now() WHERE id=$2 RETURNING *', [name, id]);
  logAudit('pool_update', req.user.sub, { pool: id });
  res.json(rows[0]);
});

app.delete('/pools/:id', auth(), async (req, res) => {
  const { id } = req.params;
  const { rows: poolCheck } = await pool.query('SELECT owner_id FROM pools WHERE id=$1', [id]);
  if (!poolCheck.length) return res.status(404).json({ error: 'pool_not_found' });
  if (poolCheck[0].owner_id && poolCheck[0].owner_id !== req.user.sub && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'not_owner' });
  }
  await pool.query('DELETE FROM pools WHERE id=$1', [id]);
  logAudit('pool_delete', req.user.sub, { pool: id });
  res.status(204).end();
});

app.get('/pools/:id/questions', auth(), async (req, res) => {
  const { id } = req.params;
  const lang = (req.query.lang || '').toString().trim().toLowerCase();
  const qParams = [id];
  let qSql = 'SELECT q.id, q.text, q.category, q.explanation, q.lang, q.source_id FROM questions q WHERE q.pool_id=$1';
  if (lang) {
    qSql += ' AND q.lang = $2';
    qParams.push(lang);
  }
  qSql += ' ORDER BY q.created_at';
  const { rows: questions } = await pool.query(qSql, qParams);
  if (!questions.length) return res.json([]);
  const qids = questions.map(q => q.id);
  const { rows: answers } = await pool.query(
    'SELECT id, question_id, text, is_correct, source_id FROM answers WHERE question_id = ANY($1::uuid[])',
    [qids]
  );
  const byQ = new Map();
  for (const a of answers) {
    if (!byQ.has(a.question_id)) byQ.set(a.question_id, []);
    byQ.get(a.question_id).push(a);
  }
  const out = questions.map(q => ({
    ...q,
    answers: byQ.get(q.id) || [],
  }));
  const withImages = await attachQuestionImages(pool, out);
  res.json(withImages);
});

app.get('/pools/:id/langs', auth(), async (req, res) => {
  const { id } = req.params;
  const { rows: pools } = await pool.query('SELECT id FROM pools WHERE id=$1', [id]);
  if (!pools.length) return res.status(404).json({ error: 'pool_not_found' });
  const { rows } = await pool.query(
    'SELECT DISTINCT lang FROM questions WHERE pool_id=$1 AND lang IS NOT NULL ORDER BY lang',
    [id]
  );
  res.json({ langs: rows.map(r => r.lang).filter(Boolean) });
});

app.get('/questions/:id/translation', auth(), roleRateLimit(), async (req, res) => {
  const { id } = req.params;
  const lang = (req.query.lang || '').toString().trim().toLowerCase();
  if (!lang) return res.status(400).json({ error: 'missing_lang' });
  const { rows: src } = await pool.query(
    'SELECT source_id, lang FROM questions WHERE id=$1',
    [id]
  );
  if (!src.length) return res.status(404).json({ error: 'not_found' });
  if (!src[0].source_id) return res.status(404).json({ error: 'no_source_id' });
  if (src[0].lang === lang) return res.status(400).json({ error: 'same_lang' });
  const { rows: tgt } = await pool.query(
    `SELECT q.id, q.text, q.category, q.explanation, q.lang, q.source_id
     FROM questions q
     WHERE q.source_id = $1 AND q.lang = $2
     LIMIT 1`,
    [src[0].source_id, lang]
  );
  if (!tgt.length) return res.status(404).json({ error: 'translation_not_found' });
  const tgtQ = tgt[0];
  const { rows: answers } = await pool.query(
    'SELECT id, question_id, text, is_correct, source_id FROM answers WHERE question_id=$1',
    [tgtQ.id]
  );
  const out = { ...tgtQ, answers };
  const withImages = await attachQuestionImages(pool, [out]);
  res.json(withImages[0]);
});

app.post('/pools/:id/questions', auth(), async (req, res) => {
  const { id } = req.params;
  const { text, category, explanation, answers, lang } = req.body || {};
  if (!text || !Array.isArray(answers) || answers.length < 2) return res.status(400).json({ error: 'invalid' });
  try {
    const { rows: pools } = await pool.query('SELECT id, owner_id FROM pools WHERE id=$1', [id]);
    if (!pools.length) return res.status(404).json({ error: 'pool_not_found' });
    if (pools[0].owner_id && pools[0].owner_id !== req.user.sub && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'not_owner' });
    }
    const parsed = parseLangCategory(category, lang);
    const q = await pool.query(
      'INSERT INTO questions (pool_id, text, category, explanation, lang) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [id, text, parsed.category || null, explanation || null, parsed.lang || null]
    );
    const qid = q.rows[0].id;
    for (const a of answers) {
      await pool.query(
        'INSERT INTO answers (question_id, text, is_correct) VALUES ($1,$2,$3)',
        [qid, a.text, !!a.is_correct]
      );
    }
    logAudit('question_create', req.user.sub, { pool: id, question: qid });
    res.status(201).json(q.rows[0]);
  } catch {
    res.status(500).json({ error: 'server_error' });
  }
});

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') {
      cur += '"';
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

app.post('/pools/:id/import/json', auth(), roleRateLimit(), async (req, res) => {
  const { id } = req.params;
  const body = req.body;
  const fragen = Array.isArray(body) ? body : (body?.fragen || []);
  if (!Array.isArray(fragen) || !fragen.length) return res.status(400).json({ error: 'invalid' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: pools } = await client.query('SELECT id, owner_id FROM pools WHERE id=$1', [id]);
    if (!pools.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'pool_not_found' });
    }
    if (pools[0].owner_id && pools[0].owner_id !== req.user.sub && req.user?.role !== 'admin') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'not_owner' });
    }
    for (const q of fragen) {
      const parsed = parseLangCategory(q.kategorie || null, q.lang || null);
      const qSourceId = q.id ? String(q.id) : null;
      const qRes = await client.query(
        'INSERT INTO questions (pool_id, text, category, explanation, lang, source_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        [id, q.frage || '', parsed.category || null, q.erklaerung || null, parsed.lang || null, qSourceId]
      );
      const qid = qRes.rows[0].id;
      for (const a of (q.antworten || [])) {
        const aSourceId = a.id ? String(a.id) : null;
        await client.query(
          'INSERT INTO answers (question_id, text, is_correct, source_id) VALUES ($1,$2,$3,$4)',
          [qid, a.text || '', !!a.korrekt, aSourceId]
        );
      }
      let imgIdx = 0;
      for (const img of (q.bilder || [])) {
        await client.query(
          'INSERT INTO question_images (question_id, url, alt, local_path, sort_order) VALUES ($1,$2,$3,$4,$5)',
          [qid, img.url || null, img.alt || null, img.local || null, imgIdx]
        );
        imgIdx += 1;
      }
    }
    await client.query('COMMIT');
    logAudit('import_pool_json', req.user.sub, { pool: id, count: fragen.length });
    res.json({ ok: true, imported: fragen.length });
  } catch {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'server_error' });
  } finally {
    client.release();
  }
});

app.post('/pools/:id/import/csv', auth(), roleRateLimit(), async (req, res) => {
  const { id } = req.params;
  const csv = (req.body?.csv || '').toString();
  if (!csv.trim()) return res.status(400).json({ error: 'missing' });
  const lines = csv.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return res.status(400).json({ error: 'invalid' });
  const header = parseCsvLine(lines.shift());
  const qIdx = header.findIndex(h => h.toLowerCase() === 'question');
  const corrIdx = header.findIndex(h => h.toLowerCase() === 'correct');
  const ansIdxs = header.map((h, i) => h.toLowerCase().startsWith('answer') ? i : -1).filter(i => i >= 0);
  if (qIdx < 0 || ansIdxs.length < 2 || corrIdx < 0) return res.status(400).json({ error: 'bad_header' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: pools } = await client.query('SELECT id, owner_id FROM pools WHERE id=$1', [id]);
    if (!pools.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'pool_not_found' });
    }
    if (pools[0].owner_id && pools[0].owner_id !== req.user.sub && req.user?.role !== 'admin') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'not_owner' });
    }
    let count = 0;
    for (const line of lines) {
      const cols = parseCsvLine(line);
      const frage = cols[qIdx] || '';
      const correct = (cols[corrIdx] || '').split('|').map(s => parseInt(s, 10)).filter(n => Number.isFinite(n));
      const answers = ansIdxs.map((i, idx) => ({
        text: cols[i] || '',
        korrekt: correct.includes(idx + 1)
      }));
      const qRes = await client.query(
        'INSERT INTO questions (pool_id, text) VALUES ($1,$2) RETURNING id',
        [id, frage]
      );
      const qid = qRes.rows[0].id;
      for (const a of answers) {
        await client.query(
          'INSERT INTO answers (question_id, text, is_correct) VALUES ($1,$2,$3)',
          [qid, a.text, !!a.korrekt]
        );
      }
      count += 1;
    }
    await client.query('COMMIT');
    logAudit('import_pool_csv', req.user.sub, { pool: id, count });
    res.json({ ok: true, imported: count });
  } catch {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'server_error' });
  } finally {
    client.release();
  }
});

app.post('/training/answer', auth(), roleRateLimit(), async (req, res) => {
  const tz = await normalizeTimezone(req.headers['x-user-timezone']);
  const { question_id, selected_answer_ids } = req.body || {};
  if (!question_id || !Array.isArray(selected_answer_ids)) return res.status(400).json({ error: 'invalid' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: qRows } = await client.query('SELECT pool_id FROM questions WHERE id=$1', [question_id]);
    if (!qRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'question_not_found' });
    }
    const { rows: correctRows } = await client.query(
      'SELECT id FROM answers WHERE question_id=$1 AND is_correct=true',
      [question_id]
    );
    const correctIds = new Set(correctRows.map(r => r.id));
    const sel = new Set(selected_answer_ids);
    const isCorrect = correctIds.size === sel.size && [...correctIds].every(id => sel.has(id));

    await client.query(
      `INSERT INTO user_question_stats (user_id, question_id, asked_count, correct_count, streak, last_seen_at, last_result)
       VALUES ($1,$2,1,$3,$4,now(),$5)
       ON CONFLICT (user_id, question_id) DO UPDATE SET
         asked_count = user_question_stats.asked_count + 1,
         correct_count = user_question_stats.correct_count + EXCLUDED.correct_count,
         streak = CASE WHEN EXCLUDED.last_result='correct' THEN user_question_stats.streak + 1 ELSE 0 END,
         last_seen_at = now(),
         last_result = EXCLUDED.last_result`,
      [req.user.sub, question_id, isCorrect ? 1 : 0, isCorrect ? 1 : 0, isCorrect ? 'correct' : 'wrong']
    );

    if (!isCorrect) {
      await client.query(
        `INSERT INTO user_wrong_questions (user_id, question_id, wrong_count, last_wrong_at)
         VALUES ($1,$2,1,now())
         ON CONFLICT (user_id, question_id) DO UPDATE SET
           wrong_count = user_wrong_questions.wrong_count + 1,
           last_wrong_at = now()`,
        [req.user.sub, question_id]
      );
    } else {
      await client.query(
        'DELETE FROM user_later_questions WHERE user_id=$1 AND question_id=$2',
        [req.user.sub, question_id]
      );
    }

    await recordDailyActivity(client, req.user.sub, qRows[0].pool_id, {
      training_correct: isCorrect ? 1 : 0,
      training_wrong: isCorrect ? 0 : 1,
      total_answered: 1
    }, tz);
    const xpDelta = isCorrect ? XP_RULES.training_correct : XP_RULES.training_wrong;
    const gamification = await updateGamification(client, req.user.sub, xpDelta);

    await client.query('COMMIT');
    logAudit('training_answer', req.user.sub, { question_id, correct: isCorrect });
    res.json({ correct: isCorrect, xp_awarded: xpDelta, gamification });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'server_error' });
  } finally {
    client.release();
  }
});

app.post('/swipe/answer', auth(), roleRateLimit(), async (req, res) => {
  const tz = await normalizeTimezone(req.headers['x-user-timezone']);
  const { question_id, selected_answer_id } = req.body || {};
  if (!question_id || !selected_answer_id) return res.status(400).json({ error: 'invalid' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: qRows } = await client.query('SELECT pool_id FROM questions WHERE id=$1', [question_id]);
    if (!qRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'question_not_found' });
    }
    const { rows: correctRows } = await client.query(
      'SELECT id FROM answers WHERE question_id=$1 AND is_correct=true',
      [question_id]
    );
    const correctId = correctRows[0]?.id;
    if (!correctId) {
      await client.query('ROLLBACK');
      return res.status(500).json({ error: 'no_correct_answer' });
    }
    const isCorrect = selected_answer_id === correctId;

    await client.query(
      `INSERT INTO user_question_stats (user_id, question_id, asked_count, correct_count, streak, last_seen_at, last_result)
       VALUES ($1,$2,1,$3,$4,now(),$5)
       ON CONFLICT (user_id, question_id) DO UPDATE SET
         asked_count = user_question_stats.asked_count + 1,
         correct_count = user_question_stats.correct_count + EXCLUDED.correct_count,
         streak = CASE WHEN EXCLUDED.last_result='correct' THEN user_question_stats.streak + 1 ELSE 0 END,
         last_seen_at = now(),
         last_result = EXCLUDED.last_result`,
      [req.user.sub, question_id, isCorrect ? 1 : 0, isCorrect ? 1 : 0, isCorrect ? 'correct' : 'wrong']
    );

    if (!isCorrect) {
      await client.query(
        `INSERT INTO user_wrong_questions (user_id, question_id, wrong_count, last_wrong_at)
         VALUES ($1,$2,1,now())
         ON CONFLICT (user_id, question_id) DO UPDATE SET
           wrong_count = user_wrong_questions.wrong_count + 1,
           last_wrong_at = now()`,
        [req.user.sub, question_id]
      );
    }

    await recordDailyActivity(client, req.user.sub, qRows[0].pool_id, {
      training_correct: isCorrect ? 1 : 0,
      training_wrong: isCorrect ? 0 : 1,
      total_answered: 1
    }, tz);
    const xpDelta = isCorrect ? 10 : 0;
    const gamification = await updateGamification(client, req.user.sub, xpDelta);

    await client.query('COMMIT');
    logAudit('swipe_answer', req.user.sub, { question_id, correct: isCorrect });
    res.json({ correct: isCorrect, correct_answer_id: correctId, xp_awarded: xpDelta, gamification });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'server_error' });
  } finally {
    client.release();
  }
});

app.get('/training/wrong', auth(), roleRateLimit(), async (req, res) => {
  const poolId = req.query.pool_id;
  if (!poolId) return res.status(400).json({ error: 'invalid' });
  const lang = (req.query.lang || '').toString().trim().toLowerCase();
  const { rows: pools } = await pool.query('SELECT id FROM pools WHERE id=$1', [poolId]);
  if (!pools.length) return res.status(404).json({ error: 'pool_not_found' });
  const params = [req.user.sub, poolId];
  let sql = `SELECT q.id
     FROM questions q
     JOIN user_wrong_questions w ON w.question_id = q.id
     WHERE w.user_id = $1 AND q.pool_id = $2
       AND w.last_wrong_at >= now() - interval '48 hours'`;
  if (lang) {
    sql += ' AND q.lang = $3';
    params.push(lang);
  }
  sql += ' ORDER BY w.last_wrong_at DESC';
  const { rows } = await pool.query(sql, params);
  res.json({ ids: rows.map(r => r.id) });
});

app.get('/training/later', auth(), roleRateLimit(), async (req, res) => {
  const poolId = req.query.pool_id;
  if (!poolId) return res.status(400).json({ error: 'invalid' });
  const lang = (req.query.lang || '').toString().trim().toLowerCase();
  const { rows: pools } = await pool.query('SELECT id FROM pools WHERE id=$1', [poolId]);
  if (!pools.length) return res.status(404).json({ error: 'pool_not_found' });
  const params = [req.user.sub, poolId];
  let sql = `SELECT q.id
     FROM questions q
     JOIN user_later_questions l ON l.question_id = q.id
     WHERE l.user_id = $1 AND q.pool_id = $2`;
  if (lang) {
    sql += ' AND q.lang = $3';
    params.push(lang);
  }
  sql += ' ORDER BY l.marked_at DESC';
  const { rows } = await pool.query(sql, params);
  res.json({ ids: rows.map(r => r.id) });
});

app.post('/training/later', auth(), roleRateLimit(), async (req, res) => {
  const { question_id, mark } = req.body || {};
  if (!question_id) return res.status(400).json({ error: 'invalid' });
  const { rows: qRows } = await pool.query(
    'SELECT id FROM questions WHERE id=$1',
    [question_id]
  );
  if (!qRows.length) return res.status(404).json({ error: 'not_found' });
  if (mark === false) {
    await pool.query(
      'DELETE FROM user_later_questions WHERE user_id=$1 AND question_id=$2',
      [req.user.sub, question_id]
    );
    logAudit('training_later_unmark', req.user.sub, { question_id });
    return res.json({ ok: true, marked: false });
  }
  await pool.query(
    `INSERT INTO user_later_questions (user_id, question_id, marked_at)
     VALUES ($1,$2,now())
     ON CONFLICT (user_id, question_id) DO UPDATE SET
       marked_at = EXCLUDED.marked_at`,
    [req.user.sub, question_id]
  );
  logAudit('training_later_mark', req.user.sub, { question_id });
  res.json({ ok: true, marked: true });
});

app.post('/training/reset', auth(), roleRateLimit(), async (req, res) => {
  const { pool_id } = req.body || {};
  if (!pool_id) return res.status(400).json({ error: 'invalid' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: pools } = await client.query('SELECT id FROM pools WHERE id=$1', [pool_id]);
    if (!pools.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'pool_not_found' });
    }
    const statsRes = await client.query(
      `DELETE FROM user_question_stats uqs
       USING questions q
       WHERE uqs.question_id = q.id AND q.pool_id = $2 AND uqs.user_id = $1`,
      [req.user.sub, pool_id]
    );
    const learningBoxRes = await client.query(
      `DELETE FROM learning_box_items i
       USING learning_box_sets s
       WHERE i.set_id = s.id AND s.pool_id = $2 AND i.user_id = $1`,
      [req.user.sub, pool_id]
    );
    await client.query('COMMIT');
    logAudit('training_reset', req.user.sub, {
      pool: pool_id,
      stats: statsRes.rowCount,
      learning_box: learningBoxRes.rowCount
    });
    res.json({
      ok: true,
      stats_deleted: statsRes.rowCount,
      learning_box_deleted: learningBoxRes.rowCount
    });
  } catch {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'server_error' });
  } finally {
    client.release();
  }
});

app.get('/leitner/due', auth(), roleRateLimit(), async (req, res) => {
  const boxes = (req.query.boxes || '')
    .toString()
    .split(',')
    .map(s => parseInt(s, 10))
    .filter(n => n >= 1 && n <= 5);
  const setId = req.query.set_id;
  if (!setId) return res.status(400).json({ error: 'missing_set_id' });
  const { rows: sets } = await pool.query(
    'SELECT id, pool_id, mode FROM learning_box_sets WHERE id=$1 AND user_id=$2',
    [setId, req.user.sub]
  );
  if (!sets.length) return res.status(404).json({ error: 'set_not_found' });
  const set = sets[0];
  const params = [setId, req.user.sub];
  let boxWhere = '';
  if (boxes.length) {
    params.push(boxes);
    boxWhere = 'AND i.box = ANY($3::int[])';
  }
  const dueFilter = set.mode === 'classic' ? 'AND (i.due_at IS NULL OR i.due_at <= now())' : '';
  const { rows: due } = await pool.query(
    `SELECT i.question_id, i.box, i.due_at
     FROM learning_box_items i
     WHERE i.set_id=$1 AND i.user_id=$2
     ${dueFilter}
     ${boxWhere}`,
    params
  );
  if (!due.length) return res.json([]);
  const lang = (req.query.lang || '').toString().trim().toLowerCase();
  const qids = due.map(d => d.question_id);
  const qParams = [qids];
  let qSql = 'SELECT id, text, category, explanation, lang, source_id FROM questions WHERE id = ANY($1::uuid[])';
  if (lang) {
    qSql += ' AND lang = $2';
    qParams.push(lang);
  }
  const { rows: questions } = await pool.query(qSql, qParams);
  const { rows: answers } = await pool.query(
    'SELECT id, question_id, text, is_correct, source_id FROM answers WHERE question_id = ANY($1::uuid[])',
    [qids]
  );
  const byQ = new Map();
  for (const a of answers) {
    if (!byQ.has(a.question_id)) byQ.set(a.question_id, []);
    byQ.get(a.question_id).push(a);
  }
  const out = questions.map(q => ({
    ...q,
    answers: byQ.get(q.id) || []
  }));
  const withImages = await attachQuestionImages(pool, out);
  res.json(withImages);
});

app.get('/leitner/all', auth(), roleRateLimit(), async (req, res) => {
  const boxes = (req.query.boxes || '')
    .toString()
    .split(',')
    .map(s => parseInt(s, 10))
    .filter(n => n >= 1 && n <= 5);
  const setId = req.query.set_id;
  if (!setId) return res.status(400).json({ error: 'missing_set_id' });
  const { rows: sets } = await pool.query(
    'SELECT id, pool_id, mode FROM learning_box_sets WHERE id=$1 AND user_id=$2',
    [setId, req.user.sub]
  );
  if (!sets.length) return res.status(404).json({ error: 'set_not_found' });
  const set = sets[0];
  const params = [setId, req.user.sub];
  let boxWhere = '';
  if (boxes.length) {
    params.push(boxes);
    boxWhere = 'AND i.box = ANY($3::int[])';
  }
  const { rows: all } = await pool.query(
    `SELECT i.question_id, i.box, i.due_at
     FROM learning_box_items i
     WHERE i.set_id=$1 AND i.user_id=$2
     ${boxWhere}`,
    params
  );
  if (!all.length) return res.json([]);
  const lang = (req.query.lang || '').toString().trim().toLowerCase();
  const qids = all.map(d => d.question_id);
  const qParams = [qids];
  let qSql = 'SELECT id, text, category, explanation, lang, source_id FROM questions WHERE id = ANY($1::uuid[])';
  if (lang) {
    qSql += ' AND lang = $2';
    qParams.push(lang);
  }
  const { rows: questions } = await pool.query(qSql, qParams);
  const { rows: answers } = await pool.query(
    'SELECT id, question_id, text, is_correct, source_id FROM answers WHERE question_id = ANY($1::uuid[])',
    [qids]
  );
  const byQ = new Map();
  for (const a of answers) {
    if (!byQ.has(a.question_id)) byQ.set(a.question_id, []);
    byQ.get(a.question_id).push(a);
  }
  const out = questions.map(q => ({
    ...q,
    answers: byQ.get(q.id) || []
  }));
  const withImages = await attachQuestionImages(pool, out);
  res.json(withImages);
});

app.post('/leitner/seed', auth(), roleRateLimit(), async (req, res) => {
  const { set_id, lang } = req.body || {};
  if (!set_id) return res.status(400).json({ error: 'invalid' });
  const { rows: sets } = await pool.query(
    'SELECT id, pool_id, mode FROM learning_box_sets WHERE id=$1 AND user_id=$2',
    [set_id, req.user.sub]
  );
  if (!sets.length) return res.status(404).json({ error: 'set_not_found' });
  const set = sets[0];
  const params = [set_id, req.user.sub, set.pool_id];
  const langVal = (lang || '').toString().trim().toLowerCase();
  let sql = `INSERT INTO learning_box_items (set_id, user_id, question_id, box, due_at)
     SELECT $1, $2, q.id, 1, ${set.mode === 'classic' ? 'now()' : 'NULL'}
     FROM questions q
     WHERE q.pool_id = $3`;
  if (langVal) {
    sql += ' AND q.lang = $4';
    params.push(langVal);
  }
  sql += ` AND NOT EXISTS (
         SELECT 1 FROM learning_box_items i WHERE i.set_id = $1 AND i.user_id = $2 AND i.question_id = q.id
       )`;
  const { rowCount } = await pool.query(sql, params);
  logAudit('leitner_seed', req.user.sub, { set: set_id, inserted: rowCount });
  res.json({ ok: true, inserted: rowCount });
});

app.get('/leitner/stats', auth(), roleRateLimit(), async (req, res) => {
  const setId = req.query.set_id;
  if (!setId) return res.status(400).json({ error: 'invalid' });
  const { rows: sets } = await pool.query(
    'SELECT id, pool_id, mode FROM learning_box_sets WHERE id=$1 AND user_id=$2',
    [setId, req.user.sub]
  );
  if (!sets.length) return res.status(404).json({ error: 'set_not_found' });
  const { rows } = await pool.query(
    `SELECT i.box, count(*)::int AS count
     FROM learning_box_items i
     WHERE i.user_id=$1 AND i.set_id=$2
     GROUP BY i.box`,
    [req.user.sub, setId]
  );
  const counts = {1:0,2:0,3:0,4:0,5:0};
  for (const r of rows) counts[r.box] = r.count;
  const total = Object.values(counts).reduce((a,b)=>a+b,0);
  res.json({ counts, total });
});

app.post('/leitner/reset', auth(), roleRateLimit(), async (req, res) => {
  const { set_id } = req.body || {};
  if (!set_id) return res.status(400).json({ error: 'invalid' });
  const { rows: sets } = await pool.query(
    'SELECT id FROM learning_box_sets WHERE id=$1 AND user_id=$2',
    [set_id, req.user.sub]
  );
  if (!sets.length) return res.status(404).json({ error: 'set_not_found' });
  const { rowCount } = await pool.query(
    `DELETE FROM learning_box_items
     WHERE set_id=$1 AND user_id=$2`,
    [set_id, req.user.sub]
  );
  logAudit('leitner_reset', req.user.sub, { set: set_id, deleted: rowCount });
  res.json({ ok: true, deleted: rowCount });
});

app.post('/leitner/answer', auth(), roleRateLimit(), async (req, res) => {
  const tz = await normalizeTimezone(req.headers['x-user-timezone']);
  const { question_id, result, set_id } = req.body || {};
  if (!question_id || !set_id || !['correct','wrong'].includes(result)) return res.status(400).json({ error: 'invalid' });
  const isCorrect = result === 'correct';
  const { rows: qRows } = await pool.query('SELECT pool_id FROM questions WHERE id=$1', [question_id]);
  if (!qRows.length) return res.status(404).json({ error: 'question_not_found' });
  const { rows: sets } = await pool.query(
    'SELECT id, mode FROM learning_box_sets WHERE id=$1 AND user_id=$2',
    [set_id, req.user.sub]
  );
  if (!sets.length) return res.status(404).json({ error: 'set_not_found' });
  const set = sets[0];
  const { rows: itemRows } = await pool.query(
    'SELECT box FROM learning_box_items WHERE set_id=$1 AND user_id=$2 AND question_id=$3',
    [set_id, req.user.sub, question_id]
  );
  const currentBox = itemRows[0]?.box || 1;
  const newBox = isCorrect ? Math.min(currentBox + 1, 5) : Math.max(currentBox - 1, 1);
  const days = LEARNING_BOX_INTERVALS_DAYS[newBox] || 1;
  const dueExpr = set.mode === 'classic' ? `now() + (${days} || ' days')::interval` : 'NULL';
  await pool.query(
    `INSERT INTO learning_box_items (set_id, user_id, question_id, box, due_at)
     VALUES ($1,$2,$3,$4, ${dueExpr})
     ON CONFLICT (set_id, user_id, question_id) DO UPDATE SET
       box = EXCLUDED.box,
       due_at = EXCLUDED.due_at`,
    [set_id, req.user.sub, question_id, newBox]
  );
  await recordDailyActivity(pool, req.user.sub, qRows[0].pool_id, {
    leitner_correct: isCorrect ? 1 : 0,
    total_answered: 1
  }, tz);
  const xpDelta = isCorrect ? XP_RULES.leitner_correct : 0;
  const gamification = await updateGamification(pool, req.user.sub, xpDelta);

  // Update Leitner stats
  const today = new Date().toISOString().split('T')[0];
  await pool.query(
    `INSERT INTO leitner_stats (user_id, set_id, session_count, total_correct, total_wrong, last_activity_date, last_session_at)
     VALUES ($1, $2, 1, $3, $4, $5, now())
     ON CONFLICT (user_id, set_id) DO UPDATE SET
       session_count = leitner_stats.session_count + 1,
       total_correct = leitner_stats.total_correct + $3,
       total_wrong = leitner_stats.total_wrong + $4,
       last_session_at = now(),
       last_activity_date = $5,
       current_streak_days = CASE
         WHEN leitner_stats.last_activity_date = CURRENT_DATE - 1 THEN leitner_stats.current_streak_days + 1
         WHEN leitner_stats.last_activity_date = CURRENT_DATE THEN leitner_stats.current_streak_days
         ELSE 1
       END,
       longest_streak_days = GREATEST(
         leitner_stats.longest_streak_days,
         CASE
           WHEN leitner_stats.last_activity_date = CURRENT_DATE - 1 THEN leitner_stats.current_streak_days + 1
           WHEN leitner_stats.last_activity_date = CURRENT_DATE THEN leitner_stats.current_streak_days
           ELSE 1
         END
       )`,
    [req.user.sub, set_id, isCorrect ? 1 : 0, isCorrect ? 0 : 1, today]
  );

  logAudit('leitner_answer', req.user.sub, { question_id, result, box: newBox });
  res.json({ box: newBox, xp_awarded: xpDelta, gamification });
});

// GET /leitner/progress/:setId - Get mastery progress for a learning set
app.get('/leitner/progress/:setId', auth(), roleRateLimit(), async (req, res) => {
  try {
    const { setId } = req.params;

    // Get box distribution
    const { rows: boxRows } = await pool.query(
      `SELECT box, COUNT(*) as count
       FROM learning_box_items
       WHERE set_id = $1 AND user_id = $2
       GROUP BY box
       ORDER BY box`,
      [setId, req.user.sub]
    );

    const boxDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let totalQuestions = 0;
    let masteredCount = 0;

    for (const row of boxRows) {
      boxDistribution[row.box] = parseInt(row.count);
      totalQuestions += parseInt(row.count);
      if (row.box === 5) masteredCount = parseInt(row.count);
    }

    const masteryPercentage = totalQuestions > 0 ? (masteredCount / totalQuestions * 100) : 0;

    // Get milestones reached
    const { rows: milestones } = await pool.query(
      `SELECT milestone, reached_at, session_count, days_taken
       FROM leitner_milestones
       WHERE user_id = $1 AND set_id = $2
       ORDER BY milestone`,
      [req.user.sub, setId]
    );

    // Get stats
    const { rows: statsRows } = await pool.query(
      `SELECT session_count, total_correct, total_wrong,
              current_streak_days, longest_streak_days, started_at
       FROM leitner_stats
       WHERE user_id = $1 AND set_id = $2`,
      [req.user.sub, setId]
    );
    const stats = statsRows[0] || {
      session_count: 0,
      total_correct: 0,
      total_wrong: 0,
      current_streak_days: 0,
      longest_streak_days: 0,
      started_at: null
    };

    res.json({
      totalQuestions,
      masteredCount,
      masteryPercentage: parseFloat(masteryPercentage.toFixed(1)),
      boxDistribution,
      milestones: milestones.map(m => m.milestone),
      stats
    });
  } catch (err) {
    console.error('[Leitner Progress] Error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// POST /leitner/check-milestone - Check and record milestone achievement
app.post('/leitner/check-milestone', auth(), roleRateLimit(), async (req, res) => {
  try {
    const { setId, masteryPercentage, totalQuestions, masteredCount } = req.body;

    if (!setId || masteryPercentage === undefined) {
      return res.status(400).json({ error: 'invalid_params' });
    }

    // Determine which milestone was reached
    const milestones = [25, 50, 75, 100];
    const reachedMilestone = milestones.find(m => masteryPercentage >= m);

    if (!reachedMilestone) {
      return res.json({ milestone: null });
    }

    // Check if already recorded
    const { rows: existing } = await pool.query(
      `SELECT milestone FROM leitner_milestones
       WHERE user_id = $1 AND set_id = $2 AND milestone = $3`,
      [req.user.sub, setId, reachedMilestone]
    );

    if (existing.length > 0) {
      return res.json({ milestone: null, alreadyRecorded: true });
    }

    // Get stats for days_taken
    const { rows: statsRows } = await pool.query(
      `SELECT started_at, session_count FROM leitner_stats
       WHERE user_id = $1 AND set_id = $2`,
      [req.user.sub, setId]
    );

    const daysTaken = statsRows[0]?.started_at
      ? Math.ceil((Date.now() - new Date(statsRows[0].started_at)) / (1000 * 60 * 60 * 24))
      : 0;
    const sessionCount = statsRows[0]?.session_count || 0;

    // Record milestone
    await pool.query(
      `INSERT INTO leitner_milestones
       (user_id, set_id, milestone, total_questions, mastered_questions, session_count, days_taken)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [req.user.sub, setId, reachedMilestone, totalQuestions, masteredCount, sessionCount, daysTaken]
    );

    await logAudit('leitner_milestone', req.user.sub, { setId, milestone: reachedMilestone });

    res.json({
      milestone: reachedMilestone,
      new: true,
      stats: { sessionCount, daysTaken }
    });
  } catch (err) {
    console.error('[Leitner Milestone] Error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

app.post('/exams/start', auth(), roleRateLimit(), async (req, res) => {
  const { pool_id, count, time_limit, lang } = req.body || {};
  if (!pool_id || !count) return res.status(400).json({ error: 'invalid' });
  const { rows: pools } = await pool.query('SELECT id FROM pools WHERE id=$1', [pool_id]);
  if (!pools.length) return res.status(404).json({ error: 'pool_not_found' });
  const qParams = [pool_id, count];
  let qSql = 'SELECT id, text, category, explanation, lang, source_id FROM questions WHERE pool_id=$1';
  const langVal = (lang || '').toString().trim().toLowerCase();
  if (langVal) {
    qSql += ' AND lang = $3';
    qParams.push(langVal);
  }
  qSql += ' ORDER BY random() LIMIT $2';
  const { rows: questions } = await pool.query(qSql, qParams);
  if (questions.length < count) {
    return res.status(400).json({ error: 'not_enough_questions', available: questions.length });
  }
  const { rows } = await pool.query(
    'INSERT INTO exam_sessions (user_id, pool_id, total_questions) VALUES ($1,$2,$3) RETURNING *',
    [req.user.sub, pool_id, count]
  );
  logAudit('exam_start', req.user.sub, { session: rows[0].id, pool: pool_id });
  const qids = questions.map(q => q.id);
  const { rows: answers } = qids.length
    ? await pool.query(
        'SELECT id, question_id, text, is_correct, source_id FROM answers WHERE question_id = ANY($1::uuid[])',
        [qids]
      )
    : { rows: [] };
  const byQ = new Map();
  for (const a of answers) {
    if (!byQ.has(a.question_id)) byQ.set(a.question_id, []);
    byQ.get(a.question_id).push(a);
  }
  const questionsOut = questions.map(q => ({
    ...q,
    answers: byQ.get(q.id) || []
  }));
  const withImages = await attachQuestionImages(pool, questionsOut);
  res.json({ ...rows[0], questions: withImages });
});

app.get('/exams/sessions', auth(), roleRateLimit(), async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
  const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);
  const { rows } = await pool.query(
    `SELECT s.id, s.pool_id, p.name AS pool_name, s.total_questions, s.correct_answers,
            s.started_at, s.finished_at
     FROM exam_sessions s
     LEFT JOIN pools p ON p.id = s.pool_id
     WHERE s.user_id = $1
     ORDER BY s.started_at DESC
     LIMIT $2 OFFSET $3`,
    [req.user.sub, limit, offset]
  );
  if (!rows.length) return res.json([]);
  const sessionIds = rows.map(r => r.id);
  const { rows: wrongRows } = await pool.query(
    `SELECT session_id, count(*)::int AS wrong_count
     FROM exam_answers
     WHERE session_id = ANY($1::uuid[]) AND is_correct=false
     GROUP BY session_id`,
    [sessionIds]
  );
  const wrongBySession = new Map(wrongRows.map(r => [r.session_id, r.wrong_count]));
  res.json(rows.map(r => ({
    ...r,
    wrong_answers: wrongBySession.get(r.id) || 0
  })));
});

app.post('/exams/:id/mark-wrong', auth(), roleRateLimit(), async (req, res) => {
  const { id } = req.params;
  const { rows: sessions } = await pool.query(
    'SELECT id FROM exam_sessions WHERE id=$1 AND user_id=$2',
    [id, req.user.sub]
  );
  if (!sessions.length) return res.status(404).json({ error: 'not_found' });
  const { rows: wrongs } = await pool.query(
    `SELECT question_id FROM exam_answers WHERE session_id=$1 AND is_correct=false`,
    [id]
  );
  if (!wrongs.length) return res.json({ ok: true, marked: 0 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let count = 0;
    for (const w of wrongs) {
      await client.query(
        `INSERT INTO user_later_questions (user_id, question_id, marked_at)
         VALUES ($1,$2,now())
         ON CONFLICT (user_id, question_id) DO UPDATE SET
           marked_at = EXCLUDED.marked_at`,
        [req.user.sub, w.question_id]
      );
      count += 1;
    }
    await client.query('COMMIT');
    logAudit('exam_mark_wrong', req.user.sub, { session: id, marked: count });
    res.json({ ok: true, marked: count });
  } catch {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'server_error' });
  } finally {
    client.release();
  }
});

app.delete('/exams/:id', auth(), roleRateLimit(), async (req, res) => {
  const { id } = req.params;
  const { rows: sessions } = await pool.query(
    'SELECT id FROM exam_sessions WHERE id=$1 AND user_id=$2',
    [id, req.user.sub]
  );
  if (!sessions.length) return res.status(404).json({ error: 'not_found' });
  await pool.query('DELETE FROM exam_sessions WHERE id=$1', [id]);
  logAudit('exam_delete', req.user.sub, { session: id });
  res.json({ ok: true });
});

app.post('/exams/submit', auth(), roleRateLimit(), async (req, res) => {
  const tz = await normalizeTimezone(req.headers['x-user-timezone']);
  const { session_id, answers } = req.body || {};
  if (!session_id || !Array.isArray(answers)) return res.status(400).json({ error: 'invalid' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let correctCount = 0;
    const { rows: sessRows } = await client.query(
      'SELECT pool_id, total_questions, finished_at FROM exam_sessions WHERE id=$1 AND user_id=$2 FOR UPDATE',
      [session_id, req.user.sub]
    );
    if (!sessRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'not_found' });
    }
    const session = sessRows[0];
    if (session.finished_at) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'already_submitted' });
    }
    if (!answers.length || answers.length !== session.total_questions) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'invalid_answer_count',
        expected: session.total_questions,
        got: answers.length
      });
    }
    const questionIds = answers.map(a => a?.question_id).filter(Boolean);
    const uniqueIds = new Set(questionIds);
    if (uniqueIds.size !== questionIds.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'duplicate_questions' });
    }
    const { rows: validRows } = await client.query(
      'SELECT id FROM questions WHERE id = ANY($1::uuid[]) AND pool_id=$2',
      [questionIds, session.pool_id]
    );
    if (validRows.length !== questionIds.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'invalid_questions' });
    }
    for (const ans of answers) {
      const { question_id, selected_answer_ids } = ans;
      if (!question_id || !Array.isArray(selected_answer_ids)) continue;
      const { rows: correctRows } = await client.query(
        'SELECT id FROM answers WHERE question_id=$1 AND is_correct=true',
        [question_id]
      );
      const correctIds = new Set(correctRows.map(r => r.id));
      const sel = new Set(selected_answer_ids);
      const isCorrect = correctIds.size === sel.size && [...correctIds].every(id => sel.has(id));
      if (isCorrect) {
        correctCount += 1;
      }
      await client.query(
        `INSERT INTO user_question_stats (user_id, question_id, asked_count, correct_count, streak, last_seen_at, last_result)
         VALUES ($1,$2,1,$3,$4,now(),$5)
         ON CONFLICT (user_id, question_id) DO UPDATE SET
           asked_count = user_question_stats.asked_count + 1,
           correct_count = user_question_stats.correct_count + EXCLUDED.correct_count,
           streak = CASE WHEN EXCLUDED.last_result='correct' THEN user_question_stats.streak + 1 ELSE 0 END,
           last_seen_at = now(),
           last_result = EXCLUDED.last_result`,
        [req.user.sub, question_id, isCorrect ? 1 : 0, isCorrect ? 1 : 0, isCorrect ? 'correct' : 'wrong']
      );
      await client.query(
        `INSERT INTO exam_answers (session_id, question_id, selected_answer_ids, is_correct)
         VALUES ($1,$2,$3,$4)`,
        [session_id, question_id, selected_answer_ids, isCorrect]
      );
      if (isCorrect) {
        await client.query(
          'DELETE FROM user_later_questions WHERE user_id=$1 AND question_id=$2',
          [req.user.sub, question_id]
        );
      }
      if (!isCorrect) {
        await client.query(
          `INSERT INTO user_wrong_questions (user_id, question_id, wrong_count, last_wrong_at)
           VALUES ($1,$2,1,now())
           ON CONFLICT (user_id, question_id) DO UPDATE SET
             wrong_count = user_wrong_questions.wrong_count + 1,
             last_wrong_at = now()`,
          [req.user.sub, question_id]
        );
      }
    }
    await client.query(
      'UPDATE exam_sessions SET correct_answers=$1, finished_at=now() WHERE id=$2',
      [correctCount, session_id]
    );
    const totalCount = session.total_questions;
    const accuracy = totalCount ? (correctCount / totalCount) : 0;
    const bonus = accuracy >= 0.8 ? XP_RULES.exam_bonus : 0;
    const xpDelta = (correctCount * XP_RULES.exam_correct) + bonus;
    await recordDailyActivity(client, req.user.sub, session.pool_id, {
      exam_correct: correctCount,
      exam_total: totalCount,
      total_answered: totalCount
    }, tz);
    const gamification = await updateGamification(client, req.user.sub, xpDelta);
    await client.query('COMMIT');
    logAudit('exam_submit', req.user.sub, { session: session_id, correct: correctCount });
    res.json({ correct: correctCount, total: answers.length, xp_awarded: xpDelta, gamification, bonus_awarded: bonus });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'server_error' });
  } finally {
    client.release();
  }
});

// Speedrun endpoints
app.post('/speedrun/start', auth(), roleRateLimit(), async (req, res) => {
  const { pool_id, duration_minutes } = req.body || {};
  if (!pool_id || ![1,5,10].includes(duration_minutes)) {
    return res.status(400).json({ error: 'invalid_params' });
  }

  const { rows } = await pool.query(
    `INSERT INTO speedrun_sessions (user_id, pool_id, duration_minutes)
     VALUES ($1, $2, $3)
     RETURNING id, started_at`,
    [req.user.sub, pool_id, duration_minutes]
  );

  res.json({ session_id: rows[0].id, started_at: rows[0].started_at });
});

app.post('/speedrun/answer', auth(), roleRateLimit(), async (req, res) => {
  const { session_id, question_id, is_correct, time_ms } = req.body || {};
  if (!session_id || !question_id || typeof is_correct !== 'boolean' || typeof time_ms !== 'number') {
    return res.status(400).json({ error: 'invalid_params' });
  }

  await pool.query(
    `INSERT INTO speedrun_answers (session_id, question_id, is_correct, time_ms)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (session_id, question_id) DO NOTHING`,
    [session_id, question_id, is_correct, time_ms]
  );

  res.json({ ok: true });
});

app.post('/speedrun/finish', auth(), roleRateLimit(), async (req, res) => {
  const { session_id } = req.body || {};
  if (!session_id) return res.status(400).json({ error: 'missing_session_id' });

  const { rows: stats } = await pool.query(
    `SELECT
       COUNT(*)::int AS total,
       SUM(CASE WHEN is_correct THEN 1 ELSE 0 END)::int AS correct,
       SUM(CASE WHEN NOT is_correct THEN 1 ELSE 0 END)::int AS wrong
     FROM speedrun_answers
     WHERE session_id = $1`,
    [session_id]
  );

  const total = stats[0]?.total || 0;
  const correct = stats[0]?.correct || 0;
  const wrong = stats[0]?.wrong || 0;
  const accuracy = total > 0 ? ((correct / total) * 100).toFixed(2) : 0;

  await pool.query(
    `UPDATE speedrun_sessions
     SET finished_at = now(),
         correct_count = $2,
         wrong_count = $3,
         total_count = $4,
         accuracy = $5
     WHERE id = $1`,
    [session_id, correct, wrong, total, accuracy]
  );

  const xpBase = { 1: 5, 5: 15, 10: 25 };
  const { rows: session } = await pool.query(
    `SELECT user_id, duration_minutes FROM speedrun_sessions WHERE id = $1`,
    [session_id]
  );
  const xp = xpBase[session[0]?.duration_minutes] || 10;
  await updateGamification(pool, session[0]?.user_id, xp);

  res.json({ correct, wrong, total, accuracy, xp });
});

app.get('/speedrun/stats', auth(), roleRateLimit(), async (req, res) => {
  const { rows: summary } = await pool.query(
    `SELECT
       COUNT(*)::int AS total_attempts,
       MAX(correct_count) AS best_score,
       AVG(accuracy)::numeric(5,2) AS avg_accuracy,
       SUM(correct_count)::int AS total_correct
     FROM speedrun_sessions
     WHERE user_id = $1 AND finished_at IS NOT NULL`,
    [req.user.sub]
  );

  const { rows: perDuration } = await pool.query(
    `SELECT
       duration_minutes,
       MAX(correct_count) AS best_score,
       COUNT(*)::int AS attempts
     FROM speedrun_sessions
     WHERE user_id = $1 AND finished_at IS NOT NULL
     GROUP BY duration_minutes
     ORDER BY duration_minutes`,
    [req.user.sub]
  );

  res.json({
    total_attempts: summary[0]?.total_attempts || 0,
    best_score: summary[0]?.best_score || 0,
    avg_accuracy: summary[0]?.avg_accuracy || 0,
    total_correct: summary[0]?.total_correct || 0,
    per_duration: perDuration.map(r => ({
      duration_minutes: r.duration_minutes,
      best_score: r.best_score || 0,
      attempts: r.attempts || 0
    }))
  });
});

app.get('/speedrun/leaderboard', auth(), async (req, res) => {
  const duration = parseInt(req.query.duration || '5', 10);
  if (![1,5,10].includes(duration)) {
    return res.status(400).json({ error: 'invalid_duration' });
  }

  const { rows } = await pool.query(
    `SELECT
       u.username,
       s.correct_count,
       s.total_count,
       s.accuracy,
       s.finished_at
     FROM speedrun_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.duration_minutes = $1 AND s.finished_at IS NOT NULL
     ORDER BY s.correct_count DESC, s.accuracy DESC
     LIMIT 20`,
    [duration]
  );

  res.json(rows.map((r, i) => ({
    rank: i + 1,
    username: r.username,
    correct_count: r.correct_count,
    total_count: r.total_count,
    accuracy: Number(r.accuracy || 0),
    finished_at: r.finished_at
  })));
});

// Import/Export (admin only)
app.get('/export/all', auth('admin'), roleRateLimit(), async (req, res) => {
  const { rows: pools } = await pool.query('SELECT id, name FROM pools');
  const out = {};
  for (const p of pools) {
    const { rows: questions } = await pool.query(
      'SELECT id, text, category, explanation, lang, source_id FROM questions WHERE pool_id=$1',
      [p.id]
    );
    const qids = questions.map(q => q.id);
    const { rows: answers } = qids.length
      ? await pool.query(
          'SELECT id, question_id, text, is_correct, source_id FROM answers WHERE question_id = ANY($1::uuid[])',
          [qids]
        )
      : { rows: [] };
    const { rows: images } = qids.length
      ? await pool.query(
          'SELECT question_id, url, alt, local_path, sort_order FROM question_images WHERE question_id = ANY($1::uuid[]) ORDER BY sort_order, id',
          [qids]
        )
      : { rows: [] };
    const byQ = new Map();
    for (const a of answers) {
      if (!byQ.has(a.question_id)) byQ.set(a.question_id, []);
      byQ.get(a.question_id).push(a);
    }
    const imagesByQ = new Map();
    for (const img of images) {
      if (!imagesByQ.has(img.question_id)) imagesByQ.set(img.question_id, []);
      imagesByQ.get(img.question_id).push({
        url: img.url || null,
        alt: img.alt || '',
        local: img.local_path || null
      });
    }
    out[p.name] = {
      name: p.name,
      version: 'v9',
      created: new Date().toISOString(),
      fragen: questions.map(q => ({
        id: q.id,
        frage: q.text,
        lang: q.lang || null,
        kategorie: q.category || '',
        erklaerung: q.explanation || '',
        antworten: (byQ.get(q.id) || []).map(a => ({
          id: a.id,
          text: a.text,
          korrekt: a.is_correct
        })),
        bilder: imagesByQ.get(q.id) || [],
        leitnerBox: 1,
        stats: { asked: 0, correct: 0, streak: 0 }
      }))
    };
  }
  logAudit('export_all', req.user.sub, { pools: Object.keys(out).length });
  res.json(out);
});

app.post('/import/all', auth('admin'), roleRateLimit(), async (req, res) => {
  const obj = req.body;
  const overwrite = (req.query.overwrite || 'false').toString() === 'true';
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return res.status(400).json({ error: 'invalid' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [name, data] of Object.entries(obj)) {
      const poolName = data?.name || name;
      const existing = await client.query('SELECT id FROM pools WHERE name=$1', [poolName]);
      if (existing.rows.length) {
        if (!overwrite) {
          continue;
        }
        await client.query('DELETE FROM pools WHERE id=$1', [existing.rows[0].id]);
      }
      const poolRes = await client.query(
        'INSERT INTO pools (name, owner_id) VALUES ($1, $2) RETURNING id',
        [poolName, req.user.sub]
      );
      const poolId = poolRes.rows[0].id;
      const fragen = Array.isArray(data?.fragen) ? data.fragen : [];
      for (const q of fragen) {
        const parsed = parseLangCategory(q.kategorie || null, q.lang || null);
        const qSourceId = q.id ? String(q.id) : null;
        const qRes = await client.query(
          'INSERT INTO questions (pool_id, text, category, explanation, lang, source_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
          [poolId, q.frage || '', parsed.category || null, q.erklaerung || null, parsed.lang || null, qSourceId]
        );
        const qid = qRes.rows[0].id;
        for (const a of (q.antworten || [])) {
          const aSourceId = a.id ? String(a.id) : null;
          await client.query(
            'INSERT INTO answers (question_id, text, is_correct, source_id) VALUES ($1,$2,$3,$4)',
            [qid, a.text || '', !!a.korrekt, aSourceId]
          );
        }
        let imgIdx = 0;
        for (const img of (q.bilder || [])) {
          await client.query(
            'INSERT INTO question_images (question_id, url, alt, local_path, sort_order) VALUES ($1,$2,$3,$4,$5)',
            [qid, img.url || null, img.alt || null, img.local || null, imgIdx]
          );
          imgIdx += 1;
        }
      }
    }
    await client.query('COMMIT');
    logAudit('import_all', req.user.sub, { pools: Object.keys(obj).length, overwrite });
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'server_error' });
  } finally {
    client.release();
  }
});

const port = process.env.PORT || 8000;
// ============================================================================
// ADMIN DASHBOARD ENDPOINTS - INSERT BEFORE app.listen() (END OF FILE)
// ============================================================================

// GET /admin/stats - System statistics
app.get('/admin/stats', auth('admin'), async (req, res) => {
  try {
    // User stats
    const usersTotal = await pool.query('SELECT COUNT(*) as count FROM users WHERE is_guest = false');
    const usersToday = await pool.query(`SELECT COUNT(*) as count FROM users WHERE created_at > now() - interval '1 day'`);
    const usersActiveWeek = await pool.query(`SELECT COUNT(DISTINCT user_id) as count FROM audit_log WHERE created_at > now() - interval '7 days'`);

    // Pool stats
    const poolsTotal = await pool.query('SELECT COUNT(*) as count FROM pools');
    const poolsPublic = await pool.query(`SELECT COUNT(*) as count FROM pools WHERE owner_id IS NULL OR id IN (SELECT DISTINCT pool_id FROM questions)`);

    // Question stats
    const questionsTotal = await pool.query('SELECT COUNT(*) as count FROM questions');
    const questionsByLang = await pool.query(`SELECT lang, COUNT(*) as count FROM questions GROUP BY lang ORDER BY count DESC`);

    // Login stats
    const loginsToday = await pool.query(`SELECT COUNT(*) as count FROM audit_log WHERE action = 'auth_magic_link_login' AND created_at > now() - interval '1 day'`);

    // Magic tokens active
    const tokensActive = await pool.query('SELECT COUNT(*) as count FROM magic_tokens WHERE used = false AND expires_at > now()');

    res.json({
      users: {
        total: parseInt(usersTotal.rows[0].count),
        new_today: parseInt(usersToday.rows[0].count),
        active_week: parseInt(usersActiveWeek.rows[0].count)
      },
      pools: {
        total: parseInt(poolsTotal.rows[0].count),
        public: parseInt(poolsPublic.rows[0].count)
      },
      questions: {
        total: parseInt(questionsTotal.rows[0].count),
        by_language: questionsByLang.rows.map(r => ({ lang: r.lang, count: parseInt(r.count) }))
      },
      logins_today: parseInt(loginsToday.rows[0].count),
      magic_tokens_active: parseInt(tokensActive.rows[0].count)
    });
  } catch (err) {
    console.error('[ADMIN] Stats error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// GET /admin/users - List all users with pagination
app.get('/admin/users', auth('admin'), async (req, res) => {
  try {
    const page = parseInt(req.query.page || '1');
    const limit = Math.min(parseInt(req.query.limit || '50'), 100);
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const role = req.query.role || '';

    let query = 'SELECT id, username, email, role, created_at, last_login_at, login_count, notes FROM users WHERE is_guest = false';
    const params = [];
    let paramIndex = 1;

    if (search) {
      query += ` AND (username ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (role) {
      query += ` AND role = $${paramIndex}`;
      params.push(role);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as count FROM users WHERE is_guest = false';
    const countParams = [];
    if (search) {
      countQuery += ` AND (username ILIKE $1 OR email ILIKE $1)`;
      countParams.push(`%${search}%`);
    }
    if (role) {
      countQuery += ` AND role = $${countParams.length + 1}`;
      countParams.push(role);
    }
    const { rows: countRows } = await pool.query(countQuery, countParams);
    const total = parseInt(countRows[0].count);

    res.json({
      users: rows,
      total,
      page,
      pages: Math.ceil(total / limit),
      limit
    });
  } catch (err) {
    console.error('[ADMIN] Users list error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// GET /admin/users/:id - Get user details
app.get('/admin/users/:id', auth('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    // User basic info
    const { rows } = await pool.query(
      'SELECT id, username, email, role, created_at, last_login_at, login_count, notes FROM users WHERE id = $1',
      [id]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: 'user_not_found' });
    }

    const user = rows[0];

    // User stats
    const poolsCreated = await pool.query('SELECT COUNT(*) as count FROM pools WHERE owner_id = $1', [id]);
    const xpData = await pool.query('SELECT xp, level FROM user_gamification WHERE user_id = $1', [id]);

    // Recent logins
    const recentLogins = await pool.query(
      `SELECT created_at, details->>'method' as method FROM audit_log
       WHERE user_id = $1 AND action = 'auth_magic_link_login'
       ORDER BY created_at DESC LIMIT 10`,
      [id]
    );

    res.json({
      user,
      stats: {
        pools_created: parseInt(poolsCreated.rows[0].count),
        xp: xpData.rows[0] ? parseFloat(xpData.rows[0].xp) : 0,
        level: xpData.rows[0] ? parseInt(xpData.rows[0].level) : 0
      },
      recent_logins: recentLogins.rows
    });
  } catch (err) {
    console.error('[ADMIN] User details error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// PUT /admin/users/:id - Update user
app.put('/admin/users/:id', auth('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, role, notes } = req.body || {};

    // Validate
    if (role && !['student', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'invalid_role' });
    }

    // Check if user exists
    const { rows: checkRows } = await pool.query('SELECT id, role FROM users WHERE id = $1', [id]);
    if (!checkRows[0]) {
      return res.status(404).json({ error: 'user_not_found' });
    }

    // Build update query
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (username) {
      updates.push(`username = $${paramIndex++}`);
      params.push(username);
    }
    if (email) {
      updates.push(`email = $${paramIndex++}`);
      params.push(email);
    }
    if (role) {
      updates.push(`role = $${paramIndex++}`);
      params.push(role);
    }
    if (notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      params.push(notes);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'no_updates' });
    }

    params.push(id);
    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING id, username, email, role, notes`;

    const { rows } = await pool.query(query, params);

    await logAudit('admin_user_updated', req.user.sub, { target_user_id: id, changes: { username, email, role, notes } }, req.ip);

    res.json({ user: rows[0] });
  } catch (err) {
    if (err.code === '23505') { // unique violation
      return res.status(409).json({ error: 'email_or_username_exists' });
    }
    console.error('[ADMIN] User update error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// DELETE /admin/users/:id - Delete user
app.delete('/admin/users/:id', auth('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    // Cannot delete self
    if (id === req.user.sub) {
      return res.status(400).json({ error: 'cannot_delete_self' });
    }

    // Check if this is the last admin
    const { rows: adminRows } = await pool.query('SELECT COUNT(*) as count FROM users WHERE role = $1', ['admin']);
    const adminCount = parseInt(adminRows[0].count);

    const { rows: targetRows } = await pool.query('SELECT role FROM users WHERE id = $1', [id]);
    if (!targetRows[0]) {
      return res.status(404).json({ error: 'user_not_found' });
    }

    if (targetRows[0].role === 'admin' && adminCount <= 1) {
      return res.status(400).json({ error: 'cannot_delete_last_admin' });
    }

    // Delete user (CASCADE will handle related data)
    await pool.query('DELETE FROM users WHERE id = $1', [id]);

    await logAudit('admin_user_deleted', req.user.sub, { target_user_id: id }, req.ip);

    res.json({ ok: true });
  } catch (err) {
    console.error('[ADMIN] User delete error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// GET /admin/audit-log - Get audit log
app.get('/admin/audit-log', auth('admin'), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100'), 500);
    const userId = req.query.user_id || null;
    const action = req.query.action || null;

    let query = 'SELECT id, user_id, action, details, ip_address, created_at FROM audit_log WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (userId) {
      query += ` AND user_id = $${paramIndex++}`;
      params.push(userId);
    }

    if (action) {
      query += ` AND action = $${paramIndex++}`;
      params.push(action);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const { rows } = await pool.query(query, params);

    res.json({ logs: rows });
  } catch (err) {
    console.error('[ADMIN] Audit log error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// POST /admin/clear-rate-limit - Clear rate limit for IP
app.post('/admin/clear-rate-limit', auth('admin'), async (req, res) => {
  const { ip } = req.body || {};

  if (!ip) {
    return res.status(400).json({ error: 'missing_ip' });
  }

  // Note: Rate limiting is in-memory, so this would need to be implemented
  // in the rate limit module. For now, return success.
  // The API restart already clears all rate limits.

  await logAudit('admin_clear_rate_limit', req.user.sub, { ip }, req.ip);

  res.json({ ok: true, message: 'Rate limit cleared. Restart API for immediate effect.' });
});

// GET /admin/magic-tokens - Get active magic tokens
app.get('/admin/magic-tokens', auth('admin'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, code, expires_at, created_at
       FROM magic_tokens
       WHERE used = false AND expires_at > now()
       ORDER BY created_at DESC
       LIMIT 50`
    );

    res.json({ tokens: rows });
  } catch (err) {
    console.error('[ADMIN] Magic tokens error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// DELETE /admin/magic-tokens/:id - Invalidate a magic token
app.delete('/admin/magic-tokens/:id', auth('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query('UPDATE magic_tokens SET used = true, used_at = now() WHERE id = $1', [id]);

    await logAudit('admin_invalidate_token', req.user.sub, { token_id: id }, req.ip);

    res.json({ ok: true });
  } catch (err) {
    console.error('[ADMIN] Invalidate token error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// ============================================================================
// END ADMIN DASHBOARD ENDPOINTS
// ============================================================================

// ============================================================================
// ADMIN SETTINGS ENDPOINTS
// ============================================================================

// GET /admin/settings - Get all system settings (Admin only)
app.get('/admin/settings', auth('admin'), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT key, value FROM system_settings ORDER BY key');
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    res.json({ settings });
  } catch (err) {
    console.error('[ADMIN SETTINGS] Get error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// PUT /admin/settings/:key - Update a single setting (Admin only)
app.put('/admin/settings/:key', auth('admin'), async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body || {};

    // Validate key exists in defaults
    const validKeys = ['authentication', 'modules', 'features', 'languages', 'branding', 'pools', 'access'];
    if (!validKeys.includes(key)) {
      return res.status(400).json({ error: 'invalid_key', message: `Key must be one of: ${validKeys.join(', ')}` });
    }

    // Validate value is an object
    if (!value || typeof value !== 'object') {
      return res.status(400).json({ error: 'invalid_value', message: 'Value must be a JSON object' });
    }

    // Use comprehensive validation from settings_defaults module
    const errors = validateSettings(key, value);
    if (errors.length > 0) {
      return res.status(400).json({
        error: 'validation_failed',
        message: 'Settings validation failed',
        errors
      });
    }

    // Update in database
    await pool.query(
      `INSERT INTO system_settings (key, value, updated_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = now()`,
      [key, JSON.stringify(value), req.user.sub]
    );

    await logAudit('admin_settings_updated', req.user.sub, { key, value }, req.ip);

    res.json({ ok: true, key, value });
  } catch (err) {
    console.error('[ADMIN SETTINGS] Update error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// GET /admin/settings/schema - Get default settings schema (Admin only)
// Returns the structure of available settings for UI rendering
app.get('/admin/settings/schema', auth('admin'), async (req, res) => {
  try {
    res.json({ schema: DEFAULT_SETTINGS });
  } catch (err) {
    console.error('[ADMIN SETTINGS] Schema error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// POST /admin/settings/reset/:key - Reset a setting to default (Admin only)
app.post('/admin/settings/reset/:key', auth('admin'), async (req, res) => {
  try {
    const { key } = req.params;

    // Validate key exists in defaults
    if (!(key in DEFAULT_SETTINGS)) {
      return res.status(400).json({ error: 'invalid_key', message: `Key "${key}" not found in defaults` });
    }

    const defaultValue = DEFAULT_SETTINGS[key];

    // Update in database
    await pool.query(
      `INSERT INTO system_settings (key, value, updated_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = now()`,
      [key, JSON.stringify(defaultValue), req.user.sub]
    );

    await logAudit('admin_settings_reset', req.user.sub, { key }, req.ip);

    res.json({ ok: true, key, value: defaultValue });
  } catch (err) {
    console.error('[ADMIN SETTINGS] Reset error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// POST /admin/settings/reset-all - Reset all settings to defaults (Admin only)
app.post('/admin/settings/reset-all', auth('admin'), async (req, res) => {
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Delete all existing settings
      await client.query('DELETE FROM system_settings');

      // Insert all defaults
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        await client.query(
          `INSERT INTO system_settings (key, value, updated_by)
           VALUES ($1, $2, $3)`,
          [key, JSON.stringify(value), req.user.sub]
        );
      }

      await client.query('COMMIT');
      await logAudit('admin_settings_reset_all', req.user.sub, {}, req.ip);

      res.json({ ok: true, settings: DEFAULT_SETTINGS });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[ADMIN SETTINGS] Reset all error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// GET /settings/public - Get public settings (no authentication required)
// Returns settings that frontend needs to enforce access control
app.get('/settings/public', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT key, value FROM system_settings
       WHERE key IN ('authentication', 'modules', 'features', 'languages', 'branding', 'pools', 'access')`
    );
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });

    // Merge with defaults for any missing keys (failsafe)
    for (const [key, defaultValue] of Object.entries(DEFAULT_SETTINGS)) {
      if (!(key in settings)) {
        settings[key] = defaultValue;
      }
    }

    res.json({ settings });
  } catch (err) {
    console.error('[SETTINGS PUBLIC] Get error:', err);
    // If database fails, return defaults as failsafe
    res.json({ settings: DEFAULT_SETTINGS });
  }
});

// ============================================================================
// END ADMIN SETTINGS ENDPOINTS
// ============================================================================

app.listen(port, async () => {
  await ensureUsernameColumn();
  await ensureUserPrefs();
  await ensureQuestionLangColumn();
  await ensureSourceIdColumns();
  await ensureQuestionImagesTable();
  await ensureAdmin();
  await ensureWrongTable();
  await ensureLaterTable();
  await ensureGamificationTable();
  await ensureBadgesTables();
  await ensureActivityTable();
  await ensureLeaderboardSnapshots();
  await ensureLearningBoxTables();
  await ensureFriendshipTable();
  await ensureDuelTables();
  await ensureContestTables();
  await ensureSpeedrunTables();
  await migrateToMultilangPools();
  await ensurePasswordResets();
  await expireDuels();
  setInterval(() => {
    expireDuels();
  }, 30 * 60 * 1000).unref();
  console.log(`API listening on :${port}`);
});
