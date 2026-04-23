# BRIEF: Patch Round 4 — Parse Fix, Answer Format, Manual Page, Excluding Issues, WWTBAM, Multi-model

**Repo:** phanvuhoang/testsgen

---

## MODULE 1

### Fix M1-1: Parse document — rewrite parseDocxParagraphs dùng proper XML (port từ examsgen)

**Root cause:** `parseDocxParagraphs()` dùng `buffer.toString('binary')` rồi regex trên binary string — cực kỳ fragile, không reliable với các DOCX thực tế. examsgen dùng `zipfile` + `xml.etree.ElementTree` — ta port sang TypeScript dùng `AdmZip` (hoặc `node-zip`) + built-in XML parser.

**File:** `app/api/sessions/[id]/documents/[docId]/parse/route.ts`

**Thay toàn bộ** hàm `parseDocxParagraphs()` bằng version dùng proper ZIP + XML:

```typescript
import { DOMParser } from '@xmldom/xmldom'
// hoặc dùng fast-xml-parser (đã có trong nhiều Next.js projects)
// Nếu không có: dùng regex nhưng đúng cách (xem bên dưới)

function parseDocxParagraphsProper(buffer: Buffer): { style: string; text: string }[] {
  try {
    // DOCX là ZIP file — dùng JSZip hoặc AdmZip để unzip
    // Vì project đã có 'mammoth' (dùng adm-zip internally), ta dùng mammoth cho text
    // Nhưng cho structural parse (style-aware), ta cần XML
    // Approach: dùng built-in zlib/unzip via 'yauzl' hoặc đọc trực tiếp bằng regex đúng hơn

    // === APPROACH: Dùng string search tốt hơn ===
    // DOCX ZIP có entry 'word/document.xml' ở dạng text thuần sau khi unzip
    // Ta dùng Node.js built-in để đọc ZIP entry

    // Try with adm-zip (available via mammoth dependency or install separately)
    const AdmZip = require('adm-zip')
    const zip = new AdmZip(buffer)
    const xmlEntry = zip.getEntry('word/document.xml')
    if (!xmlEntry) return []
    const xmlContent = xmlEntry.getData().toString('utf-8')

    const paragraphs: { style: string; text: string }[] = []

    // Parse paragraphs using regex on clean XML text (not binary)
    const paraRegex = /<w:p[ >][\s\S]*?<\/w:p>/g
    let pm: RegExpExecArray | null
    while ((pm = paraRegex.exec(xmlContent)) !== null) {
      const paraXml = pm[0]
      // Extract pStyle
      const pStyleMatch = paraXml.match(/<w:pStyle\s+w:val="([^"]+)"/)
      const style = pStyleMatch ? pStyleMatch[1] : ''
      // Extract all <w:t> text nodes
      const textMatches = Array.from(paraXml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g))
      const text = textMatches.map((m: RegExpMatchArray) => m[1]).join('').trim()
      if (text) paragraphs.push({ style, text })
    }
    return paragraphs
  } catch (e) {
    console.error('[parseDocxParagraphsProper] error:', e)
    return []
  }
}
```

**Nếu `adm-zip` chưa có trong package.json**, thêm vào dependencies:
```json
"adm-zip": "^0.5.10"
```
và chạy `npm install adm-zip`.

**Thay tất cả** chỗ gọi `parseDocxParagraphs(docxBuffer)` bằng `parseDocxParagraphsProper(docxBuffer)`.

**Xóa** hàm `parseDocxParagraphs()` cũ.

---

### Fix M1-1b: Parse — thêm special character field sau "Followed by a number"

**File:** `app/(dashboard)/exams/[projectId]/[sessionId]/documents/page.tsx`

Trong parse dialog, sau checkbox "Followed by a number", thêm:

