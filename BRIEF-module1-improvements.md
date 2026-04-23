# BRIEF: Module 1 — 8 Improvements (Generation + Parse + Settings + Display)

**Repo:** phanvuhoang/testsgen  
**Module:** Module 1 only  
**Lưu ý:** Có 2 migration cần chạy sau deploy (xem cuối brief)

---

## Fix 1 — First-click generates 0 questions (BUG)

**Root cause:** `generate/route.ts` (POST jobs) và `run/route.ts` đọc `config` từ job, nhưng `language` field không được lưu vào `config` JSON trong `generate-jobs/route.ts`.

**File:** `app/api/sessions/[id]/generate-jobs/route.ts`

```typescript
// Tìm:
const { sectionConfigs, extraInstructions, modelId } = body
const total = sectionConfigs.reduce(...)
const job = await (db as any).generateJob.create({
  data: {
    ...
    config: JSON.stringify({ sectionConfigs, extraInstructions, modelId }),
    ...
  }
})

// Thay thành: lưu ĐẦY ĐỦ body vào config
const { sectionConfigs, extraInstructions, modelId, language, total: bodyTotal } = body
const total = bodyTotal || sectionConfigs.reduce((s: number, c: any) => s + (c.count || 2), 0)
const job = await (db as any).generateJob.create({
  data: {
    sessionId: params.id,
    status: 'PENDING',
    config: JSON.stringify({ sectionConfigs, extraInstructions, modelId, language }),
    progress: 0,
    total,
  },
})
```

**Ngoài ra — fix race condition "0 questions on first click":**

Vấn đề thứ hai: client gọi `POST /generate-jobs` → nhận `job.id` → ngay lập tức gọi `POST /generate-jobs/:id/run`. Nhưng job vừa tạo đôi khi chưa commit vào DB khi `run` được gọi (race condition). Fix:

**File:** `app/api/sessions/[id]/generate-jobs/[jobId]/run/route.ts`

```typescript
// Ở đầu hàm POST, thay:
const job = await (db as any).generateJob.findUnique({ where: { id: params.jobId } })
if (!job || (job.status !== 'PENDING' && job.status !== 'RUNNING')) {
  return NextResponse.json({ error: 'Job not found or already processed' }, { status: 400 })
}

// Bằng: retry với delay nếu không tìm thấy
let job = null
for (let attempt = 0; attempt < 5; attempt++) {
  job = await (db as any).generateJob.findUnique({ where: { id: params.jobId } })
  if (job) break
  await new Promise(resolve => setTimeout(resolve, 200))  // wait 200ms
}
if (!job || (job.status !== 'PENDING' && job.status !== 'RUNNING')) {
  return NextResponse.json({ error: 'Job not found or already processed' }, { status: 400 })
}
```

---

## Fix 2 — Parse Document: Flexible per-document parse config

**Vấn đề hiện tại:** Parse pattern chỉ có ở Project level (`parsePattern` field) và chỉ 2 options cứng. Không flexible, không hoạt động với PDF.

**Giải pháp:** Thêm parse config **per document** (mỗi document có thể có parse config riêng), khai báo trực tiếp trong UI Documents tab.

### 2a. Migration — thêm parse config vào Document model

**File:** `prisma/schema.prisma` — thêm vào model `Document`:

```prisma
model Document {
  // ... existing fields ...
  
  // Per-document parse config (for SAMPLE_QUESTIONS type)
  parseKeyword    String?   // e.g. "Example", "Question", "Exercise"
  parseStyle      String?   // Heading style: "Heading1" | "Heading2" | "Heading3" | "numbered" | "ai"
  parseNumber     Boolean   @default(true)  // whether keyword is followed by a number
}
```

Sau khi thêm schema, chạy:
```bash
npx prisma migrate dev --name add_document_parse_config
npx prisma generate
```

### 2b. UI — Thêm parse config UI trong Documents page

**File:** `app/(dashboard)/exams/[projectId]/[sessionId]/documents/page.tsx`

