# BRIEF: Module 1 + Module 2 — Patch Round 3

**Repo:** phanvuhoang/testsgen

---

## MODULE 1

### Fix M1-A1: modelAnswer áp dụng cho cả MCQ (không chỉ non-MCQ)

**Vấn đề:** Prompt và UI hiện chỉ dùng `modelAnswer` cho non-MCQ. Với MCQ, AI cũng nên trả `modelAnswer` chứa detailed working/explanation cho correct answer.

**File A: `lib/ai/prompts.ts`**

Tìm các dòng sau và sửa:

```typescript
// Tìm (trong ANSWER FORMAT RULES và OUTPUT FORMAT):
// "modelAnswer (non-MCQ only): ..."
// "modelAnswer": null,   ← trong JSON example cho MCQ

// Thay thành:
// modelAnswer: For ALL question types (including MCQ):
//   - MCQ: detailed worked solution for the correct answer (calculation steps or explanation + regulation ref).
//     Keep concise — 3-6 lines. Use HTML table only if ≥3 calc rows.
//   - SCENARIO/ESSAY/CASE_STUDY: full worked solution with all parts (a)(b)(c)
//   - SHORT_ANSWER: concise answer
//   NEVER null — always provide modelAnswer.
```

Cụ thể, trong phần `## ANSWER FORMAT RULES`:
```
ANSWER FORMAT RULES:
- markingScheme: do NOT include
- modelAnswer: REQUIRED for ALL question types including MCQ.
  MCQ: show worked solution for correct answer (e.g. "Tax = 500m × 20% = 100m per Art.10, Decree 320/2025")
  SCENARIO/ESSAY: full multi-part solution with calc tables where needed
  SHORT_ANSWER: concise 1-3 sentence answer
  Format: plain text or HTML — use <table> only if ≥3 calculation rows
- optionExplanations (MCQ): keep as-is (per-option brief explanations)
```

Trong `## OUTPUT FORMAT` JSON example, sửa `modelAnswer` field:
```json
"modelAnswer": "Worked solution: [Tax base] = Revenue - Deductible expenses = 10,000m - 7,500m = 2,500m. Tax = 2,500m × 20% = 500m (per Art.10(1), Decree 320/2025/ND-CP)"
```
(Remove "null" as example value — always non-null)

**File B: `app/(dashboard)/exams/[projectId]/[sessionId]/questions/page.tsx`**

Trong `renderAnswerPanel()`, sửa block modelAnswer để hiển thị cho cả MCQ:
```typescript
// Tìm:
{q.modelAnswer && (
  <div className="p-3 bg-gray-50 border border-gray-200 rounded">
    <p className="text-xs font-semibold mb-2 text-gray-700">Model Answer</p>
    ...
  </div>
)}

// Thay label thành "Worked Solution" và hiển thị cho tất cả:
{q.modelAnswer && (
  <div className="p-3 bg-amber-50 border border-amber-100 rounded">
    <p className="text-xs font-semibold mb-2 text-amber-900 flex items-center gap-1">
      <BookOpen className="h-3 w-3" />Worked Solution
    </p>
    <div
      className="text-amber-900 text-xs [&_table]:border-collapse [&_table]:w-full [&_th]:border [&_th]:border-amber-200 [&_th]:bg-amber-100 [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-amber-100 [&_td]:px-2 [&_td]:py-1"
      dangerouslySetInnerHTML={{ __html: renderAnswerContent(q.modelAnswer) }}
    />
  </div>
)}
```

---

### Fix M1-A2: Parse document — 3 sub-fixes

#### M1-A2a: Xóa Project-level parsePattern hoàn toàn

**File:** `app/(dashboard)/exams/[projectId]/page.tsx`

Xóa dòng import và render:
```typescript
// XÓA:
import { ParsePatternSetting } from '@/components/parse-pattern-setting'
// XÓA:
<ParsePatternSetting projectId={project.id} initial={project.parsePattern || 'HEADING2_EXAMPLE'} />
```

**File:** `app/api/sessions/[id]/documents/[docId]/parse/route.ts`

Trong `parseWithAI()`, xóa toàn bộ đoạn đọc `project.parsePattern`:
```typescript
// XÓA:
const session = await (db as any).session.findUnique({
  where: { id: sessionId },
  include: { project: { select: { parsePattern: true } } }
})
const patternHint = session?.project?.parsePattern || 'HEADING2_EXAMPLE'
let patternNote = ''
if (patternHint === 'HEADING2_EXAMPLE') { ... }
else if (patternHint === 'NUMBERED_LIST') { ... }
```

