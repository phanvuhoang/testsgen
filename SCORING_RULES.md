# TestsGen — Quiz Scoring Rules Reference

**Module 2 (AI Quiz Generator)**  
Last updated: Round 6 refactor

---

## Overview

All scoring is handled in `app/api/quiz/[shareCode]/attempt/[attemptId]/submit/route.ts`.  
Each question has a `points` field (default: 1). The final score is:

```
scorePercentage = round(earnedPoints / totalPoints * 100)
passed = scorePercentage >= quizSet.passMark   (default: 50%)
```

---

## Question Type Scoring Rules

### 1. MCQ (Multiple Choice — Single Answer)

| Setting | Behavior |
|---------|----------|
| Correct answer | Single string stored in `correctAnswer` |
| Comparison | Case-insensitive, trimmed string match |
| Full credit | `userAnswer == correctAnswer` → `points` |
| No credit | Otherwise → `0` |
| Partial credit | ✗ Not applicable |
| Penalty | Controlled by `penalizeIncorrect` (global flag on QuizSet) — if enabled, award `-points` for wrong answer |

**Example:** correctAnswer = `"Paris"` → `"paris"`, `" Paris "`, `"PARIS"` all score full credit.

---

### 2. TRUE_FALSE (True / False)

Identical to MCQ scoring:

| Setting | Behavior |
|---------|----------|
| Correct answer | `"True"` or `"False"` (stored as string) |
| Comparison | Case-insensitive string match |
| Full credit | Match → `points` |
| No credit | No match → `0` |

---

### 3. MULTIPLE_RESPONSE (Select All That Apply)

Two modes depending on `quizSet.partialCredits`:

#### Mode A: All-or-Nothing (partialCredits = false, default)

| Setting | Behavior |
|---------|----------|
| Correct answer | `||`-delimited string, e.g. `"Apple||Banana||Cherry"` |
| Comparison | Both sets sorted, lowercased, compared as JSON strings |
| Full credit | User selected exactly the correct set → `points` |
| No credit | Any mismatch (missing or extra selection) → `0` |

#### Mode B: Partial Credits (partialCredits = true)

Formula:
```
correctHits  = selections that are in the correct set
wrongHits    = selections that are NOT in the correct set
rawRatio     = max(0, (correctHits - wrongHits) / totalCorrect)
earned       = round(points * rawRatio)
```

| Example | correctSet = {A, B, C}, user selects {A, B} | Result |
|---------|----------------------------------------------|--------|
| Correct: 2, Wrong: 0 | rawRatio = 2/3 | 0.67 × points |
| Correct: 3, Wrong: 0 | rawRatio = 3/3 | full points |
| Correct: 2, Wrong: 1 | rawRatio = 1/3 | 0.33 × points |
| Correct: 0, Wrong: 2 | rawRatio = max(0, -2/3) = 0 | 0 |

**Design note:** Wrong selections deduct from partial credit to discourage "select all" guessing.

---

### 4. SHORT_ANSWER

| Setting | Behavior |
|---------|----------|
| Correct answer | Single string, OR `||`-delimited variants (e.g. `"cat||kitten||a cat"`) |
| Comparison | Case-insensitive, trimmed match against each variant |
| Full credit | User answer matches any accepted variant → `points` |
| No credit | No match → `0` |

**Vietnamese note:** Because matching is case-insensitive, diacritical normalization is NOT applied — `"Hoả hoạn"` and `"hoả hoạn"` match, but `"hoa hoan"` (without diacritics) will not match unless explicitly listed as a variant.

---

### 5. FILL_BLANK (Fill in the Blank)

Identical to SHORT_ANSWER:

| Setting | Behavior |
|---------|----------|
| Correct answer | String or `||`-delimited variants |
| Comparison | Case-insensitive, trimmed |
| Full credit | Matches any variant → `points` |
| No credit | No match → `0` |

**Tip:** For Vietnamese answers, list diacritic-free variants explicitly:  
`"Hỏa hoạn||hoa hoan||hoả hoạn"`