Với mỗi document có `fileType === 'SAMPLE_QUESTIONS'`, hiển thị thêm parse config section (bên dưới tag editor):

```typescript
// Thêm parse config inline (chỉ hiện với SAMPLE_QUESTIONS):
// 1. Keyword field: text input, placeholder "Example" (default)
// 2. With number: checkbox (default checked) — nếu checked thì pattern là "Keyword N:"
// 3. Style: select — Heading 1, Heading 2, Heading 3, Numbered List, AI Only
// 4. Preview: nút "Test Parse" → gọi parse và show số questions found

// UI example:
{doc.fileType === 'SAMPLE_QUESTIONS' && (
  <div className="mt-2 pt-2 border-t text-xs space-y-2">
    <p className="font-semibold text-gray-500">Parse Config</p>
    <div className="flex gap-2 items-center flex-wrap">
      <Label className="text-xs">Keyword:</Label>
      <Input className="h-7 w-24 text-xs" value={parseKeyword} onChange={...} placeholder="Example" />
      <Checkbox checked={parseNumber} onCheckedChange={...} />
      <Label className="text-xs">+ number</Label>
      <Select value={parseStyle} onValueChange={...}>
        <SelectItem value="Heading2">Heading 2</SelectItem>
        <SelectItem value="Heading1">Heading 1</SelectItem>
        <SelectItem value="Heading3">Heading 3</SelectItem>
        <SelectItem value="numbered">Numbered List</SelectItem>
        <SelectItem value="ai">AI Parse (slow)</SelectItem>
      </Select>
      <Button size="sm" onClick={() => saveParseCfgAndParse(doc.id)}>Parse</Button>
    </div>
    <p className="text-gray-400">Pattern: "{parseKeyword} N:" split by {parseStyle}</p>
  </div>
)}
```

### 2c. Save parse config to DB — PATCH document endpoint

**File:** `app/api/sessions/[id]/documents/[docId]/route.ts`

Thêm `parseKeyword`, `parseStyle`, `parseNumber` vào PATCH handler (nếu chưa có):

```typescript
// Trong PATCH handler, thêm vào updateData:
if (body.parseKeyword !== undefined) updateData.parseKeyword = body.parseKeyword
if (body.parseStyle !== undefined) updateData.parseStyle = body.parseStyle
if (body.parseNumber !== undefined) updateData.parseNumber = body.parseNumber
```

### 2d. Parse logic — dùng per-document config

**File:** `app/api/sessions/[id]/documents/[docId]/parse/route.ts`

Thay đoạn đọc `parsePattern` từ project bằng đọc từ document:

