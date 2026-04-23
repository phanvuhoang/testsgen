# BRIEF: Module 1 + Module 2 — 10 Fixes

**Repo:** phanvuhoang/testsgen

---

## MODULE 1

### Fix M1-1: Bỏ "Overall Marking Scheme" block — giữ Model Answer + per-option explanations

**Vấn đề:** Trong `renderAnswerPanel()` vẫn còn block `{q.markingScheme && ...}` render ra, và trong non-MCQ hiện thị `q.correctAnswer` như "Correct answer: X" trước model answer.

**File:** `app/(dashboard)/exams/[projectId]/[sessionId]/questions/page.tsx`

Trong `renderAnswerPanel(q)`:

1. **Xóa** hoàn toàn block marking scheme:
```typescript
// XÓA toàn bộ block này:
{q.markingScheme && (
  <div className="p-3 bg-blue-50 border border-blue-100 rounded">
    <p className="text-xs font-semibold mb-2 flex items-center gap-1 text-blue-900">
      <BookOpen className="h-3 w-3" />Marking Scheme
    </p>
    <div className="text-blue-900">
      <HtmlContent html={q.markingScheme} />
    </div>
  </div>
)}
```

2. **Xóa** block "Correct Answer" cho non-MCQ (line ~596):
```typescript
// XÓA block này:
{!q.options && q.correctAnswer && (
  <div className="p-2 bg-green-50 border border-green-200 rounded text-green-800 text-xs">
    <strong>Correct Answer:</strong> {q.correctAnswer}
  </div>
)}
```

3. **Giữ nguyên** toàn bộ: `optionExplanations` (MCQ per-option), `modelAnswer`, syllabus badges, regulation refs.

Trong **Export Word** (`exportToWord`), cũng **xóa** phần markingScheme render:
```typescript
// XÓA block:
if (q.markingScheme) {
  children.push(new Paragraph({ ... 'Marking Scheme:' ... }))
  children.push(new Paragraph({ text: stripHtml(q.markingScheme) ... }))
}
```

---

### Fix M1-2: Question timestamp — hiển thị date+time thực, không phải "X ago"

**File:** `app/(dashboard)/exams/[projectId]/[sessionId]/questions/page.tsx`

Tìm hàm `formatRelativeTime` (hoặc chỗ render timestamp), **thay** bằng:

```typescript
function formatQuestionTime(dateStr: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false
  })
  // Output: "23 Apr 2026, 14:35"
}
```

Trong question card metadata badges, thay:
```typescript
// Thay:
{formatRelativeTime(q.createdAt)}
// Bằng:
{formatQuestionTime(q.createdAt)}
```

---

### Fix M1-3: Thêm label "Question:" trong stem để tách Case và Question prompt

**File:** `lib/ai/prompts.ts`

Trong `buildExamQuestionPrompt()`, tìm `## GENERATION RULES` hoặc `## INSTRUCTIONS`, thêm rule:

```typescript
// Thêm vào GENERATION RULES (sau rule số 7 hiện tại):
`8. SCENARIO/CASE STUDY FORMATTING: When the question has a scenario/case description followed
   by a question prompt, format the stem as:
   "Case: [scenario text here]\\n\\nQuestion: [actual question prompt here]"
   Use "Case:" label for the scenario and "Question:" label for the question prompt.
   This applies to: SCENARIO, CASE_STUDY, ESSAY question types.
   For MCQ with a short lead-in: use "Case: [brief context]\\n\\nQuestion: [question]"
   For pure MCQ without scenario context: no labels needed, just the question text.`
```

---

### Fix M1-4: Parse document — fix UI + move from Project level to Session level

**Vấn đề hiện tại:**
- Parse config có trong document tag editor (ở Sessions), nhưng nút Parse 🧩 gọi API mà không truyền `useAI` hay `forceAI` đúng
- Parse thực tế cần gọi AI fallback nhưng code check `forceAI === true` từ body — trong khi nút Parse gửi `{ useAI: true }` (key khác!)

**File A:** `app/api/sessions/[id]/documents/[docId]/parse/route.ts`

Sửa để nhận đúng body param:
```typescript
// Tìm:
const forceAI: boolean = body.forceAI === true

// Thay bằng:
const forceAI: boolean = body.forceAI === true || body.useAI === true
```