Thay bằng: patternNote tự build từ `parseKeyword` và `parseStyle` được truyền vào `parseWithAI`:

```typescript
// Sửa signature của parseWithAI:
async function parseWithAI(
  text: string,
  sessionId: string,
  parseKeyword: string = 'Example',
  parseNumber: boolean = true
): Promise<any[]> {
  const patternNote = `Questions are separated by the keyword "${parseKeyword}${parseNumber ? ' <number>' : ''}:" (e.g. "${parseKeyword} 1:", "${parseKeyword} 2:").`
  // ... rest of function
}

// Cập nhật tất cả chỗ gọi parseWithAI để truyền parseKeyword, parseNumber
rawQuestions = await parseWithAI(text, params.id, parseKeyword, parseNumber)
```

#### M1-A2b: Fix DOCX binary error khi AI parse

**Vấn đề:** Khi `forceAI=true` (AI fallback), code gọi `extractText()` → `extractDocxText()` → parse binary ZIP với regex → AI nhận garbage text và báo "binary file".

**Fix:** Dùng `mammoth` để extract text từ DOCX (đã có trong dependencies), thay cho `extractDocxText()` hack.

**File:** `app/api/sessions/[id]/documents/[docId]/parse/route.ts`

Sửa hàm `extractText()`:
```typescript
async function extractText(filePath: string, isManualInput: boolean, content: string | null): Promise<string> {
  if (isManualInput) return content || ''
  try {
    const fullPath = join(process.cwd(), 'public', filePath)
    const buffer = await readFile(fullPath)
    const ext = filePath.toLowerCase()

    if (ext.endsWith('.txt')) return buffer.toString('utf-8')

    if (ext.endsWith('.pdf')) {
      try {
        const pdfParse = require('pdf-parse')
        const data = await pdfParse(buffer)
        return data.text
      } catch {
        return buffer.toString('utf-8')
      }
    }

    if (ext.endsWith('.docx') || ext.endsWith('.doc')) {
      try {
        // Use mammoth for clean DOCX text extraction
        const mammoth = require('mammoth')
        const result = await mammoth.extractRawText({ buffer })
        return result.value ?? ''
      } catch {
        // Last resort: strip XML tags
        return buffer.toString('utf-8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      }
    }

    return buffer.toString('utf-8')
  } catch (e) {
    console.error('[parse] extractText error', e)
    return ''
  }
}
```

Xóa hàm `extractDocxText()` cũ (không dùng nữa).

Cũng sửa flow trong `POST` handler — khi `forceAI=true` và là DOCX, nên thử structural parse trước rồi mới AI:
```typescript
// Trong POST handler, sửa flow:
let rawQuestions: any[] = []

// LUÔN thử structural parse trước (nếu có docxBuffer và không phải parseStyle='ai')
if (docxBuffer && parseStyle !== 'ai') {
  const paragraphs = parseDocxParagraphs(docxBuffer)
  if (parseStyle === 'numbered') {
    rawQuestions = parseByNumberedList(paragraphs)
  } else {
    rawQuestions = parseByHeadingKeyword(paragraphs, headingStyles, keywordPattern, parseKeyword)
  }
}

// Nếu structural parse cho 0 kết quả → thử text-based split (cho PDF/TXT)
if (rawQuestions.length === 0 && !docxBuffer && parseStyle !== 'ai') {
  const text = await extractText(doc.filePath, doc.isManualInput, doc.content)
  rawQuestions = parseByTextSplit(text, keywordPattern, parseKeyword)
}

// Nếu vẫn 0 hoặc forceAI/ai mode → dùng AI với text đúng (mammoth cho DOCX)
if (rawQuestions.length === 0 || parseStyle === 'ai' || forceAI) {
  const text = await extractText(doc.filePath, doc.isManualInput, doc.content)
  if (!text || text.trim().length < 10) {
    return NextResponse.json({ error: 'No text content found in document', parsed: [], count: 0 })
  }
  rawQuestions = await parseWithAI(text, params.id, parseKeyword, parseNumber)
}
```

#### M1-A2c: Parse button — always-visible, opens config dialog, re-parse clears old

**File:** `app/(dashboard)/exams/[projectId]/[sessionId]/documents/page.tsx`