---

### 6. ESSAY

| Setting | Behavior |
|---------|----------|
| Auto-graded | ✗ No |
| Earned points | Always `0` automatically |
| Manual grading | Admin can manually update `marksAwarded` in the attempt review |
| `isCorrect` | Always `false` from auto-grader |

---

### 7. LONG_ANSWER

Identical to ESSAY — not auto-graded, always `0` from submit route.

---

### 8. MATCHING

| Setting | Behavior |
|---------|----------|
| Auto-graded | ✗ No (currently) |
| Earned points | Always `0` from submit route |
| `isCorrect` | Always `false` |
| Answer format | JSON: `[["leftItem","rightItem"], ...]` |
| Planned | Per-pair partial scoring (not yet implemented) |

> **TODO (future):** Implement per-pair scoring: `earned = points × (correct pairs / total pairs)`

---

### 9. TEXT_BLOCK (Instruction / Header block)

| Setting | Behavior |
|---------|----------|
| Scored | ✗ No — skipped entirely in scoring loop |
| `totalPoints` | Not added |
| `earnedPoints` | Not added |

---

## Global Scoring Modifiers

### Penalize Incorrect (`penalizeIncorrect`)

Setting on QuizSet. Currently the schema supports this flag but the submit route does not yet apply a penalty deduction. The flag is stored and can be used in future implementation:

> **Intended behavior:** For MCQ/TRUE_FALSE, wrong answer → subtract `points` from earned (minimum 0).

### Partial Credits (`partialCredits`)

Setting on QuizSet. Only applies to MULTIPLE_RESPONSE questions (Mode B above).

---

## Answer Storage Format

| Type | `correctAnswer` format | `userAnswer` format |
|------|----------------------|---------------------|
| MCQ | `"Paris"` | `"paris"` |
| TRUE_FALSE | `"True"` or `"False"` | `"True"` |
| MULTIPLE_RESPONSE | `"A||B||C"` | `"A||C"` |
| SHORT_ANSWER | `"cat\|\|kitten"` | `"Kitten"` |
| FILL_BLANK | `"42\|\|forty-two"` | `"42"` |
| ESSAY | N/A | free text |
| LONG_ANSWER | N/A | free text |
| MATCHING | N/A | `'[["left1","right2"]]'` (JSON) |

---

## Comparison with Testmoz Excel Template

| Feature | Testmoz | TestsGen |
|---------|---------|---------|
| MCQ single | Case-insensitive match | ✓ Same |
| True/False | String match | ✓ Same |
| Multiple response (all-or-nothing) | Exact set match | ✓ Same |
| Multiple response (partial) | Not supported | ✓ Extended (partialCredits flag) |
| Fill in blank (case-insensitive) | Yes | ✓ Same (Round 6 fix) |
| Fill in blank (multiple variants) | `\|`-delimited | ✓ `\|\|`-delimited |
| Short answer | Exact string | ✓ Extended (case-insensitive + variants) |
| Essay | Manual only | ✓ Same |
| Matching | Per-pair partial | ✗ Not yet (returns 0) |

---

## Scoring Flow Diagram

```
submit POST
  └── load attempt + quizSet + answers
  └── for each question in snapshot:
        ├── TEXT_BLOCK → skip
        ├── MCQ / TRUE_FALSE → case-insensitive string compare
        ├── SHORT_ANSWER / FILL_BLANK → check against ||‐variants
        ├── MULTIPLE_RESPONSE:
        │     ├── partialCredits=false → exact set match
        │     └── partialCredits=true → formula: max(0, hits-wrong)/total
        ├── ESSAY / LONG_ANSWER / MATCHING → earned=0
        └── update AttemptAnswer { isCorrect, marksAwarded }
  └── update Attempt { totalScore, maxScore, status=SUBMITTED }
  └── return { score%, passed, earnedPoints, totalPoints, answers[] }
```