Đây là fix trực tiếp khiến parse luôn trả 0: `useAI: true` được gửi từ UI nhưng bị ignore vì code check `forceAI`.

**File B:** `app/(dashboard)/exams/[projectId]/[sessionId]/documents/page.tsx`

Khi bấm nút Parse 🧩 (mà KHÔNG qua tag editor), cần set `forceAI: true` hoặc `useAI: true`. Hiện tại nút Parse gọi:
```typescript
const handleParseDocument = async (docId: string) => {
  const res = await fetch(`.../parse`, {
    method: 'POST',
    body: JSON.stringify({ useAI: true }),   // ← đã đúng, nhưng API không nhận
  })
}
```

Sau khi fix API (File A), nút này sẽ hoạt động. Nhưng cần thêm: nếu document có `parseKeyword`/`parseStyle` thì cũng thử structural parse trước.

Sửa `handleParseDocument` để pass parse config luôn:
```typescript
const handleParseDocument = async (docId: string) => {
  setParsingDocId(docId)
  try {
    const doc = docs.find(d => d.id === docId)
    const res = await fetch(`/api/sessions/${params.sessionId}/documents/${docId}/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        useAI: true,                                    // fallback to AI if structural fails
        parseKeyword: doc?.parseKeyword || undefined,   // pass per-doc config
        parseStyle: doc?.parseStyle || undefined,
        parseNumber: doc?.parseNumber ?? true,
      }),
    })
    ...
  }
}
```

**File C:** `app/api/sessions/[id]/documents/[docId]/parse/route.ts`

Đọc parse config từ **cả body VÀ document** (body override doc):
```typescript
// Thay:
const parseKeyword: string  = (doc as any).parseKeyword || 'Example'
const parseStyle: string    = (doc as any).parseStyle   || 'Heading2'
const parseNumber: boolean  = (doc as any).parseNumber  !== false

// Bằng:
const parseKeyword: string  = body.parseKeyword || (doc as any).parseKeyword || 'Example'
const parseStyle: string    = body.parseStyle   || (doc as any).parseStyle   || 'Heading2'
const parseNumber: boolean  = body.parseNumber  !== undefined ? body.parseNumber : ((doc as any).parseNumber !== false)
```

---

### Fix M1-5: Default model trong Generate — Claudible Haiku 4.5

**File:** `app/(dashboard)/exams/[projectId]/[sessionId]/generate/page.tsx`

```typescript
// Tìm:
const [selectedModel, setSelectedModel] = useState('deepseek:deepseek-reasoner')

// Thay:
const [selectedModel, setSelectedModel] = useState('claudible:claude-haiku-4.5')
```

Đồng thời, trong Select dropdown hiển thị model options, thêm Claudible Haiku và đặt là default:
```typescript
// Thêm vào đầu SelectContent (trước các options khác):
<SelectItem value="claudible:claude-haiku-4.5">Claudible Haiku 4.5 (Default)</SelectItem>
<SelectItem value="claudible:claude-sonnet-4.6">Claudible Sonnet 4.6</SelectItem>
```

---

### Fix M1-6: Session setting — VND unit variable

**File:** `prisma/schema.prisma` — thêm vào `Session`:
```prisma
model Session {
  // ... existing ...
  vndUnit          String @default("million")  // "vnd" | "thousand" | "million"
}
```

Chạy: `npx prisma db push`

**File:** Session settings page

Thêm field:
```
Label: "Currency unit for VND amounts"
Type: Radio/Select — 3 options:
  - "vnd" → "VND (absolute)"
  - "thousand" → "VND 000 (thousands)"
  - "million" → "VND million" ← DEFAULT
Help text: "Sets how monetary amounts appear in questions. 'VND million' shows 1,000,000 VND as '1'"
```

**File:** `app/api/sessions/[id]/generate-jobs/[jobId]/run/route.ts`

Lấy `vndUnit` từ `sessionData`:
```typescript
const vndUnit: string = (sessionData as any)?.vndUnit ?? 'million'
```

Thêm vào `generatorConfig`:
```typescript
vndUnit,
```

**File:** `lib/ai/prompts.ts` — thêm `vndUnit` vào `ExamGenerationConfig`:
```typescript
vndUnit?: string   // 'vnd' | 'thousand' | 'million'
```

Thêm instruction trong `buildExamQuestionPrompt()`:
```typescript
const vndUnitLabel = config.vndUnit === 'thousand' ? 'VND 000 (thousands)'
  : config.vndUnit === 'vnd' ? 'VND (absolute amounts)'
  : 'VND million'