```typescript
// Thêm state:
const [dialogParseSuffix, setDialogParseSuffix] = useState(':')

// UI — thêm sau checkbox "Followed by a number":
<div className="flex items-center gap-2">
  <Checkbox
    id="dialogParseSuffix"
    checked={dialogParseSuffix !== ''}
    onCheckedChange={v => setDialogParseSuffix(v ? ':' : '')}
  />
  <Label htmlFor="dialogParseSuffix" className="text-xs cursor-pointer">And</Label>
  <Input
    value={dialogParseSuffix}
    onChange={e => setDialogParseSuffix(e.target.value)}
    className="h-7 w-16 text-xs"
    placeholder=":"
    disabled={dialogParseSuffix === '' && false}
  />
  <span className="text-xs text-gray-400">suffix (e.g. ":")</span>
</div>

// Preview line update:
<p className="text-xs text-gray-400">
  Pattern: "{dialogParseKeyword}{dialogParseNumber ? ' <N>' : ''}{dialogParseSuffix}"
  → e.g. "{dialogParseKeyword} 1{dialogParseSuffix}"
</p>
```

Truyền `parseSuffix` vào API call và save vào document:
```typescript
// Trong handleParseConfirm, thêm parseSuffix:
body: JSON.stringify({
  useAI: true,
  parseKeyword: dialogParseKeyword,
  parseNumber: dialogParseNumber,
  parseStyle: dialogParseStyle,
  parseSuffix: dialogParseSuffix,  // ← thêm
})

// Cũng PATCH document để save config:
body: JSON.stringify({
  parseKeyword: dialogParseKeyword,
  parseNumber: dialogParseNumber,
  parseStyle: dialogParseStyle,
  parseSuffix: dialogParseSuffix,  // ← thêm
})
```

**File:** `prisma/schema.prisma` — thêm `parseSuffix` vào Document:
```prisma
parseSuffix     String?   @default(":")   // e.g. ":" → "Example 1:"
```

**File:** `app/api/sessions/[id]/documents/[docId]/parse/route.ts`

Build regex dùng suffix:
```typescript
const parseSuffix: string = body.parseSuffix ?? (doc as any).parseSuffix ?? ':'
const escapedSuffix = parseSuffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')  // regex escape

const keywordPattern = parseNumber
  ? new RegExp(`^${parseKeyword}\\s+\\d+\\s*${escapedSuffix}`, 'i')
  : new RegExp(`^${parseKeyword}\\s*${escapedSuffix}`, 'i')
```

---

### Fix M1-2: Answer/Explanation format — bảng và bullet points

**File:** `lib/ai/prompts.ts`

Trong `buildExamQuestionPrompt()`, sửa `## ANSWER FORMAT RULES`:

```typescript
// Thay:
`ANSWER FORMAT RULES:
- modelAnswer: REQUIRED for ALL question types...`

// Bằng:
`ANSWER FORMAT RULES:
- markingScheme: do NOT include
- modelAnswer: REQUIRED for ALL question types including MCQ.

  FOR MCQ — format modelAnswer as an HTML table:
  <table>
    <tr><th style="width:60px">Step</th><th>Working</th><th style="width:80px">Amount</th></tr>
    <tr><td>1</td><td>Description of step</td><td>XXX million VND</td></tr>
    ...
    <tr><td><b>Answer</b></td><td>Brief conclusion</td><td><b>XXX</b></td></tr>
  </table>
  If pure theory (no calculation): write 2-4 sentences with regulation reference.

  FOR SCENARIO/ESSAY/CASE_STUDY — format as HTML with:
  - Each part (a)(b)(c) as <p><b>(a) Part title</b></p>
  - Calculation steps as <table> (same format as above)
  - Brief conclusion per part

  FOR SHORT_ANSWER — 1-3 sentences, plain text or short HTML.

- optionExplanations (MCQ only):
  - Correct option: "✓ CORRECT — [one-line explanation or key calc, e.g. '500m × 20% = 100m (Art.10, Decree 320)']"
  - Wrong options: EACH on separate line. Include brief working if calculation:
    "✗ [Why wrong]. [Working if applicable, e.g. '22% rate applies only to enterprises >20bn VND revenue']"
  - Format: plain text per option (NOT HTML in optionExplanations)
  - NEVER say "See uploaded regulations" — always explain specifically`
```

