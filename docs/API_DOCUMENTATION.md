# API Documentation

Complete API reference for QuizDoji backend.

## 📋 Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Account & Profile](#account--profile)
- [Pools](#pools)
- [Questions](#questions)
- [Training Mode](#training-mode)
- [Swipe Mode](#swipe-mode)
- [Exam Mode](#exam-mode)
- [Leitner System](#leitner-system)
- [Gamification](#gamification)
- [Friendships](#friendships)
- [Duels](#duels)
- [Leaderboards](#leaderboards)
- [Error Handling](#error-handling)

---

## 🌐 Overview

**Base URL:** `http://localhost:8000` (development)
**Protocol:** REST API with JSON
**Authentication:** JWT Bearer tokens

### Common Headers

```http
Content-Type: application/json
Authorization: Bearer <access_token>
```

### Response Format

**Success:**
```json
{
  "data": { ... }
}
```

**Error:**
```json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

### HTTP Status Codes

- `200 OK` - Success
- `201 Created` - Resource created
- `400 Bad Request` - Validation error
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource doesn't exist
- `409 Conflict` - Duplicate resource
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

---

## 🔐 Authentication

### POST /auth/register

Register a new user account.

**Request:**
```json
{
  "username": "alice",
  "email": "alice@example.com",
  "password": "securepass123"
}
```

**Response:** `201 Created`
```json
{
  "access_token": "eyJhbGc...",
  "user": {
    "id": "uuid",
    "username": "alice",
    "email": "alice@example.com",
    "role": "student",
    "display_name": null,
    "leaderboard_opt_in": true,
    "created_at": "2026-02-08T10:00:00Z"
  }
}
```

**Errors:**
- `409` - Email or username already exists
- `400` - Invalid email format or weak password

**Notes:**
- Sets `refresh_token` in httpOnly cookie
- Password must be 8+ characters

---

### POST /auth/login

Login with email and password.

**Rate Limit:** 5 attempts per 15 minutes per IP

**Request:**
```json
{
  "email": "alice@example.com",
  "password": "securepass123"
}
```

**Response:** `200 OK`
```json
{
  "access_token": "eyJhbGc...",
  "user": {
    "id": "uuid",
    "username": "alice",
    "email": "alice@example.com",
    "role": "student"
  }
}
```

**Errors:**
- `401` - Invalid credentials
- `429` - Too many login attempts

---

### POST /auth/refresh

Refresh access token using refresh cookie.

**Request:** (No body, refresh token in cookie)

**Response:** `200 OK`
```json
{
  "access_token": "eyJhbGc..."
}
```

**Errors:**
- `401` - Invalid or expired refresh token

**Notes:**
- Refresh token must be in httpOnly cookie
- New access token valid for 1 hour

---

### POST /auth/logout

Logout and clear refresh cookie.

**Request:** (No body)

**Response:** `200 OK`
```json
{
  "message": "Logged out"
}
```

---

### GET /auth/me

Get current user info.

**Auth Required:** Yes

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "username": "alice",
  "email": "alice@example.com",
  "role": "student",
  "display_name": "Alice",
  "leaderboard_opt_in": true
}
```

---

## 👤 Account & Profile

### PUT /account/leaderboard

Update leaderboard opt-in preference.

**Auth Required:** Yes

**Request:**
```json
{
  "leaderboard_opt_in": false
}
```

**Response:** `200 OK`
```json
{
  "message": "Leaderboard preference updated"
}
```

---

### GET /account/stats

Get persistent account statistics.

**Auth Required:** Yes

**Response:** `200 OK`
```json
{
  "total": {
    "questions_answered": 1234,
    "correct_answers": 980,
    "accuracy": 79.4,
    "training_sessions": 45,
    "exams_taken": 12,
    "duels_won": 8,
    "duels_lost": 5,
    "xp": 12500,
    "level": 15
  },
  "pools": [
    {
      "pool_id": "uuid",
      "pool_name": "CompTIA A+",
      "questions_answered": 456,
      "correct_count": 380,
      "accuracy": 83.3
    }
  ],
  "first_activity": "2025-12-01T10:00:00Z"
}
```

---

## 📚 Pools

### GET /pools

Get all pools accessible to user.

**Auth Required:** Yes

**Response:** `200 OK`
```json
[
  {
    "id": "uuid",
    "name": "CompTIA A+ Core 1",
    "owner_id": "uuid",
    "created_at": "2026-01-01T00:00:00Z",
    "updated_at": "2026-01-05T00:00:00Z",
    "question_count": 250,
    "can_edit": true
  }
]
```

**Notes:**
- `can_edit` is `true` if user is owner or admin

---

### POST /pools

Create a new pool.

**Auth Required:** Yes

**Request:**
```json
{
  "name": "My Custom Pool"
}
```

**Response:** `201 Created`
```json
{
  "id": "uuid",
  "name": "My Custom Pool",
  "owner_id": "user-uuid",
  "created_at": "2026-02-08T10:00:00Z"
}
```

---

### PUT /pools/:id

Update pool name.

**Auth Required:** Yes (must be owner or admin)

**Request:**
```json
{
  "name": "Updated Pool Name"
}
```

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "name": "Updated Pool Name",
  "updated_at": "2026-02-08T10:05:00Z"
}
```

**Errors:**
- `403` - Not authorized to edit this pool
- `404` - Pool not found

---

### DELETE /pools/:id

Delete a pool.

**Auth Required:** Yes (must be owner or admin)

**Response:** `200 OK`
```json
{
  "message": "Pool deleted"
}
```

**Errors:**
- `403` - Not authorized to delete this pool
- `404` - Pool not found

**Notes:**
- Cascades: All questions, answers, exams, etc. are also deleted

---

### GET /pools/:id/questions

Get all questions in a pool.

**Auth Required:** Yes

**Query Parameters:**
- `lang` (optional) - Filter by language (`de`, `en`, `ru`)

**Response:** `200 OK`
```json
{
  "pool": {
    "id": "uuid",
    "name": "CompTIA A+"
  },
  "questions": [
    {
      "id": "uuid",
      "text": "What is TCP/IP?",
      "lang": "en",
      "source_id": "q1",
      "explanation": "TCP/IP is...",
      "answers": [
        {
          "id": "uuid",
          "text": "Internet Protocol",
          "is_correct": true
        },
        {
          "id": "uuid",
          "text": "Wrong answer",
          "is_correct": false
        }
      ],
      "images": []
    }
  ]
}
```

---

### GET /pools/:id/langs

Get available languages in pool.

**Auth Required:** Yes

**Response:** `200 OK`
```json
{
  "langs": ["de", "en", "ru"]
}
```

---

### POST /pools/:id/import/json

Import questions from JSON file.

**Auth Required:** Yes (must have edit permissions)
**Rate Limit:** 10 requests per 15 minutes

**Request:**
```json
{
  "meta": {
    "name": "Pool Name",
    "license": "CC0"
  },
  "questions": [
    {
      "id": "q1",
      "text": "Question?",
      "lang": "en",
      "source_id": "q1",
      "explanation": "...",
      "answers": [
        {"id": "a1", "text": "Answer", "correct": true}
      ]
    }
  ]
}
```

**Response:** `201 Created`
```json
{
  "message": "Imported 45 questions",
  "imported_count": 45
}
```

**Errors:**
- `400` - Invalid JSON format
- `403` - Not authorized to import

**Notes:**
- See [DATASET_FORMAT.md](DATASET_FORMAT.md) for full format spec

---

## ❓ Questions

### GET /questions/:id/translation

Get translations of a question.

**Auth Required:** Yes

**Response:** `200 OK`
```json
{
  "question_id": "uuid",
  "source_id": "q1",
  "translations": [
    {
      "id": "uuid",
      "lang": "de",
      "text": "Was ist TCP/IP?"
    },
    {
      "id": "uuid",
      "lang": "en",
      "text": "What is TCP/IP?"
    },
    {
      "id": "uuid",
      "lang": "ru",
      "text": "Что такое TCP/IP?"
    }
  ]
}
```

---

### POST /pools/:id/questions

Add a question to pool.

**Auth Required:** Yes (must have edit permissions)

**Request:**
```json
{
  "text": "What is RAM?",
  "lang": "en",
  "source_id": "q-new",
  "explanation": "Random Access Memory",
  "answers": [
    {"text": "Memory", "is_correct": true},
    {"text": "Storage", "is_correct": false}
  ]
}
```

**Response:** `201 Created`
```json
{
  "id": "uuid",
  "text": "What is RAM?",
  "created_at": "2026-02-08T10:00:00Z"
}
```

---

## 🎓 Training Mode

### POST /training/answer

Submit an answer in training mode.

**Auth Required:** Yes
**Rate Limit:** 100 requests per 15 minutes per user

**Request:**
```json
{
  "pool_id": "uuid",
  "question_id": "uuid",
  "selected_answer_ids": ["answer-uuid-1", "answer-uuid-2"],
  "box": null
}
```

**Response:** `200 OK`
```json
{
  "correct": true,
  "message": "Correct!",
  "xp_awarded": 10,
  "explanation": "TCP/IP is the Internet Protocol..."
}
```

**Notes:**
- `box` is optional, used for Leitner integration
- Updates `user_question_stats`
- Awards XP for correct answers
- Records in `daily_activity`

---

## 💳 Swipe Mode

### POST /swipe/answer

Submit an answer in swipe mode (binary True/False quiz).

**Auth Required:** Yes
**Rate Limit:** 100 requests per 15 minutes per user

**Request:**
```json
{
  "pool_id": "uuid",
  "question_id": "uuid",
  "selected_answer_ids": ["answer-uuid"],
  "time_ms": 1234
}
```

**Response:** `200 OK`
```json
{
  "correct": true,
  "xp_awarded": 5,
  "correct_answer_id": "answer-uuid"
}
```

**Notes:**
- Swipe mode questions have exactly 2 answers (True/False)
- Faster answers may award bonus XP (future feature)
- Updates daily activity

---

## 📝 Exam Mode

### POST /exams

Start a new exam session.

**Auth Required:** Yes

**Request:**
```json
{
  "pool_id": "uuid",
  "question_count": 30,
  "time_limit_minutes": 60
}
```

**Response:** `201 Created`
```json
{
  "session_id": "uuid",
  "pool_id": "uuid",
  "questions": [
    {
      "id": "uuid",
      "text": "What is TCP/IP?",
      "answers": [
        {"id": "uuid", "text": "Protocol"},
        {"id": "uuid", "text": "Hardware"}
      ]
    }
  ],
  "started_at": "2026-02-08T10:00:00Z"
}
```

---

### POST /exams/:id/answer

Submit answer during exam.

**Auth Required:** Yes

**Request:**
```json
{
  "question_id": "uuid",
  "selected_answer_ids": ["answer-uuid"]
}
```

**Response:** `200 OK`
```json
{
  "message": "Answer recorded"
}
```

**Notes:**
- Answer correctness not revealed until exam finished

---

### POST /exams/:id/finish

Finish exam and get results.

**Auth Required:** Yes

**Response:** `200 OK`
```json
{
  "session_id": "uuid",
  "total_questions": 30,
  "correct_answers": 24,
  "score_percentage": 80,
  "passed": true,
  "time_taken_minutes": 45,
  "xp_awarded": 120,
  "detailed_results": [
    {
      "question_id": "uuid",
      "correct": true,
      "selected": ["uuid"],
      "correct_answers": ["uuid"]
    }
  ]
}
```

---

### GET /exams

Get user's exam history.

**Auth Required:** Yes

**Response:** `200 OK`
```json
[
  {
    "id": "uuid",
    "pool_id": "uuid",
    "pool_name": "CompTIA A+",
    "total_questions": 30,
    "correct_answers": 24,
    "score": 80,
    "started_at": "2026-02-08T10:00:00Z",
    "finished_at": "2026-02-08T10:45:00Z"
  }
]
```

---

## 📦 Leitner System

### GET /leitner/sets

Get user's Leitner learning sets.

**Auth Required:** Yes

**Response:** `200 OK`
```json
[
  {
    "id": "uuid",
    "name": "My Set",
    "pool_id": "uuid",
    "pool_name": "CompTIA A+",
    "mode": "classic",
    "item_count": 45,
    "due_count": 12,
    "created_at": "2026-01-01T00:00:00Z"
  }
]
```

**Notes:**
- `due_count` only relevant for `mode: "classic"`
- `mode: "simple"` has no due dates

---

### POST /leitner/sets

Create a new Leitner set.

**Auth Required:** Yes

**Request:**
```json
{
  "name": "My Learning Set",
  "pool_id": "uuid",
  "mode": "classic"
}
```

**Response:** `201 Created`
```json
{
  "id": "uuid",
  "name": "My Learning Set",
  "pool_id": "uuid",
  "mode": "classic",
  "created_at": "2026-02-08T10:00:00Z"
}
```

**Errors:**
- `409` - Set with this name already exists for this pool

---

### DELETE /leitner/sets/:id

Delete a Leitner set.

**Auth Required:** Yes (must be owner)

**Response:** `200 OK`
```json
{
  "message": "Set deleted"
}
```

**Notes:**
- Cascades: All items in set are also deleted

---

### GET /leitner/all

Get all questions in a Leitner set with box status.

**Auth Required:** Yes

**Query Parameters:**
- `set_id` (required) - Set UUID
- `mode` (optional) - `simple` or `classic`

**Response:** `200 OK`
```json
{
  "questions": [
    {
      "question_id": "uuid",
      "text": "What is RAM?",
      "box": 3,
      "due_at": "2026-02-10T00:00:00Z"
    }
  ]
}
```

**Notes:**
- `due_at` is `null` for simple mode

---

### POST /leitner/answer

Answer a question in Leitner mode.

**Auth Required:** Yes

**Request:**
```json
{
  "set_id": "uuid",
  "question_id": "uuid",
  "selected_answer_ids": ["uuid"],
  "mode": "classic"
}
```

**Response:** `200 OK`
```json
{
  "correct": true,
  "new_box": 4,
  "next_due": "2026-02-16T00:00:00Z",
  "xp_awarded": 10
}
```

**Notes:**
- Correct → move to next box (max 5)
- Wrong → back to box 1
- Classic mode: Due dates calculated (1/2/5/8/14 days)

---

## 🏆 Gamification

### GET /gamification/me

Get current user's gamification stats.

**Auth Required:** Yes

**Response:** `200 OK`
```json
{
  "xp": 12500,
  "level": 15,
  "xp_to_next_level": 500,
  "badges": [
    {
      "key": "first_correct",
      "name_en": "First Steps",
      "earned_at": "2026-01-01T10:00:00Z"
    }
  ],
  "streak_days": 7
}
```

---

### GET /gamification/config

Get gamification configuration (levels, XP thresholds).

**Auth Required:** No

**Response:** `200 OK`
```json
{
  "levels": [
    {"level": 1, "xp_required": 0},
    {"level": 2, "xp_required": 100},
    {"level": 3, "xp_required": 250}
  ],
  "xp_rewards": {
    "correct_answer": 10,
    "exam_question": 20,
    "duel_win": 50
  }
}
```

---

## 👥 Friendships

### GET /friends/search

Search for users by username or display name.

**Auth Required:** Yes

**Query Parameters:**
- `q` (required) - Search query (min 2 characters)

**Response:** `200 OK`
```json
[
  {
    "id": "uuid",
    "username": "bob",
    "display_name": "Bob Smith",
    "is_friend": false
  }
]
```

---

### POST /friends/request

Send friend request.

**Auth Required:** Yes

**Request:**
```json
{
  "addressee_id": "user-uuid"
}
```

**Response:** `201 Created`
```json
{
  "id": "friendship-uuid",
  "status": "pending"
}
```

**Errors:**
- `409` - Request already exists
- `400` - Cannot friend yourself

---

### GET /friends

Get user's friends (accepted friendships).

**Auth Required:** Yes

**Response:** `200 OK`
```json
[
  {
    "id": "uuid",
    "username": "bob",
    "display_name": "Bob Smith"
  }
]
```

---

### GET /friends/pending

Get pending friend requests (received).

**Auth Required:** Yes

**Response:** `200 OK`
```json
[
  {
    "id": "friendship-uuid",
    "requester": {
      "id": "uuid",
      "username": "charlie",
      "display_name": "Charlie"
    },
    "created_at": "2026-02-07T10:00:00Z"
  }
]
```

---

### POST /friends/:id/accept

Accept friend request.

**Auth Required:** Yes

**Response:** `200 OK`
```json
{
  "message": "Friend request accepted"
}
```

---

### POST /friends/:id/decline

Decline friend request.

**Auth Required:** Yes

**Response:** `200 OK`
```json
{
  "message": "Friend request declined"
}
```

---

## ⚔️ Duels

### POST /duels

Create a new duel challenge.

**Auth Required:** Yes

**Request:**
```json
{
  "opponent_id": "user-uuid",
  "pool_id": "uuid",
  "question_count": 5,
  "is_open": false
}
```

**Response:** `201 Created`
```json
{
  "id": "duel-uuid",
  "challenger_id": "your-uuid",
  "opponent_id": "user-uuid",
  "pool_id": "uuid",
  "question_count": 5,
  "status": "waiting",
  "expires_at": "2026-02-09T10:00:00Z"
}
```

**Notes:**
- `is_open: true` creates open duel (any user can accept)
- `opponent_id` can be null for open duels
- Duels expire after 24 hours

---

### GET /duels

Get user's duels.

**Auth Required:** Yes

**Response:** `200 OK`
```json
[
  {
    "id": "uuid",
    "challenger": {
      "id": "uuid",
      "username": "alice"
    },
    "opponent": {
      "id": "uuid",
      "username": "bob"
    },
    "pool_name": "CompTIA A+",
    "status": "active",
    "my_score": 4,
    "opponent_score": 3,
    "created_at": "2026-02-08T10:00:00Z"
  }
]
```

---

### GET /duels/open

Get available open duels.

**Auth Required:** Yes

**Response:** `200 OK`
```json
[
  {
    "id": "uuid",
    "challenger": {
      "id": "uuid",
      "username": "alice"
    },
    "pool_name": "CompTIA A+",
    "question_count": 5,
    "created_at": "2026-02-08T10:00:00Z"
  }
]
```

---

### POST /duels/:id/accept

Accept a duel invitation.

**Auth Required:** Yes

**Response:** `200 OK`
```json
{
  "id": "duel-uuid",
  "status": "active",
  "questions": [
    {
      "id": "uuid",
      "text": "What is RAM?",
      "answers": [
        {"id": "uuid", "text": "Memory"},
        {"id": "uuid", "text": "Storage"}
      ]
    }
  ]
}
```

---

### POST /duels/:id/answer

Submit answer in duel.

**Auth Required:** Yes

**Request:**
```json
{
  "question_id": "uuid",
  "selected_answer_ids": ["answer-uuid"],
  "time_ms": 2345
}
```

**Response:** `200 OK`
```json
{
  "correct": true,
  "message": "Correct!",
  "duel_complete": false
}
```

**Notes:**
- `duel_complete: true` when all questions answered by both players

---

### GET /duels/:id

Get duel details and results.

**Auth Required:** Yes

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "status": "finished",
  "results": {
    "challenger": {
      "id": "uuid",
      "username": "alice",
      "correct_count": 4,
      "total_time_ms": 12345
    },
    "opponent": {
      "id": "uuid",
      "username": "bob",
      "correct_count": 3,
      "total_time_ms": 15678
    },
    "winner_id": "uuid"
  },
  "questions": [
    {
      "question_id": "uuid",
      "text": "What is RAM?",
      "correct_answer_ids": ["uuid"],
      "challenger_answer": ["uuid"],
      "opponent_answer": ["uuid"]
    }
  ]
}
```

---

### DELETE /duels/:id

Delete a duel.

**Auth Required:** Yes (must be participant)

**Response:** `200 OK`
```json
{
  "message": "Duel deleted"
}
```

---

### POST /duels/reset

Delete all user's duels.

**Auth Required:** Yes

**Response:** `200 OK`
```json
{
  "message": "All duels deleted",
  "count": 5
}
```

---

## 📊 Leaderboards

### GET /leaderboards

Get global leaderboard.

**Auth Required:** Yes

**Query Parameters:**
- `scope` (optional) - `global`, `weekly`, or `pool`
- `pool_id` (required if scope=pool)
- `limit` (optional, default 50) - Number of entries

**Response:** `200 OK`
```json
{
  "scope": "global",
  "entries": [
    {
      "rank": 1,
      "user_id": "uuid",
      "username": "alice",
      "display_name": "Alice",
      "xp": 15000,
      "level": 18
    }
  ],
  "my_rank": 42,
  "my_xp": 5000
}
```

**Notes:**
- Only users with `leaderboard_opt_in = true` are shown

---

### GET /gamification/leaderboard

Get gamification leaderboard (XP-based).

**Auth Required:** Yes

**Response:** `200 OK`
```json
{
  "leaderboard": [
    {
      "rank": 1,
      "user_id": "uuid",
      "username": "alice",
      "xp": 15000,
      "level": 18
    }
  ],
  "user_rank": 42
}
```

---

## ⚠️ Error Handling

### Common Error Responses

**400 Bad Request**
```json
{
  "error": "Validation failed",
  "details": {
    "email": "Invalid email format"
  }
}
```

**401 Unauthorized**
```json
{
  "error": "Authentication required"
}
```

**403 Forbidden**
```json
{
  "error": "Insufficient permissions",
  "required_role": "admin"
}
```

**404 Not Found**
```json
{
  "error": "Resource not found",
  "resource": "pool",
  "id": "uuid"
}
```

**429 Too Many Requests**
```json
{
  "error": "Rate limit exceeded",
  "retry_after_seconds": 120
}
```

**500 Internal Server Error**
```json
{
  "error": "Internal server error",
  "request_id": "uuid"
}
```

---

## 🔒 Rate Limiting

**Global rate limit:** 100 requests per 15 minutes per user

**Endpoint-specific limits:**
- `POST /auth/login` - 5 attempts per 15 minutes per IP
- `POST /auth/forgot` - 5 attempts per 15 minutes per IP
- `POST /training/answer` - 100 per 15 min per user
- `POST /swipe/answer` - 100 per 15 min per user
- `POST /pools/:id/import/json` - 10 per 15 min per user

---

## 📚 Related Documentation

- [Database Schema](DATABASE_SCHEMA.md)
- [Architecture Overview](ARCHITECTURE.md)
- [Getting Started](GETTING_STARTED.md)

---

**Updated**: 2026-02-08
**API Version**: 1.0