const vndUnitInstruction = `CURRENCY UNIT: Express all VND monetary amounts in ${vndUnitLabel}.
${config.vndUnit === 'million'
  ? 'Example: write "500" to mean 500 million VND. For decimals: "round to the nearest million VND" or "to one decimal place (e.g. 1.5 million VND)".'
  : config.vndUnit === 'thousand'
  ? 'Example: write "500,000" to mean 500 million VND. Round to nearest thousand VND.'
  : 'Write full VND amounts (e.g. 500,000,000 VND).'
}\n\n`
```

Thêm `vndUnitInstruction` vào return string (sau `languageInstruction`).

---

### Fix M1-7: Scenario/non-MCQ answer — bỏ "Correct answer" prefix, chỉ dùng modelAnswer

**Vấn đề:** AI trả về `correctAnswer` cho SCENARIO/ESSAY (ngắn, thường sai), nhưng UI hiển thị nó trước `modelAnswer` gây mâu thuẫn.

**File A:** `lib/ai/prompts.ts`

Trong OUTPUT FORMAT, sửa rule cho non-MCQ:
```typescript
// Trong JSON example, sửa field correctAnswer:
"correctAnswer": "For MCQ: exact correct option text. For SCENARIO/ESSAY/CASE_STUDY: set to null — use modelAnswer instead.",

// Thêm vào GENERATION RULES:
`9. correctAnswer field rules by question type:
   - MCQ_SINGLE: exact text of correct option
   - MCQ_MULTIPLE: correct options joined by "||"
   - FILL_BLANK: acceptable answers joined by "||"
   - TRUE_FALSE: "True" or "False"
   - SCENARIO / ESSAY / CASE_STUDY / SHORT_ANSWER: set correctAnswer = null
     These types use modelAnswer for the full worked solution.`
```

**File B:** `app/(dashboard)/exams/[projectId]/[sessionId]/questions/page.tsx`

Trong `renderAnswerPanel()`, block "Correct answer for non-MCQ" đã được xóa ở Fix M1-1. Không cần thêm gì. ✓

Cũng trong `run/route.ts`, khi lưu question, đảm bảo không lưu `correctAnswer` rỗng cho scenario:
```typescript
// Trong db.question.create():
correctAnswer: (sec.questionType === 'SCENARIO' || sec.questionType === 'ESSAY')
  ? null
  : (String(q.correctAnswer || '') || null),
```

---

## MODULE 2

### Fix M2-1: Default model → Claudible Haiku 4.5 trong "Generate with AI" (Quiz)

**File:** `app/(dashboard)/quiz/[quizId]/questions/page.tsx`

```typescript
// Tìm:
const [selectedModel, setSelectedModel] = useState<string>('deepseek:deepseek-reasoner')

// Thay:
const [selectedModel, setSelectedModel] = useState<string>('claudible:claude-haiku-4.5')
```

Trong Select dropdown (line ~1031), thêm Claudible options đầu tiên:
```typescript
<SelectItem value="claudible:claude-haiku-4.5">Claudible Haiku 4.5 (Default)</SelectItem>
<SelectItem value="claudible:claude-sonnet-4.6">Claudible Sonnet 4.6</SelectItem>
// Giữ lại các options cũ bên dưới
```

---

### Fix M2-2: Language option trong tất cả AI generate flows (Module 2 + Gameshow)

**File A:** `app/api/quiz-sets/[id]/generate/route.ts`

Thêm `language` vào body destructure:
```typescript
const {
  ...existing fields...,
  language = 'ENG',   // 'ENG' | 'VIE'
} = body
```

Truyền vào `generateQuizQuestions()` config:
```typescript
const gen = generateQuizQuestions(
  {
    ...existing fields...,
    language,   // ← thêm
  },
  modelId
)
```

**File B:** `lib/ai/prompts.ts`

`buildQuizGenerationPrompt()` đã có `language` trong `GenerationConfig` và `languageInstruction`. Không cần sửa. ✓

**File C:** `app/(dashboard)/quiz/[quizId]/questions/page.tsx`

Thêm state và UI cho language selector trong AI panel:
```typescript
// Thêm state:
const [aiLanguage, setAiLanguage] = useState<'ENG' | 'VIE'>('ENG')