**Thay đổi UX:**
- Nút Parse 🧩 luôn hiển thị (không disappear sau khi parse lần đầu)
- Click nút Parse → mở **Dialog** (modal) chứa parse config
- Dialog hiển thị: keyword input, "with number" checkbox, style select
- Dialog có nút "Parse Now" → save config + delete old parsed questions + parse lại
- Sau khi parse xong: hiển thị count badge cạnh nút (e.g., "15 parsed")

```typescript
// Thêm state:
const [parseDialogDocId, setParseDialogDocId] = useState<string | null>(null)
const [dialogParseKeyword, setDialogParseKeyword] = useState('Example')
const [dialogParseNumber, setDialogParseNumber] = useState(true)
const [dialogParseStyle, setDialogParseStyle] = useState('Heading2')
const [isParsing, setIsParsing] = useState(false)
const [parseCounts, setParseCounts] = useState<Record<string, number>>({})  // docId → count

// Fetch initial parse counts khi load page:
useEffect(() => {
  // fetch /api/sessions/[id]/parsed-questions?countByDoc=true
  // hoặc tính từ existing parsedQuestions list nếu đã fetch
}, [])

// Sửa handleParseDocument thành openParseDialog:
const openParseDialog = (doc: Document) => {
  setParseDialogDocId(doc.id)
  setDialogParseKeyword(doc.parseKeyword || 'Example')
  setDialogParseNumber(doc.parseNumber ?? true)
  setDialogParseStyle(doc.parseStyle || 'Heading2')
}

const handleParseConfirm = async () => {
  if (!parseDialogDocId) return
  setIsParsing(true)
  try {
    // 1. Save parse config to document
    await fetch(`/api/sessions/${params.sessionId}/documents/${parseDialogDocId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parseKeyword: dialogParseKeyword,
        parseNumber: dialogParseNumber,
        parseStyle: dialogParseStyle,
      }),
    })
    // 2. Call parse API (always try structural first, AI as fallback)
    const res = await fetch(`/api/sessions/${params.sessionId}/documents/${parseDialogDocId}/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        useAI: true,   // AI fallback if structural fails
        parseKeyword: dialogParseKeyword,
        parseNumber: dialogParseNumber,
        parseStyle: dialogParseStyle,
      }),
    })
    const data = await res.json()
    if (!res.ok || data.error) throw new Error(data.error || 'Parse failed')
    setParseCounts(prev => ({ ...prev, [parseDialogDocId]: data.count ?? 0 }))
    toast({ title: `✅ Parsed ${data.count} questions`, description: data.count === 0 ? 'No questions found — try different settings' : 'View in Samples tab' })
    setParseDialogDocId(null)
  } catch (e) {
    toast({ title: 'Parse failed', description: String(e), variant: 'destructive' })
  } finally {
    setIsParsing(false)
  }
}

// Nút Parse trong document list (LUÔN hiển thị với SAMPLE_QUESTIONS):
{doc.fileType === 'SAMPLE_QUESTIONS' && (
  <Button
    variant="ghost"
    size="icon"
    className="h-8 w-8 text-gray-400 hover:text-purple-600"
    title={parseCounts[doc.id] ? `Re-parse (${parseCounts[doc.id]} parsed)` : 'Parse into questions'}
    onClick={() => openParseDialog(doc)}
  >
    <BookOpen className="h-4 w-4" />
    {parseCounts[doc.id] > 0 && (
      <span className="absolute -top-1 -right-1 bg-purple-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center">
        {parseCounts[doc.id] > 99 ? '99+' : parseCounts[doc.id]}
      </span>
    )}
  </Button>
)}

// Dialog component (thêm trước closing </div> của page):
<Dialog open={!!parseDialogDocId} onOpenChange={v => !v && setParseDialogDocId(null)}>
  <DialogContent className="max-w-sm">
    <DialogHeader>
      <DialogTitle>Parse Document into Questions</DialogTitle>
    </DialogHeader>
    <div className="space-y-3 py-2">
      <div className="space-y-1">
        <Label className="text-xs font-semibold">Question start keyword</Label>
        <Input
          value={dialogParseKeyword}
          onChange={e => setDialogParseKeyword(e.target.value)}
          placeholder="Example"
          className="h-8 text-xs"
        />
        <p className="text-xs text-gray-400">e.g. "Example", "Question", "Exercise", "Câu"</p>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="dialogParseNumber"
          checked={dialogParseNumber}
          onCheckedChange={v => setDialogParseNumber(!!v)}
        />
        <Label htmlFor="dialogParseNumber" className="text-xs cursor-pointer">
          Followed by a number (e.g. "Example 1")
        </Label>
      </div>
      <div className="space-y-1">
        <Label className="text-xs font-semibold">DOCX heading style</Label>
        <Select value={dialogParseStyle || 'none'} onValueChange={v => setDialogParseStyle(v === 'none' ? '' : v)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None (keyword match only)</SelectItem>
            <SelectItem value="Heading1">Heading 1</SelectItem>
            <SelectItem value="Heading2">Heading 2</SelectItem>
            <SelectItem value="Heading3">Heading 3</SelectItem>
            <SelectItem value="numbered">Numbered list (1. 2. 3.)</SelectItem>
            <SelectItem value="ai">AI parse only (slowest, most accurate)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-gray-400">For PDF/TXT, heading style is ignored — keyword matching is used.</p>
      </div>
      {parseCounts[parseDialogDocId ?? ''] > 0 && (
        <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
          ⚠️ This will replace {parseCounts[parseDialogDocId ?? '']} previously parsed questions.
        </p>
      )}
    </div>
    <div className="flex gap-2 justify-end">
      <Button variant="outline" size="sm" onClick={() => setParseDialogDocId(null)}>Cancel</Button>
      <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-white" onClick={handleParseConfirm} disabled={isParsing}>
        {isParsing ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Parsing...</> : 'Parse Now'}
      </Button>
    </div>
  </DialogContent>
</Dialog>
```

---

### Fix M1-A3: Claudible model — không fix cứng, dùng CLAUDIBLE_MODEL env

**Vấn đề:** `parseModelId('claudible:claude-haiku-4.5')` extract `model = 'claude-haiku-4.5'` trực tiếp từ string ID — bỏ qua `CLAUDIBLE_MODEL` env var. Nên khi anh set `CLAUDIBLE_MODEL=claude-sonnet-4.6` thì vẫn dùng haiku.

**File:** `lib/ai/index.ts`

Sửa `parseModelId()` để khi provider là `claudible`, luôn dùng env var:
```typescript
export function parseModelId(modelId: string): { provider: string; model: string } {
  const idx = modelId.indexOf(':')
  if (idx === -1) return { provider: 'deepseek', model: modelId }
  const provider = modelId.slice(0, idx)
  const modelFromId = modelId.slice(idx + 1)

  // For claudible: always use CLAUDIBLE_MODEL env var if set, ignoring the ID string
  if (provider === 'claudible') {
    return { provider: 'claudible', model: process.env.CLAUDIBLE_MODEL || modelFromId }
  }

  return { provider, model: modelFromId }
}
```

Cũng sửa label trong `getAvailableModels()` để reflect env var:
```typescript
{
  id: 'claudible:claude-haiku-4.5',
  label: `Claudible (${process.env.CLAUDIBLE_MODEL || 'claude-haiku-4.5'})`,
  provider: 'claudible',
  model: process.env.CLAUDIBLE_MODEL || 'claude-haiku-4.5',
},
```

Và trong `parseWithAI()` trong `parse/route.ts`:
```typescript
// Tìm:
model = process.env.CLAUDIBLE_MODEL || 'claude-haiku-4.5'
// Giữ nguyên — đây đã đúng
```

---

### Fix M1-A4: VND unit — đảm bảo prompt instruction đủ mạnh

**Vấn đề:** `vndUnitInstruction` đã build đúng nhưng AI vẫn dùng absolute VND. Cần thêm instruction mạnh hơn vào CRITICAL rules (không chỉ ở phần parameters).

**File:** `lib/ai/prompts.ts`

Trong `antiHallucinationRules` (hoặc ngay sau đó), thêm VND enforcement:
```typescript
// Sau antiHallucinationRules block, thêm:
const vndEnforcementRule = (config.vndUnit && config.vndUnit !== 'vnd')
  ? `\n## CRITICAL: CURRENCY FORMAT\nALL monetary amounts in VND MUST be expressed in ${vndUnitLabel}.\nNEVER write raw VND figures like "1,000,000,000 VND" or "VND 500,000,000".\n${
      config.vndUnit === 'million'
        ? 'CORRECT: "500 million VND" or "VND 500m" or just "500" (context clear). WRONG: "500,000,000 VND".'
        : 'CORRECT: "500,000 (thousand VND)". WRONG: "500,000,000 VND".'
    }\n`
  : ''
```