```typescript
// Thay:
const session = await (db as any).session.findUnique({
  where: { id: params.id },
  include: { project: { select: { parsePattern: true } } }
})
const parsePattern: string = session?.project?.parsePattern || 'HEADING2_EXAMPLE'

// Bằng: đọc parse config từ chính document
const parseKeyword: string  = doc.parseKeyword || 'Example'
const parseStyle: string    = doc.parseStyle   || 'Heading2'
const parseNumber: boolean  = doc.parseNumber  !== false  // default true

// Build regex pattern từ config
const keywordPattern = parseNumber
  ? new RegExp(`^${parseKeyword}\\s+\\d+\\s*:`, 'i')
  : new RegExp(`^${parseKeyword}\\s*:`, 'i')

const headingStyles = parseStyle === 'Heading1' ? ['Heading1', 'heading1', '1', 'Heading 1']
  : parseStyle === 'Heading2' ? ['Heading2', 'heading2', '2', 'Heading 2', 'heading 2']
  : parseStyle === 'Heading3' ? ['Heading3', 'heading3', '3', 'Heading 3']
  : []

// Thay hàm parseByHeading2Example bằng generic parseByHeadingKeyword:
function parseByHeadingKeyword(
  paragraphs: { style: string; text: string }[],
  headingStyles: string[],
  keywordPattern: RegExp
): any[] {
  const styleSet = new Set(headingStyles)

  let splitIndices: number[] = paragraphs
    .map((p, i) => (styleSet.size === 0 || styleSet.has(p.style)) && keywordPattern.test(p.text) ? i : -1)
    .filter(i => i !== -1)

  // Fallback: text-only match (no style requirement)
  if (splitIndices.length === 0) {
    splitIndices = paragraphs
      .map((p, i) => keywordPattern.test(p.text) ? i : -1)
      .filter(i => i !== -1)
  }

  if (splitIndices.length === 0) return []

  return splitIndices.map((hi, idx) => {
    const headingText = paragraphs[hi].text
    const numMatch = headingText.match(/\d+/)
    const exNum = numMatch ? parseInt(numMatch[0]) : idx + 1
    const nextHi = idx + 1 < splitIndices.length ? splitIndices[idx + 1] : paragraphs.length
    const content = paragraphs.slice(hi, nextHi).map(p => p.text).join('\n').trim()
    if (content.length < 30) return null

    const answerSplit = content.match(/(?:^|\n)(Answer|Ans|Solution|Marking Scheme|ANSWER)[\s:]/im)
    const questionContent = answerSplit
      ? content.slice(0, content.indexOf(answerSplit[0])).trim()
      : content
    const answer = answerSplit
      ? content.slice(content.indexOf(answerSplit[0]) + answerSplit[0].length).trim()
      : null

    return {
      title: `${parseKeyword} ${exNum}`,
      content: questionContent,
      answer,
      questionType: detectQuestionType(questionContent),
      difficulty: 'MEDIUM',
    }
  }).filter(Boolean)
}

// Trong handler: gọi parseByHeadingKeyword thay cho parseByHeading2Example
if (!forceAI && docxBuffer && parseStyle !== 'ai') {
  const paragraphs = parseDocxParagraphs(docxBuffer)
  if (parseStyle === 'numbered') {
    rawQuestions = parseByNumberedList(paragraphs)
  } else {
    rawQuestions = parseByHeadingKeyword(paragraphs, headingStyles, keywordPattern)
  }
}

// Cho PDF/TXT: dùng text-based split thay vì chỉ DOCX
// Thêm: nếu rawQuestions còn = 0 VÀ không phải DOCX, thử text split
if (rawQuestions.length === 0 && !docxBuffer && parseStyle !== 'ai') {
  const text = await extractText(doc.filePath, doc.isManualInput, doc.content)
  rawQuestions = parseByTextSplit(text, keywordPattern)
}

// Thêm hàm parseByTextSplit cho PDF/TXT:
function parseByTextSplit(text: string, keywordPattern: RegExp): any[] {
  const lines = text.split('\n')
  const splitIndices = lines
    .map((l, i) => keywordPattern.test(l.trim()) ? i : -1)
    .filter(i => i !== -1)

  if (splitIndices.length === 0) return []

  return splitIndices.map((si, idx) => {
    const nextSi = idx + 1 < splitIndices.length ? splitIndices[idx + 1] : lines.length
    const content = lines.slice(si, nextSi).join('\n').trim()
    if (content.length < 30) return null
    const numMatch = lines[si].match(/\d+/)
    const exNum = numMatch ? parseInt(numMatch[0]) : idx + 1

    const answerSplit = content.match(/(?:^|\n)(Answer|Ans|Solution|Marking Scheme|ANSWER)[\s:]/im)
    const questionContent = answerSplit ? content.slice(0, content.indexOf(answerSplit[0])).trim() : content
    const answer = answerSplit ? content.slice(content.indexOf(answerSplit[0]) + answerSplit[0].length).trim() : null

    return {
      title: `${lines[si].trim()}`,
      content: questionContent,
      answer,
      questionType: detectQuestionType(questionContent),
      difficulty: 'MEDIUM',
    }
  }).filter(Boolean)
}
```

---