**File:** `app/(dashboard)/exams/[projectId]/[sessionId]/questions/page.tsx`

Trong `renderAnswerPanel()`, sửa render `optionExplanations` để tách dòng và dùng icon:

```typescript
// Tìm block render optionExplanations (per MCQ option)
// Sửa để render mỗi option explanation với line-break và ✓/✗ icon

// Trong block hiển thị options + explanations:
{q.options && optExp && (
  <div className="space-y-1.5 mt-2">
    {q.options.map((opt, i) => {
      const letter = ['A','B','C','D','E'][i]
      const exp = optExp[letter] || optExp[opt] || ''
      const isCorrect = opt === q.correctAnswer
      return (
        <div key={i} className={`p-2 rounded text-xs border ${isCorrect ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
          <div className="flex items-start gap-2">
            <span className={`font-bold shrink-0 ${isCorrect ? 'text-green-700' : 'text-gray-500'}`}>
              {isCorrect ? '✓' : '✗'} {letter}.
            </span>
            <div>
              <span className={`font-medium ${isCorrect ? 'text-green-800' : 'text-gray-700'}`}>{opt}</span>
              {exp && <p className={`mt-0.5 ${isCorrect ? 'text-green-700' : 'text-gray-500'}`}>{exp}</p>}
            </div>
          </div>
        </div>
      )
    })}
  </div>
)}
```

---

### Fix M1-3: "Excluding issues" — per-question và per-session

#### M1-3a: Per-question "Excluding issue(s)" trong Generate page

**File:** `app/(dashboard)/exams/[projectId]/[sessionId]/generate/page.tsx`

Trong section config (cạnh "About issue(s)"), thêm input "Excluding issue(s)":

```typescript
// Thêm vào sectionConfig type và state:
excludingIssues: ''   // comma-separated

// UI — sau "About issue(s)" input:
<div className="space-y-1">
  <Label className="text-xs text-gray-500">
    Excluding issue(s){' '}
    <span className="font-normal text-gray-400">(comma-separated — DO NOT test these)</span>
  </Label>
  <Input
    className="h-7 text-xs"
    value={cfg.excludingIssues}
    onChange={(e) => updateConfig(sec.id, { excludingIssues: e.target.value })}
    placeholder="e.g. charitable donation, related party threshold"
  />
  <p className="text-xs text-gray-400">
    These issues will be excluded even if present in regulations or syllabus
  </p>
</div>
```

Truyền `excludingIssues` trong payload:
```typescript
// Trong sectionConfigs array:
excludingIssues: c.excludingIssues
  ? c.excludingIssues.split(',').map((s: string) => s.trim()).filter(Boolean)
  : undefined,
```

#### M1-3b: Thêm vào prompts.ts

**File:** `lib/ai/prompts.ts`

Thêm `excludingIssues` vào `ExamGenerationConfig`:
```typescript
excludingIssues?: string[]   // issues explicitly excluded from this question set
```

Trong `buildExamQuestionPrompt()`, thêm sau `issuesSpec`:
```typescript
let excludingIssuesSpec = ''
if (config.excludingIssues && config.excludingIssues.length > 0) {
  excludingIssuesSpec = `\n\n## CRITICAL: EXCLUDED TOPICS — DO NOT TEST THESE\nThe following issues MUST NOT appear in any question, option, or explanation:\n${config.excludingIssues.map(i => `  ❌ ${i}`).join('\n')}\nEven if these issues appear in the uploaded regulations or syllabus, EXCLUDE them completely.`
}
```

Thêm `excludingIssuesSpec` vào return string (sau `issuesSpec`, trước generation rules):
```typescript
${qtypeSpec}${topicSpec}${issuesSpec}${excludingIssuesSpec}${syllabusCodeSpec}
```

#### M1-3c: Per-session "Excluding issues" trong Variables page

**File:** `prisma/schema.prisma` — thêm vào Session:
```prisma
sessionExcludingIssues   String?   // JSON array of excluded issue strings
```

**File:** `app/(dashboard)/exams/[projectId]/[sessionId]/variables/page.tsx`

Thêm state và UI section "Excluding Issues" (expandable, dưới Session Settings):

```typescript
// Thêm state:
const [excludingIssues, setExcludingIssues] = useState<string[]>([])
const [newExcluding, setNewExcluding] = useState('')
const [showExcluding, setShowExcluding] = useState(false)