Thêm `vndEnforcementRule` vào return string ngay sau `antiHallucinationRules`:
```typescript
return `${personaLine}

${antiHallucinationRules}
${vndEnforcementRule}
${sourceDocumentsBlock}
...
```

---

### Fix M1-A5: Bold "Question:" label trong stem display

**File:** `app/(dashboard)/exams/[projectId]/[sessionId]/questions/page.tsx`

Trong phần hiển thị full stem (expanded view), thay plain text bằng renderer hiểu `Case:` / `Question:` labels:

```typescript
// Tìm (trong expanded content):
{/* Full stem */}
<p className="text-sm whitespace-pre-wrap">{q.stem}</p>

// Thay bằng:
<div className="text-sm whitespace-pre-line">
  {q.stem.split('\n').map((line, i) => {
    const caseMatch = line.match(/^(Case:\s*)(.*)/i)
    const questionMatch = line.match(/^(Question:\s*)(.*)/i)
    if (caseMatch) {
      return (
        <p key={i} className="mb-2">
          <span className="font-semibold text-gray-500 text-xs uppercase tracking-wide">Case: </span>
          <span>{caseMatch[2]}</span>
        </p>
      )
    }
    if (questionMatch) {
      return (
        <p key={i} className="mt-2 font-semibold">
          <span className="text-[#028a39] font-bold">Question: </span>
          <span className="font-bold">{questionMatch[2]}</span>
        </p>
      )
    }
    return <p key={i}>{line || '\u00a0'}</p>
  })}