## Fix 3 — Session Setting: "Minimum mark per point"

### 3a. Migration — thêm vào Session model

**File:** `prisma/schema.prisma`:

```prisma
model Session {
  // ... existing fields ...
  minMarkPerPoint  Float @default(0.5)  // Minimum marks allocated per marking point
}
```

Chạy: `npx prisma migrate dev --name add_session_min_mark`

### 3b. UI — thêm vào Session settings page

**File:** `app/(dashboard)/exams/[projectId]/[sessionId]/settings/page.tsx` (hoặc tên tương tự)

Thêm input field:
```
"Minimum mark per point" — number input, step 0.25, min 0.25, max 2.0, default 0.5
Help text: "e.g. a 2-mark question can have up to 4 marking points (0.5 each), or 2 points (1.0 each)"
```

### 3c. Truyền `minMarkPerPoint` vào generate config

**File:** `app/api/sessions/[id]/generate-jobs/[jobId]/run/route.ts`

```typescript
// Sau khi fetch sessionData, thêm:
const minMarkPerPoint: number = (sessionData as any)?.minMarkPerPoint ?? 0.5

// Thêm vào generatorConfig:
minMarkPerPoint,
```

### 3d. Sửa prompt để dùng `minMarkPerPoint`

**File:** `lib/ai/prompts.ts`

Thêm `minMarkPerPoint` vào `ExamGenerationConfig` type:
```typescript
minMarkPerPoint?: number   // Minimum marks per marking point (default 0.5)
```

Trong `buildExamQuestionPrompt()`, tìm phần `calcMarksInstruction` hoặc `## GENERATION RULES`, thêm:

```typescript
const minMark = config.minMarkPerPoint ?? 0.5
const maxPoints = config.marksPerQuestion > 0
  ? Math.floor(config.marksPerQuestion / minMark)
  : 0

// Thêm vào GENERATION RULES section:
`MARK ALLOCATION RULES:
- Minimum ${minMark} marks per marking point
- A ${config.marksPerQuestion}-mark question can have at most ${maxPoints} marking points
- Each marking point in the marking scheme must be worth at least ${minMark} marks
- Distribute marks in multiples of ${minMark} (e.g. ${minMark}, ${minMark * 2}, ${minMark * 3})`
```

---

## Fix 4 — Session Variables: thêm `base_year`, chuyển `assumed_date` vào Generate dialog

### 4a. Seed default variables — thêm `base_year`

**File:** `app/api/sessions/[id]/variables/route.ts` (POST handler tạo session mới) hoặc nơi seed default variables

Thêm `base_year` vào default variables khi tạo session:
```typescript
{ varKey: 'base_year', varLabel: 'Base Year', varValue: new Date().getFullYear().toString(), varUnit: '', description: 'All exam dates fall within this calendar year (1 Jan to 31 Dec)' }
```

**Xóa** `assumed_date` khỏi default variables (sẽ chuyển vào Generate dialog).

### 4b. Truyền `base_year` vào prompt

**File:** `app/api/sessions/[id]/generate-jobs/[jobId]/run/route.ts`

Session variables đã được build vào `sessionVarsText` và truyền vào `otherContext`. Không cần thay đổi — AI sẽ thấy `Base Year: 2025` và tự áp dụng.

Tuy nhiên cần thêm instruction rõ hơn trong prompt:

**File:** `lib/ai/prompts.ts`

Thêm vào `ExamGenerationConfig`:
```typescript
assumedDate?: string   // e.g. "31 December 2025" — assumed date for this set of questions
```

Thêm vào `buildExamQuestionPrompt()` sau phần `languageInstruction`:
```typescript
const dateInstruction = config.assumedDate
  ? `ASSUMED DATE: All questions in this set assume today's date is ${config.assumedDate}. Use this for deadline calculations, tax periods, and filing dates.\n\n`
  : ''
