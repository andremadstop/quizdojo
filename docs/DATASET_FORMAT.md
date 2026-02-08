# Dataset Format Specification

This document describes the JSON format for question pool datasets in QuizDojo.

## 📋 Table of Contents

- [Basic Structure](#basic-structure)
- [Metadata](#metadata)
- [Questions](#questions)
- [Answers](#answers)
- [Multilingual Pools](#multilingual-pools)
- [Validation Rules](#validation-rules)
- [Examples](#examples)
- [Creating Datasets](#creating-datasets)

---

## 🏗️ Basic Structure

A QuizDojo dataset is a JSON file with the following structure:

```json
{
  "meta": {
    "name": "Pool Name",
    "model": "claude-opus-4",
    "created_by": "AI",
    "license": "CC0",
    "source": "Original",
    "version": "1.0"
  },
  "questions": [
    {
      "id": "q1",
      "text": "Question text",
      "lang": "de",
      "source_id": "q1",
      "explanation": "Explanation text",
      "images": [],
      "answers": [
        {
          "id": "a1",
          "text": "Answer text",
          "correct": true
        },
        {
          "id": "a2",
          "text": "Wrong answer",
          "correct": false
        }
      ]
    }
  ]
}
```

---

## 📝 Metadata

The `meta` object contains pool information:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | **Yes** | Pool name (shown in UI) |
| `model` | string | No | AI model used for generation (e.g., "claude-opus-4", "gpt-4") |
| `created_by` | string | No | Creator (e.g., "AI", "Human", username) |
| `license` | string | No | License (e.g., "CC0", "CC-BY", "GPL-3.0") |
| `source` | string | No | Source/origin of questions |
| `version` | string | No | Dataset version |
| `description` | string | No | Pool description |
| `tags` | array | No | Tags for categorization |

**Example:**

```json
{
  "meta": {
    "name": "CompTIA A+ Core 1",
    "model": "claude-opus-4",
    "created_by": "AI",
    "license": "CC0",
    "source": "Generated from official objectives",
    "version": "1.0",
    "description": "Questions covering CompTIA A+ 220-1101 objectives",
    "tags": ["comptia", "a+", "hardware", "networking"]
  }
}
```

---

## ❓ Questions

Each question in the `questions` array has the following structure:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | **Yes** | Unique question ID within the dataset |
| `text` | string | **Yes** | Question text |
| `lang` | string | **Yes** | Language code: "de", "en", or "ru" |
| `source_id` | string | **Yes** | Links multilingual versions (same across languages) |
| `explanation` | string | No | Explanation shown after answering |
| `images` | array | No | Array of image URLs/paths |
| `answers` | array | **Yes** | Array of answer objects (2-10 answers) |

### Field Details

#### `id`
- Must be unique within the dataset
- Used for internal tracking
- Format: alphanumeric, hyphens, underscores allowed
- Example: `"q1"`, `"q-001"`, `"hardware_01"`

#### `text`
- The question text shown to users
- Can contain markdown formatting
- HTML is **not** supported (will be escaped)
- Maximum length: 2000 characters

#### `lang`
- Must be one of: `"de"`, `"en"`, `"ru"`
- Determines which language version is shown
- All questions in a pool can have different languages

#### `source_id`
- Links questions across languages
- Same `source_id` = same question in different languages
- Example: Question in DE has `source_id: "q1"`, same question in EN also has `source_id: "q1"`
- Enables language toggle feature in UI

#### `explanation`
- Optional but **highly recommended**
- Shown after user answers (training mode) or at end (exam mode)
- Helps users learn from mistakes
- Maximum length: 1000 characters

#### `images`
- Array of image URLs or file paths
- Images must be accessible to the application
- Supported formats: JPG, PNG, GIF, SVG, WebP
- Example: `["images/diagram1.png", "images/diagram2.jpg"]`

---

## ✅ Answers

Each question must have 2-10 answers:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | **Yes** | Unique answer ID within the question |
| `text` | string | **Yes** | Answer text |
| `correct` | boolean | **Yes** | Whether this answer is correct |

### Answer Rules

1. **At least 1 correct answer** required
2. **Multiple correct answers** allowed (multiple-choice)
3. **Answer order** is randomized in the UI (unless exam mode with fixed order)
4. **Answer IDs** must be unique within the question

**Example:**

```json
{
  "answers": [
    {
      "id": "a1",
      "text": "TCP/IP",
      "correct": true
    },
    {
      "id": "a2",
      "text": "OSI Model",
      "correct": false
    },
    {
      "id": "a3",
      "text": "Ethernet",
      "correct": false
    },
    {
      "id": "a4",
      "text": "Wi-Fi",
      "correct": false
    }
  ]
}
```

---

## 🌍 Multilingual Pools

QuizDojo supports multilingual question pools. Users can toggle question language in the UI.

### How It Works

1. **Same `source_id`** links questions across languages
2. **Different `lang`** field indicates the language
3. **UI shows language toggle** pills (DE/EN/RU)
4. **Original language** is highlighted

### Example: Multilingual Question Set

**German version:**
```json
{
  "id": "q1_de",
  "text": "Was ist die Hauptfunktion eines Routers?",
  "lang": "de",
  "source_id": "q1",
  "explanation": "Ein Router verbindet verschiedene Netzwerke und leitet Datenpakete zwischen ihnen weiter.",
  "answers": [
    {"id": "a1", "text": "Netzwerke verbinden", "correct": true},
    {"id": "a2", "text": "Daten speichern", "correct": false}
  ]
}
```

**English version (linked via `source_id`):**
```json
{
  "id": "q1_en",
  "text": "What is the main function of a router?",
  "lang": "en",
  "source_id": "q1",
  "explanation": "A router connects different networks and forwards data packets between them.",
  "answers": [
    {"id": "a1", "text": "Connect networks", "correct": true},
    {"id": "a2", "text": "Store data", "correct": false}
  ]
}
```

**Russian version:**
```json
{
  "id": "q1_ru",
  "text": "Какова основная функция маршрутизатора?",
  "lang": "ru",
  "source_id": "q1",
  "explanation": "Маршрутизатор соединяет разные сети и пересылает пакеты данных между ними.",
  "answers": [
    {"id": "a1", "text": "Соединять сети", "correct": true},
    {"id": "a2", "text": "Хранить данные", "correct": false}
  ]
}
```

### Naming Convention

For multilingual pools, use this naming pattern:
- `PoolName_DE.json` - German version
- `PoolName_EN.json` - English version
- `PoolName_RU.json` - Russian version

---

## ✔️ Validation Rules

Before importing, datasets are validated:

### 1. JSON Validity
- Must be valid JSON
- No syntax errors
- All strings properly escaped

### 2. Required Fields
- `meta.name` must exist
- Each question must have: `id`, `text`, `lang`, `source_id`, `answers`
- Each answer must have: `id`, `text`, `correct`

### 3. Data Integrity
- All question IDs unique within dataset
- All answer IDs unique within question
- At least 1 correct answer per question
- 2-10 answers per question
- `lang` must be "de", "en", or "ru"

### 4. String Escaping
- All strings with quotes must escape them: `"text": "He said \"hello\""`
- Newlines must be escaped: `\n`
- Backslashes must be escaped: `\\`

### Common Errors

❌ **Unescaped quotes:**
```json
{"text": "What is "TCP/IP"?"}  // ERROR
```

✅ **Correct:**
```json
{"text": "What is \"TCP/IP\"?"}  // OK
```

❌ **Missing `text` field:**
```json
{"id": "a1", "correct": true}  // ERROR - no text
```

✅ **Correct:**
```json
{"id": "a1", "text": "Answer", "correct": true}
```

---

## 📚 Examples

### Example 1: Simple Single-Language Pool

```json
{
  "meta": {
    "name": "Basic Networking",
    "license": "CC0"
  },
  "questions": [
    {
      "id": "q1",
      "text": "What does IP stand for?",
      "lang": "en",
      "source_id": "q1",
      "explanation": "IP stands for Internet Protocol.",
      "answers": [
        {"id": "a1", "text": "Internet Protocol", "correct": true},
        {"id": "a2", "text": "Internal Processor", "correct": false},
        {"id": "a3", "text": "International Port", "correct": false}
      ]
    }
  ]
}
```

### Example 2: Multiple Correct Answers

```json
{
  "id": "q2",
  "text": "Which of the following are valid IPv4 addresses? (Select all that apply)",
  "lang": "en",
  "source_id": "q2",
  "explanation": "Valid IPv4 addresses have 4 octets (0-255) separated by dots.",
  "answers": [
    {"id": "a1", "text": "192.168.1.1", "correct": true},
    {"id": "a2", "text": "10.0.0.1", "correct": true},
    {"id": "a3", "text": "256.1.1.1", "correct": false},
    {"id": "a4", "text": "192.168.1", "correct": false}
  ]
}
```

### Example 3: Question with Images

```json
{
  "id": "q3",
  "text": "Identify the network topology shown in the diagram:",
  "lang": "en",
  "source_id": "q3",
  "images": ["images/topology_diagram.png"],
  "explanation": "This is a star topology with a central switch.",
  "answers": [
    {"id": "a1", "text": "Star", "correct": true},
    {"id": "a2", "text": "Bus", "correct": false},
    {"id": "a3", "text": "Ring", "correct": false},
    {"id": "a4", "text": "Mesh", "correct": false}
  ]
}
```

### Example 4: Swipe Pool (True/False)

For Swipe mode, use binary questions:

```json
{
  "meta": {
    "name": "Swipe: Computer History",
    "model": "claude-opus-4",
    "license": "CC0"
  },
  "questions": [
    {
      "id": "q1",
      "text": "ENIAC was the first general-purpose electronic computer.",
      "lang": "en",
      "source_id": "q1",
      "explanation": "True. ENIAC (1945) was the first Turing-complete digital computer.",
      "answers": [
        {"id": "correct", "text": "Richtig", "correct": true},
        {"id": "wrong", "text": "Falsch", "correct": false}
      ]
    }
  ]
}
```

**Note**: Swipe pools are detected by name prefix `"Swipe:"` and must have exactly 2 answers.

---

## 🛠️ Creating Datasets

### Option 1: AI-Assisted Generation

Use the Pool Creator Prompt:

1. Read [POOL_CREATOR_PROMPT.md](POOL_CREATOR_PROMPT.md)
2. Use with Claude, GPT-4, or similar
3. Validate output with:
   ```bash
   cat output.json | jq .
   ```

### Option 2: Manual Creation

1. **Start with template**:
   ```bash
   cp examples/template.json my_pool.json
   ```

2. **Edit questions** in your favorite editor

3. **Validate JSON**:
   ```bash
   # Check syntax
   cat my_pool.json | jq .

   # Count questions
   cat my_pool.json | jq '.questions | length'
   ```

4. **Import via UI** or API

### Option 3: Convert from Other Formats

Convert from Anki, Quizlet, or CSV:

```bash
# Example: CSV to JSON converter (community-contributed)
python scripts/csv_to_quizdoji.py input.csv output.json
```

---

## 🧪 Testing Your Dataset

Before sharing:

1. **Validate JSON** syntax
2. **Import to local instance**
3. **Try all modes**: Training, Swipe, Exam
4. **Check all languages** (if multilingual)
5. **Verify explanations** are helpful
6. **Test images** load correctly

---

## 📦 Sharing Datasets

To share your dataset with the community:

1. **Choose a license** (CC0, CC-BY, GPL-3.0, etc.)
2. **Add to `meta.license`**
3. **Submit PR** to this repository
4. **Or** share on GitHub Discussions

---

## 📞 Questions?

- Check [GitHub Discussions](https://github.com/YOUR_USERNAME/quizdoji/discussions)
- Read [POOL_CREATOR_PROMPT.md](POOL_CREATOR_PROMPT.md)
- Open an [Issue](https://github.com/YOUR_USERNAME/quizdoji/issues)

---

**Updated**: 2026-02-08