// Trong payload khi gọi generate API:
body: JSON.stringify({
  ...existing,
  language: aiLanguage,
})

// Thêm UI selector (trong AI generate panel, cạnh model selector):
<Select value={aiLanguage} onValueChange={(v) => setAiLanguage(v as 'ENG' | 'VIE')}>
  <SelectTrigger className="w-32 h-8 text-xs">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="ENG">English</SelectItem>
    <SelectItem value="VIE">Vietnamese</SelectItem>
  </SelectContent>
</Select>
```

**File D:** Gameshow generate — tìm file(s) có AI generate cho gameshow và thêm `language` tương tự.
```
find app -name "*.ts" -o -name "*.tsx" | xargs grep -l "gameshow.*generat\|generat.*gameshow" 2>/dev/null
```
Nếu gameshow dùng cùng `quiz-sets/[id]/generate` endpoint → language đã được truyền, chỉ cần thêm UI selector.

---

### Fix M2-3: Tăng document context cap trong Module 2

**File:** `app/api/quiz-sets/[id]/generate/route.ts`

```typescript
// Tìm:
const documentContent = contentParts.join('\n\n---\n\n').slice(0, 60000)

// Thay: tăng lên 150K (tương đương Module 1 regulations cap)
const documentContent = contentParts.join('\n\n---\n\n').slice(0, 150_000)
```

Cũng sửa `extractDocumentText()` trong file này:
```typescript
async function extractDocumentText(filePath: string, fileType: string): Promise<string> {
  const fullPath = join(process.cwd(), 'public', filePath)
  const buffer = await readFile(fullPath)

  if (fileType === 'pdf') {
    const pdfParse = require('pdf-parse')
    const data = await pdfParse(buffer)
    return (data.text ?? '').slice(0, 150_000)   // tăng từ unlimited → cap 150K per file
  }

  if (fileType === 'docx' || fileType === 'doc') {
    const mammoth = require('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return (result.value ?? '').slice(0, 150_000)
  }

  return buffer.toString('utf-8').slice(0, 150_000)
}
```

---

## Files cần sửa (tóm tắt)

| File | Fixes |
|---|---|
| `app/(dashboard)/exams/.../questions/page.tsx` | M1-1 (bỏ markingScheme), M1-2 (timestamp), M1-7 (no correctAnswer non-MCQ) |
| `lib/ai/prompts.ts` | M1-3 (Case/Question label), M1-6 (vndUnit), M1-7 (correctAnswer=null for scenario) |
| `app/api/sessions/[id]/documents/[docId]/parse/route.ts` | M1-4 (fix forceAI/useAI + body override) |
| `app/(dashboard)/exams/.../documents/page.tsx` | M1-4 (pass parse config từ doc khi bấm Parse) |
| `app/(dashboard)/exams/.../generate/page.tsx` | M1-5 (default Claudible Haiku) |
| `prisma/schema.prisma` | M1-6 (Session.vndUnit) |
| `app/api/sessions/[id]/generate-jobs/[jobId]/run/route.ts` | M1-6 (vndUnit), M1-7 (correctAnswer null for scenario) |
| `app/(dashboard)/quiz/[quizId]/questions/page.tsx` | M2-1 (default Claudible Haiku), M2-2 (language selector) |
| `app/api/quiz-sets/[id]/generate/route.ts` | M2-2 (language param), M2-3 (150K cap) |

---

## Prisma — chạy sau khi Claude Code push

```bash
npx prisma db push
```
(chỉ thêm 1 field `vndUnit` vào Session — không có migration cũ nào cần run)

---

## KHÔNG thay đổi

- Module 2 Quiz/Gameshow schema
- `lib/ai/index.ts`
- Module 1 document context caps (giữ 100K/40K/30K/15K)

---

**Sau khi Claude Code push → nhắn em deploy.**