```

### 4c. Thêm `assumed_date` vào Generate dialog

**File:** `app/(dashboard)/exams/[projectId]/[sessionId]/generate/page.tsx`

Thêm global field vào phần dưới (cùng chỗ với `extraInstructions`):

```typescript
// Thêm state:
const [assumedDate, setAssumedDate] = useState('')

// Thêm UI field (trước Generate button):
<div className="space-y-1">
  <Label className="text-xs font-semibold">
    Assumed date <span className="text-gray-400 font-normal">(optional, e.g. "31 December 2025")</span>
  </Label>
  <Input
    value={assumedDate}
    onChange={(e) => setAssumedDate(e.target.value)}
    placeholder="e.g. 31 December 2025"
    className="h-8 text-xs"
  />
  <p className="text-xs text-gray-400">AI will use this as "today's date" for deadline/period calculations</p>
</div>

// Trong payload gửi đi: thêm assumedDate vào sectionConfigs hoặc top-level config
// Trong generate-jobs/route.ts: lưu assumedDate trong config JSON
// Trong run/route.ts: truyền assumedDate vào generatorConfig
```

---

## Fix 5 — Generate output: bỏ Marking Scheme, cải thiện Answer explanation

### 5a. Sửa prompt output format

**File:** `lib/ai/prompts.ts`

Trong `## OUTPUT FORMAT` và `## GENERATION RULES`, thay đổi:

```typescript
// THAY phần markingScheme instruction bằng:
`ANSWER FORMAT RULES:
- markingScheme: REMOVE — do NOT include a separate marking scheme section
- modelAnswer: For CORRECT answer only: show brief step-by-step calculation (calculation questions)
  OR short explanation with regulation reference (theory questions). Keep it concise — 2-4 lines max.
  Format: use HTML only if ≥3 calculation rows need a table.
- optionExplanations (MCQ ONLY):
  - Correct option: brief calculation steps or short explanation + regulation ref if applicable
    e.g. "Tax = 500m × 20% = 100m (per Article 10, Decree 320/2025)" 
  - Wrong options (EACH): ONE sentence explaining WHY it is wrong
    e.g. "Incorrect rate: 22% applies to enterprises with revenue > 20 billion VND"
    e.g. "Missing: insurance deduction must be subtracted before applying tax rate"
  - NEVER use Step 1/Step 2 numbering — write inline
- modelAnswer: ONLY for non-MCQ questions. For MCQ, optionExplanations is sufficient.`
```

Trong OUTPUT FORMAT JSON example, **xóa** `"markingScheme"` field và **giữ** `"optionExplanations"`:

```typescript
// Thay JSON example:
`[
  {
    "stem": "Full question text with all data needed to answer.",
    "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
    "correctAnswer": "Exact correct option text",
    "optionExplanations": {
      "A": "Why A is wrong — one sentence",
      "B": "CORRECT — brief calculation: 500m × 20% = 100m (Art. 10, Decree 320/2025)",
      "C": "Why C is wrong — one sentence",
      "D": "Why D is wrong — one sentence"
    },
    "modelAnswer": null,
    "reference": "Article 10(2), Decree 320/2025/ND-CP",
    "syllabusCode": "C2d",
    "sampleRef": "Sample_MCQ_CIT.pdf",
    "topic": "CIT — Deductible expenses",
    "difficulty": "MEDIUM",
    "marks": 2
  }
]`
```

### 5b. Sửa Question Bank display — ẩn Marking Scheme, cải thiện layout

**File:** `app/(dashboard)/exams/[projectId]/[sessionId]/questions/page.tsx`

Trong `renderAnswerPanel()`:
- **Xóa** block hiển thị `markingScheme` (`{q.markingScheme && (<div>Marking Scheme...</div>)}`)
- **Giữ** `optionExplanations` per option (đã có)
- **Giữ** `modelAnswer` (chỉ dùng cho non-MCQ)
- **Giữ** syllabus badges và regulation refs

---

## Fix 6 — Generate page: chỉ hiển thị summary, không hiển thị câu hỏi