// Trong fetchSession:
const excl = data.sessionExcludingIssues
setExcludingIssues(excl ? JSON.parse(excl) : [])

// Trong handleSaveSettings, thêm:
sessionExcludingIssues: JSON.stringify(excludingIssues),

// UI — expandable section sau VND Unit setting:
<div className="border rounded-lg overflow-hidden mt-4">
  <button
    className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 text-sm font-semibold"
    onClick={() => setShowExcluding(!showExcluding)}
  >
    <span>🚫 Excluding Issues (session-wide)</span>
    <ChevronDown className={`h-4 w-4 transition-transform ${showExcluding ? 'rotate-180' : ''}`} />
  </button>
  {showExcluding && (
    <div className="p-3 space-y-2">
      <p className="text-xs text-gray-500">
        Topics/issues that will NEVER appear in any question in this session, even if present in regulations.
      </p>
      <div className="flex gap-2">
        <Input
          value={newExcluding}
          onChange={e => setNewExcluding(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && newExcluding.trim() && (setExcludingIssues(prev => [...prev, newExcluding.trim()]), setNewExcluding(''))}
          placeholder="e.g. charitable donation, pillar 2 UTPR"
          className="h-8 text-xs flex-1"
        />
        <Button size="sm" onClick={() => { if (newExcluding.trim()) { setExcludingIssues(prev => [...prev, newExcluding.trim()]); setNewExcluding('') } }}>
          Add
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-1">
        {excludingIssues.map((issue, i) => (
          <span key={i} className="inline-flex items-center gap-1 bg-red-50 text-red-700 border border-red-200 rounded-full px-2 py-0.5 text-xs">
            {issue}
            <button onClick={() => setExcludingIssues(prev => prev.filter((_, idx) => idx !== i))} className="hover:text-red-900">×</button>
          </span>
        ))}
      </div>
    </div>
  )}
</div>
```

#### M1-3d: Merge session-level excludingIssues vào generate config

**File:** `app/api/sessions/[id]/generate-jobs/[jobId]/run/route.ts`

```typescript
// Sau khi fetch sessionData, thêm:
const sessionExcludingRaw = (sessionData as any)?.sessionExcludingIssues
const sessionExcludingIssues: string[] = sessionExcludingRaw ? JSON.parse(sessionExcludingRaw) : []

// Merge với per-question excludingIssues:
const mergedExcluding = [
  ...sessionExcludingIssues,
  ...(sectionConfig.excludingIssues || [])
]

// Truyền vào generatorConfig:
excludingIssues: mergedExcluding.length > 0 ? mergedExcluding : undefined,
```

---

### Fix M1-4: Menu "Manual" — trang tạo câu hỏi thủ công từ sample

#### M1-4a: Thêm menu item

**File:** `app/(dashboard)/exams/[projectId]/[sessionId]/layout.tsx`

```typescript
// Thêm vào tabs array, TRƯỚC 'Question Bank':
{ label: 'Manual', href: 'manual' },
```

#### M1-4b: Tạo trang Manual

**File:** `app/(dashboard)/exams/[projectId]/[sessionId]/manual/page.tsx`

Trang có 3 steps:

```
STEP 1: Chọn Section + Topic (dropdowns)

STEP 2: Case input area
  - Optional: dropdown "Load from Sample Question"
    → fetch parsed questions từ /api/sessions/[id]/parsed-questions?topicId=X&sectionId=Y
    → khi chọn một sample question → load content vào textarea (xoá phần answer nếu có)
  - Textarea lớn (min 10 rows) — label "Case / Scenario"
  - Placeholder: "Enter the case scenario with all relevant data..."

STEP 3 buttons (hiện sau khi textarea không rỗng):
  [Regenerate Numbers]  [Generate Question & Answer ▾ (model selector)]

  - "Regenerate Numbers": gọi AI với prompt:
      "You are given a tax exam case scenario. Keep ALL structure, facts, and context IDENTICAL.
       Only replace the numerical values (amounts, rates, dates, percentages) with different but
       realistic numbers. Return only the modified case text, no explanation."
    → replace textarea content với result
    → dùng model được chọn trong model selector

  - "Generate Question & Answer":
    → gọi AI để generate question prompt + answer/working
    → hiện result panel bên dưới (giống Question Bank card)
    → có nút "Save to Question Bank" → POST /api/sessions/[id]/questions
```

**API endpoint mới:** `app/api/sessions/[id]/manual/route.ts`

```typescript
// POST /api/sessions/[id]/manual
// body: { action: 'regenNumbers' | 'generateQA', caseText: string, sectionId: string, modelId: string, topicName?: string }

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const { action, caseText, sectionId, modelId, topicName } = body

  if (action === 'regenNumbers') {
    const prompt = `You are given a tax exam case scenario. Keep ALL structure, facts, and context IDENTICAL.
Only replace the numerical values (amounts, rates, percentages, years, dates) with different but realistic values.
Return ONLY the modified case text. Do not explain, do not add headers.

ORIGINAL CASE:
${caseText}`

    const { provider, model } = parseModelId(modelId || 'claudible:claude-haiku-4.5')
    const text = await callAI(provider, model, prompt)
    return NextResponse.json({ result: text.trim() })
  }

  if (action === 'generateQA') {
    // Get session context (docs, variables)
    const session = await db.session.findUnique({ where: { id: params.id }, include: { sessionVariables: true } })
    const section = await db.examSection.findUnique({ where: { id: sectionId } })

    const prompt = `You are an expert tax exam question writer.
Given the following case scenario, generate:
1. A clear question prompt (starting with "Question:")
2. A full model answer with working

The question should test understanding of the tax issues in the case.
Format:
{
  "questionPrompt": "Question: ...",
  "modelAnswer": "HTML with working tables and step-by-step solution"
}

CASE SCENARIO:
${caseText}

SECTION TYPE: ${section?.questionType || 'SCENARIO'}
TOPIC: ${topicName || 'Tax'}
`
    const { provider, model } = parseModelId(modelId || 'claudible:claude-haiku-4.5')
    const text = await callAI(provider, model, prompt)
    const parsed = parseJSONFromResponse(text)
    return NextResponse.json({ result: parsed[0] || { questionPrompt: text, modelAnswer: null } })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
```

---

## MODULE 2

### Fix M2-1: WWTBAM FREE_CHOICE — bị văng về board sau 2 giây

**Root cause:** Trong `handleAnswer()`:
```typescript
setTimeout(() => setPhase('reveal'), 1500)
```
→ 1.5s sau → phase = 'reveal' ✓

Trong `reveal` phase, có "Back to Board" button và "Next" button — user phải click thủ công. **Đây đúng theo design.** Nhưng anh báo bị văng sau ~2s.

→ Nguyên nhân thực: `timerRef` timer vẫn running trong background dù đã `clearInterval` trong handleAnswer. Khi `phase === 'reveal'`, useEffect timer check `phase !== 'question'` nên không fire. **Nhưng** có thể `handleTimeout()` được gọi song song vì `timerRef.current` và `clearInterval` có race condition.

**Fix:**

```typescript
// Thêm ref để track nếu answer đã được chọn:
const answeredRef = useRef(false)

// Trong beginQuestion():
answeredRef.current = false

// Trong handleAnswer():
if (answeredRef.current) return  // prevent double-fire
answeredRef.current = true
clearInterval(timerRef.current!)
...

// Trong handleTimeout():
if (answeredRef.current) return  // already answered, ignore timeout
answeredRef.current = true
...
```

**Thêm fix:** Trong reveal phase, nếu FREE_CHOICE, ẩn "Next" button và chỉ hiện "Back to Board". Đây là behavior đúng cho WWTBAM free choice — sau khi reveal, user chọn câu tiếp theo từ board, không "Next" tuyến tính:

```typescript
// Trong reveal phase buttons:
<div className="flex gap-3">
  {isFreeChoice ? (
    // FREE_CHOICE: only "Back to Board" button
    <Button onClick={goToSelect} className="w-full bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-lg py-6">
      {isLastQ ? <><Trophy className="h-5 w-5 mr-2" />Final Results</> : <>Back to Board <ChevronRight className="h-5 w-5 ml-1" /></>}
    </Button>
  ) : (
    // LINEAR: only "Next Question" button  
    <Button onClick={handleNext} className="w-full bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-lg py-6">
      {currentIdx >= questions.length - 1 ? 'See Final Results' : 'Next Question'}
      <ChevronRight className="h-5 w-5 ml-1" />
    </Button>
  )}
</div>
```

Sửa `goToSelect` để handle isLastQ:
```typescript
const goToSelect = () => {
  setTimerRunning(false)
  audio.stopAll()
  if (answeredQuestions.size >= questions.length) {
    setPhase('gameover')
    return
  }
  audio.playBg('selecting', 0.5)
  setPhase('select')
}
```

---

## CẢ 2 MODULES (C)

### Fix C-1 & C-2: Multi-model support — CLAUDIBLE_MODEL2, ANTHROPIC_MODEL1, ANTHROPIC_MODEL2

**File:** `lib/ai/index.ts`

Sửa `getAvailableModels()`:

```typescript
export function getAvailableModels(): AIModelChoice[] {
  const openrouterModel1 = process.env.OPENROUTER_MODEL1 || 'xiaomi/mimo-v2-pro'
  const openrouterModel2 = process.env.OPENROUTER_MODEL2 || 'qwen/qwen3-plus'
  const claudibleModel1  = process.env.CLAUDIBLE_MODEL  || 'claude-haiku-4.5'
  const claudibleModel2  = process.env.CLAUDIBLE_MODEL2 || ''    // empty = not shown
  const anthropicModel1  = process.env.ANTHROPIC_MODEL1 || ''    // replaces hard-coded haiku
  const anthropicModel2  = process.env.ANTHROPIC_MODEL2 || ''    // replaces hard-coded sonnet

  const models: AIModelChoice[] = [
    {
      id: 'claudible:1',
      label: `Claudible — ${claudibleModel1} (Default)`,
      provider: 'claudible',
      model: claudibleModel1,
    },
    // Conditionally add CLAUDIBLE_MODEL2 if set
    ...(claudibleModel2 ? [{
      id: 'claudible:2',
      label: `Claudible — ${claudibleModel2}`,
      provider: 'claudible',
      model: claudibleModel2,
    }] : []),
    // Conditionally add Anthropic models if env vars set
    ...(anthropicModel1 ? [{
      id: 'anthropic:1',
      label: `Anthropic — ${anthropicModel1}`,
      provider: 'anthropic',
      model: anthropicModel1,
    }] : []),
    ...(anthropicModel2 ? [{
      id: 'anthropic:2',
      label: `Anthropic — ${anthropicModel2}`,
      provider: 'anthropic',
      model: anthropicModel2,
    }] : []),
    {
      id: `openrouter:${openrouterModel1}`,
      label: `OpenRouter — ${openrouterModel1}`,
      provider: 'openrouter',
      model: openrouterModel1,
    },
    {
      id: `openrouter:${openrouterModel2}`,
      label: `OpenRouter — ${openrouterModel2}`,
      provider: 'openrouter',
      model: openrouterModel2,
    },
    {
      id: 'deepseek:deepseek-reasoner',
      label: 'DeepSeek Reasoner',
      provider: 'deepseek',
      model: 'deepseek-reasoner',
    },
  ]

  return models
}
```

Sửa `parseModelId()` để handle `claudible:1`, `claudible:2`, `anthropic:1`, `anthropic:2`:

```typescript
export function parseModelId(modelId: string): { provider: string; model: string } {
  const idx = modelId.indexOf(':')
  if (idx === -1) return { provider: 'deepseek', model: modelId }
  const provider = modelId.slice(0, idx)
  const modelPart = modelId.slice(idx + 1)

  if (provider === 'claudible') {
    // claudible:1 → CLAUDIBLE_MODEL, claudible:2 → CLAUDIBLE_MODEL2
    if (modelPart === '1') return { provider: 'claudible', model: process.env.CLAUDIBLE_MODEL || 'claude-haiku-4.5' }
    if (modelPart === '2') return { provider: 'claudible', model: process.env.CLAUDIBLE_MODEL2 || process.env.CLAUDIBLE_MODEL || 'claude-haiku-4.5' }
    // Legacy: claudible:claude-haiku-4.5 etc. → use CLAUDIBLE_MODEL env
    return { provider: 'claudible', model: process.env.CLAUDIBLE_MODEL || modelPart }
  }

  if (provider === 'anthropic') {
    if (modelPart === '1') return { provider: 'anthropic', model: process.env.ANTHROPIC_MODEL1 || 'claude-haiku-4-5' }
    if (modelPart === '2') return { provider: 'anthropic', model: process.env.ANTHROPIC_MODEL2 || 'claude-sonnet-4-5' }
    // Legacy exact model name
    return { provider: 'anthropic', model: modelPart }
  }

  return { provider, model: modelPart }
}
```

Sửa default model trong Module 1 generate page:
```typescript
// app/(dashboard)/exams/.../generate/page.tsx:
const [selectedModel, setSelectedModel] = useState('claudible:1')
```

Sửa default model trong Module 2 quiz questions page:
```typescript
// app/(dashboard)/quiz/[quizId]/questions/page.tsx:
const [selectedModel, setSelectedModel] = useState<string>('claudible:1')
```

**Xóa hard-coded Anthropic entries** từ `getAvailableModels()` — chúng đã được replace bằng `anthropic:1` / `anthropic:2` từ env vars.

---

## Prisma migrations

```bash
# 2 fields mới: Document.parseSuffix, Session.sessionExcludingIssues
npx prisma db push
```

---

## Files cần sửa

| File | Fixes |
|---|---|
| `app/api/sessions/[id]/documents/[docId]/parse/route.ts` | M1-1 (proper ZIP XML parser), M1-1b (parseSuffix in regex) |
| `app/(dashboard)/exams/.../documents/page.tsx` | M1-1b (suffix UI in parse dialog) |
| `prisma/schema.prisma` | M1-1b (Document.parseSuffix), M1-3c (Session.sessionExcludingIssues) |
| `lib/ai/prompts.ts` | M1-2 (HTML table answer format), M1-3b (excludingIssues prompt) |
| `app/(dashboard)/exams/.../questions/page.tsx` | M1-2 (optionExplanations render với ✓/✗) |
| `app/(dashboard)/exams/.../generate/page.tsx` | M1-3a (Excluding issues input per section) |
| `app/api/sessions/[id]/generate-jobs/[jobId]/run/route.ts` | M1-3d (merge session + section excluding) |
| `app/(dashboard)/exams/.../variables/page.tsx` | M1-3c (Excluding issues expandable UI) |
| `app/(dashboard)/exams/.../layout.tsx` | M1-4a (add Manual menu item) |
| `app/(dashboard)/exams/.../manual/page.tsx` | M1-4b (create new page — 3 steps) |
| `app/api/sessions/[id]/manual/route.ts` | M1-4b (create new API endpoint) |
| `app/gameshow/[shareCode]/wwtbam/page.tsx` | M2-1 (FREE_CHOICE reveal fix + answeredRef) |
| `lib/ai/index.ts` | C-1,2 (CLAUDIBLE_MODEL2, ANTHROPIC_MODEL1/2, parseModelId update) |
| `package.json` | C-1 (add adm-zip if not present) |

---

## KHÔNG thay đổi
- Module 2 quiz generation flow
- Kahoot, Jeopardy gameshow pages
- Mock exam, attempts pages
- Auth, DB connection

---

**Sau khi Claude Code push → nhắn em deploy.**