</div>
```

Cũng trong question card header (preview line clamp), áp dụng tương tự nếu stem starts with "Case:":
```typescript
// Tìm:
<p className="text-sm font-medium line-clamp-2">{q.stem}</p>

// Thay: strip "Case: ... \n\nQuestion: " prefix để chỉ show Question part trong preview
<p className="text-sm font-medium line-clamp-2">
  {q.stem.replace(/^Case:[\s\S]*?Question:\s*/i, '').trim() || q.stem}
</p>
```

---

## MODULE 2

### Fix M2-B1: Claudible model trong Module 2 — check và fix nếu hardcoded

**File:** `lib/ai/index.ts`

Fix ở M1-A3 (`parseModelId`) sẽ fix cho cả Module 2 vì Module 2 dùng cùng `generateQuizQuestions()` → `parseModelId()`. ✓

Tuy nhiên cần kiểm tra thêm: trong `app/(dashboard)/quiz/[quizId]/questions/page.tsx`, model dropdown hiện tại có label "Claudible Haiku 4.5". Sau fix M1-A3, actual model sẽ theo `CLAUDIBLE_MODEL` env dù UI label vẫn hiển thị "Haiku". Sửa label để dynamic:

```typescript
// Tìm trong SelectContent (module 2 generate panel):
<SelectItem value="claudible:claude-haiku-4.5">Claudible Haiku 4.5 (Default)</SelectItem>

// Thay:
<SelectItem value="claudible:claude-haiku-4.5">
  Claudible ({process.env.CLAUDIBLE_MODEL || 'claude-haiku-4.5'}) (Default)
</SelectItem>
```

**Lưu ý:** Vì đây là client component, `process.env` chỉ work với `NEXT_PUBLIC_` prefix. Thay vào đó, gọi `/api/ai-models` để lấy label:

Module 2 UI đã có `const gen = generateQuizQuestions(config, modelId)` và `modelId` được build từ `selectedModel` state. Sau fix `parseModelId`, flow sẽ tự đúng — không cần thêm gì cho actual model routing. ✓

Chỉ cần sửa **label hiển thị** cho đúng thực tế: API `/api/ai-models` đã trả label dynamic từ `getAvailableModels()`. Module 2 UI đã fetch models (`fetch('/api/ai-models')`). Đảm bảo label từ API được dùng để render SelectItem thay vì hardcoded string.

Trong `app/(dashboard)/quiz/[quizId]/questions/page.tsx`:
```typescript
// Thay hardcoded SelectItem options bằng dynamic từ aiModels state:
// (Module 2 cần fetch /api/ai-models tương tự Module 1)

// Thêm state:
const [aiModels, setAiModels] = useState<{id: string; label: string}[]>([])

// Trong useEffect fetch:
fetch('/api/ai-models').then(r => r.json()).then(setAiModels).catch(() => {})