**File:** `app/(dashboard)/exams/[projectId]/[sessionId]/generate/page.tsx`

Trong phần `{/* Generated questions */}`, thay toàn bộ list questions bằng completion card:

```typescript
// THAY: danh sách câu hỏi
// BẰNG: chỉ hiển thị khi isDone

{isDone && !isGenerating && (
  <Card>
    <CardContent className="p-6 text-center space-y-3">
      <CheckCircle2 className="h-10 w-10 text-[#028a39] mx-auto" />
      <p className="text-base font-semibold text-[#028a39]">
        Generation complete — {progress} question{progress !== 1 ? 's' : ''} created
      </p>
      <p className="text-sm text-gray-500">
        Questions saved to the question bank.
      </p>
      <a
        href={`/exams/${projectId}/${sessionId}/questions`}
        className="inline-flex items-center gap-2 px-4 py-2 bg-[#028a39] text-white text-sm rounded hover:bg-[#026d2d] transition-colors"
      >
        <BookOpen className="h-4 w-4" />
        View Question Bank
      </a>
    </CardContent>
  </Card>
)}

// Xóa hoàn toàn: const [generated, setGenerated] = useState<GeneratedQuestion[]>([])
// Xóa: fetchRecentQuestions() function
// Xóa: rendered questions list
```

---

## Fix 7 — Questions: thêm `createdAt` và `generatedBy` (model name)

### 7a. Migration — thêm `generatedBy` vào Question model

**File:** `prisma/schema.prisma`:

```prisma
model Question {
  // ... existing ...
  generatedBy    String?   // AI model used, e.g. "deepseek:deepseek-reasoner"
  // createdAt đã có rồi ✓
}
```

Chạy: `npx prisma migrate dev --name add_question_generated_by`

### 7b. Lưu `generatedBy` khi tạo question

**File:** `app/api/sessions/[id]/generate-jobs/[jobId]/run/route.ts`

Trong `db.question.create()`, thêm:
```typescript
generatedBy: modelId || 'deepseek:deepseek-reasoner',
```

(Lấy `modelId` từ `sectionConfig.modelId` hoặc từ config level)

### 7c. Hiển thị trong Question Bank

**File:** `app/(dashboard)/exams/[projectId]/[sessionId]/questions/page.tsx`

Thêm field vào type `Question`:
```typescript
generatedBy: string | null
createdAt: string  // đã có trong DB
```

Trong question card header, thêm metadata:
```typescript
// Trong phần metadata badges (sau marks badge):
{q.createdAt && (
  <span className="text-xs text-gray-400" title={new Date(q.createdAt).toLocaleString()}>
    {formatRelativeTime(q.createdAt)}  {/* e.g. "2h ago", "Apr 23" */}
  </span>
)}
{q.generatedBy && (
  <span className="text-xs bg-gray-50 text-gray-400 px-1.5 rounded border border-gray-200 font-mono">
    {q.generatedBy.split(':').pop()}  {/* e.g. "deepseek-reasoner", "claude-haiku-4.5" */}
  </span>
)}
```

Thêm helper `formatRelativeTime`:
```typescript
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffH = Math.floor(diffMs / 3600000)
  const diffD = Math.floor(diffMs / 86400000)
  if (diffH < 1) return 'just now'
  if (diffH < 24) return `${diffH}h ago`
  if (diffD < 7) return `${diffD}d ago`
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
```

---

## Fix 8 — Question Bank: thêm filter theo Topics / Sub-topics

**File:** `app/(dashboard)/exams/[projectId]/[sessionId]/questions/page.tsx`

### 8a. Fetch topics trong useEffect

```typescript
// Thêm state:
const [allTopics, setAllTopics] = useState<{id: string; name: string; parentId: string | null}[]>([])
const [topicFilter, setTopicFilter] = useState('all')

// Trong fetchQuestions / useEffect, thêm:
const topicRes = await fetch(`/api/sessions/${params.sessionId}/topics`)
if (topicRes.ok) {
  const data = await topicRes.json()
  setAllTopics(data.filter((t: any) => !t.isOverall))
}
```

### 8b. Thêm topic filter vào filter bar

```typescript
// Trong phần filters (sau difficultyFilter Select):
<Select value={topicFilter} onValueChange={setTopicFilter}>
  <SelectTrigger className="w-44">
    <SelectValue placeholder="Topic" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">All topics</SelectItem>
    {allTopics
      .filter(t => !t.parentId)  // root topics first
      .map(rootTopic => (
        <React.Fragment key={rootTopic.id}>
          <SelectItem value={rootTopic.id}>{rootTopic.name}</SelectItem>
          {allTopics
            .filter(t => t.parentId === rootTopic.id)
            .map(sub => (
              <SelectItem key={sub.id} value={sub.id}>↳ {sub.name}</SelectItem>
            ))}
        </React.Fragment>
      ))}
  </SelectContent>
</Select>
```

### 8c. Áp dụng topic filter vào `filtered`

```typescript
// Tìm phần `const filtered = questions.filter(...)`, thêm điều kiện:
if (topicFilter !== 'all') {
  const selectedTopic = allTopics.find(t => t.id === topicFilter)
  if (selectedTopic) {
    // Match by topic name (vì question.topic là string, không phải ID)
    const matchNames = [selectedTopic.name]
    // Nếu là root topic, cũng include sub-topics của nó
    if (!selectedTopic.parentId) {
      allTopics
        .filter(t => t.parentId === selectedTopic.id)
        .forEach(sub => matchNames.push(sub.name))
    }
    if (!matchNames.some(name => 
      q.topic?.toLowerCase().includes(name.toLowerCase())
    )) return false
  }
}
```

---

## Prisma Migrations cần chạy (theo thứ tự)

```bash
# 1. Document parse config
npx prisma migrate dev --name add_document_parse_config

# 2. Session min mark + base_year seed
npx prisma migrate dev --name add_session_min_mark

# 3. Question generatedBy
npx prisma migrate dev --name add_question_generated_by

# Sau mỗi migration:
npx prisma generate
```

---

## Files cần sửa (tóm tắt)

| File | Fix |
|---|---|
| `prisma/schema.prisma` | Fix 2 (Document.parseKeyword/parseStyle), Fix 3 (Session.minMarkPerPoint), Fix 7 (Question.generatedBy) |
| `app/api/sessions/[id]/generate-jobs/route.ts` | Fix 1 (lưu đủ config) |
| `app/api/sessions/[id]/generate-jobs/[jobId]/run/route.ts` | Fix 1 (retry), Fix 3 (minMarkPerPoint), Fix 4 (base_year/assumedDate), Fix 7 (generatedBy) |
| `app/api/sessions/[id]/documents/[docId]/parse/route.ts` | Fix 2 (flexible parse) |
| `app/api/sessions/[id]/documents/[docId]/route.ts` | Fix 2 (PATCH save parseKeyword/parseStyle) |
| `lib/ai/prompts.ts` | Fix 3 (minMarkPerPoint prompt), Fix 4 (assumedDate), Fix 5 (bỏ markingScheme) |
| `app/(dashboard)/exams/.../generate/page.tsx` | Fix 4 (assumedDate field), Fix 6 (bỏ question list) |
| `app/(dashboard)/exams/.../questions/page.tsx` | Fix 5 (bỏ marking scheme display), Fix 7 (createdAt+model), Fix 8 (topic filter) |
| `app/(dashboard)/exams/.../documents/page.tsx` | Fix 2 (parse config UI) |

---

## KHÔNG thay đổi

- Module 2, Quiz, Gameshow — không đụng vào
- `lib/ai/index.ts` — không cần thay đổi
- Generate job caps trong `run/route.ts` — giữ nguyên 100K/40K/30K/15K

---

**Sau khi Claude Code implement và push → nhắn em để deploy + chạy migrations.**