// Trong SelectContent — thay hardcoded items:
{aiModels.length > 0
  ? aiModels.map(m => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)
  : (
    <>
      <SelectItem value="claudible:claude-haiku-4.5">Claudible Haiku (Default)</SelectItem>
      <SelectItem value="deepseek:deepseek-reasoner">DeepSeek Reasoner</SelectItem>
    </>
  )
}
```

---

### Fix M2-B2: Module 2 Question Bank — bulk select + delete

**File:** `app/(dashboard)/quiz/[quizId]/questions/page.tsx`

Thêm bulk select/delete vào danh sách questions (phần cuối page, nơi questions được render dạng list/card):

```typescript
// Thêm state:
const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set())
const [isBulkDeleting, setIsBulkDeleting] = useState(false)

// Hàm toggle select:
const toggleBulkSelect = (id: string) => {
  setBulkSelectedIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
}

const toggleSelectAll = () => {
  if (bulkSelectedIds.size === questions.length) {
    setBulkSelectedIds(new Set())
  } else {
    setBulkSelectedIds(new Set(questions.map(q => q.id)))
  }
}

const handleBulkDelete = async () => {
  if (bulkSelectedIds.size === 0) return
  if (!confirm(`Delete ${bulkSelectedIds.size} questions?`)) return
  setIsBulkDeleting(true)
  try {
    await Promise.all(
      Array.from(bulkSelectedIds).map(id =>
        fetch(`/api/quiz-sets/${params.quizId}/questions/${id}`, { method: 'DELETE' })
      )
    )
    setQuestions(prev => prev.filter(q => !bulkSelectedIds.has(q.id)))
    setBulkSelectedIds(new Set())
    toast({ title: `Deleted ${bulkSelectedIds.size} questions` })
  } catch {
    toast({ title: 'Delete failed', variant: 'destructive' })
  } finally {
    setIsBulkDeleting(false)
  }
}

// Trong JSX — thêm header row với Select All + bulk action bar:
// (đặt ngay trước list questions, sau filters)

{/* Select All + Bulk actions */}
<div className="flex items-center gap-3 py-2">
  <Checkbox
    checked={questions.length > 0 && bulkSelectedIds.size === questions.length}
    onCheckedChange={toggleSelectAll}
  />
  <span className="text-xs text-gray-500">
    {bulkSelectedIds.size > 0 ? `${bulkSelectedIds.size} selected` : 'Select all'}
  </span>
  {bulkSelectedIds.size > 0 && (
    <Button
      size="sm"
      variant="outline"
      className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
      onClick={handleBulkDelete}
      disabled={isBulkDeleting}
    >
      {isBulkDeleting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Trash2 className="h-3 w-3 mr-1" />}
      Delete {bulkSelectedIds.size}
    </Button>
  )}
</div>

// Trong mỗi question card/row, thêm Checkbox bên trái:
<Checkbox
  checked={bulkSelectedIds.has(q.id)}
  onCheckedChange={() => toggleBulkSelect(q.id)}
  onClick={e => e.stopPropagation()}
  className="shrink-0 mt-0.5"
/>
```

---

## Files cần sửa

| File | Fixes |
|---|---|
| `lib/ai/prompts.ts` | M1-A1 (modelAnswer for MCQ), M1-A4 (VND enforcement) |
| `lib/ai/index.ts` | M1-A3 (parseModelId claudible env), M2-B1 (dynamic model label) |
| `app/(dashboard)/exams/.../questions/page.tsx` | M1-A1 (Worked Solution display), M1-A5 (Case/Question bold) |
| `app/(dashboard)/exams/.../documents/page.tsx` | M1-A2c (parse dialog, always-visible button, parse counts) |
| `app/api/sessions/[id]/documents/[docId]/parse/route.ts` | M1-A2a (remove project parsePattern), M1-A2b (mammoth DOCX fix, flow fix) |
| `app/(dashboard)/exams/[projectId]/page.tsx` | M1-A2a (remove ParsePatternSetting component) |
| `app/(dashboard)/quiz/[quizId]/questions/page.tsx` | M2-B1 (dynamic model fetch), M2-B2 (bulk select/delete) |

---

## KHÔNG thay đổi

- Schema Prisma — không cần migration mới
- `app/api/quiz-sets/[id]/generate/route.ts` — không cần sửa
- Module 2 generate flow — fix M1-A3 tự fix luôn Module 2

---

**Sau khi Claude Code push → nhắn em deploy.**
