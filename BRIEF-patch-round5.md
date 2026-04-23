# BRIEF: Patch Round 5 — Parse Debug+Fix, Manual Error, Marking Column, Model Display, Menu Order, Gameshow Online Join

**Repo:** phanvuhoang/testsgen

---

## MODULE 1

### Fix M1-1: Parse — debug + hardened rewrite (HIGHEST PRIORITY)

**Root cause hypothesis:** `adm-zip` có thể không được install đúng, hoặc `zip.getEntry('word/document.xml')` trả null trên một số DOCX formats. Code hiện tại sẽ silently trả `[]` và fall through → AI fallback, nhưng AI parse cũng có thể fail nếu provider/model không được config.

**Approach:** Rewrite `parseDocxParagraphs()` với multiple fallback strategies + verbose logging, và **always** fall through đến AI với claudible nếu structural fail.

**File:** `app/api/sessions/[id]/documents/[docId]/parse/route.ts`

**Thay toàn bộ** hàm `parseDocxParagraphs()`:

```typescript
function parseDocxParagraphs(buffer: Buffer): { style: string; text: string }[] {
  // Strategy 1: Try adm-zip proper ZIP extraction
  try {
    const AdmZip = require('adm-zip')
    const zip = new AdmZip(buffer)

    // Try exact entry name first
    let xmlContent: string | null = null
    const entry = zip.getEntry('word/document.xml')
    if (entry) {
      xmlContent = entry.getData().toString('utf-8')
    } else {
      // Some DOCX use different casing or path — try all entries
      const entries = zip.getEntries()
      const docEntry = entries.find((e: any) =>
        e.entryName.toLowerCase() === 'word/document.xml' ||
        e.entryName.toLowerCase().endsWith('document.xml')
      )
      if (docEntry) xmlContent = docEntry.getData().toString('utf-8')
    }

    if (xmlContent && xmlContent.includes('<w:p')) {
      return extractParagraphsFromXml(xmlContent)
    }
    console.warn('[parseDocx] adm-zip got entry but XML looks invalid, trying Buffer strategy')
  } catch (e) {
    console.warn('[parseDocx] adm-zip failed:', String(e))
  }

  // Strategy 2: Find XML content by scanning buffer for ZIP local file header
  try {
    // DOCX ZIP: each file entry has a local file header 'PK\x03\x04'
    // Find 'word/document.xml' entry by searching for its filename in the buffer
    const raw = buffer.toString('latin1')  // latin1 to preserve bytes
    const marker = 'word/document.xml'
    const markerIdx = raw.indexOf(marker)
    if (markerIdx > 0) {
      // The compressed data follows the local file header
      // Try to find the XML content (it may be stored uncompressed for small files)
      // Search for XML declaration or first <w: tag after the marker
      const searchFrom = markerIdx + marker.length
      const xmlStart = raw.indexOf('<?xml', searchFrom)
      const wbodyStart = raw.indexOf('<w:body', searchFrom)
      const startIdx = xmlStart > 0 && xmlStart < searchFrom + 200 ? xmlStart :
                       wbodyStart > 0 && wbodyStart < searchFrom + 500 ? wbodyStart : -1
      if (startIdx > 0) {
        // Try to extract as UTF-8 slice
        const xmlSlice = buffer.slice(startIdx).toString('utf-8')
        if (xmlSlice.includes('<w:p')) {
          console.log('[parseDocx] Strategy 2 (buffer scan) succeeded')
          return extractParagraphsFromXml(xmlSlice)
        }
      }
    }
  } catch (e) {
    console.warn('[parseDocx] Strategy 2 failed:', String(e))
  }

  // Strategy 3: mammoth structural — get styled text via mammoth's style map
  try {
    const mammoth = require('mammoth')
    // mammoth can output with style tags via custom style map
    const result = mammoth.convertToHtmlSync({ buffer }, {
      styleMap: [
        "p[style-name='Heading 1'] => h1",
        "p[style-name='Heading 2'] => h2",
        "p[style-name='Heading 3'] => h3",
      ]
    })
    const html: string = result.value
    // Parse h1/h2/h3 as heading paragraphs, p as normal
    const paragraphs: { style: string; text: string }[] = []
    const tagPattern = /<(h1|h2|h3|p)[^>]*>([^<]*(?:<[^>]+>[^<]*<\/[^>]+>)*[^<]*)<\/\1>/g
    let m: RegExpExecArray | null
    while ((m = tagPattern.exec(html)) !== null) {
      const tag = m[1]
      const text = m[2].replace(/<[^>]+>/g, '').trim()
      const style = tag === 'h1' ? 'Heading1' : tag === 'h2' ? 'Heading2' : tag === 'h3' ? 'Heading3' : ''
      if (text) paragraphs.push({ style, text })
    }
    if (paragraphs.length > 0) {
      console.log(`[parseDocx] Strategy 3 (mammoth HTML) succeeded: ${paragraphs.length} paragraphs`)
      return paragraphs
    }
  } catch (e) {
    console.warn('[parseDocx] Strategy 3 (mammoth) failed:', String(e))
  }

  console.warn('[parseDocx] All strategies failed, returning empty')
  return []
}

// Helper: extract paragraphs from OOXML string
function extractParagraphsFromXml(xmlContent: string): { style: string; text: string }[] {
  const paragraphs: { style: string; text: string }[] = []
  const paraRegex = /<w:p[ >][\s\S]*?<\/w:p>/g
  let pm: RegExpExecArray | null
  while ((pm = paraRegex.exec(xmlContent)) !== null) {
    const paraXml = pm[0]
    const pStyleMatch = paraXml.match(/<w:pStyle\s+w:val="([^"]+)"/)
    const style = pStyleMatch ? pStyleMatch[1] : ''
    const textMatches = Array.from(paraXml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g))
    const text = textMatches.map((m: RegExpMatchArray) => m[1]).join('').trim()
    if (text) paragraphs.push({ style, text })
  }
  console.log(`[parseDocx] extractParagraphsFromXml: found ${paragraphs.length} paragraphs`)
  return paragraphs
}
```

**Sửa POST handler** — thêm detailed logging và đảm bảo AI fallback luôn dùng claudible:

```typescript
export async function POST(req: NextRequest, { params }: { params: { id: string; docId: string } }) {
  try {
    const body = await req.json().catch(() => ({}))
    const forceAI: boolean = body.forceAI === true || body.useAI === true

    const doc = await (db as any).document.findUnique({ where: { id: params.docId } })
    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

    const parseKeyword: string = body.parseKeyword || (doc as any).parseKeyword || 'Example'
    const parseStyle: string   = body.parseStyle   || (doc as any).parseStyle   || 'Heading2'
    const parseNumber: boolean = body.parseNumber  !== undefined ? body.parseNumber : ((doc as any).parseNumber !== false)
    const parseSuffix: string  = body.parseSuffix  !== undefined ? body.parseSuffix : ((doc as any).parseSuffix ?? ':')
    const escapedSuffix = parseSuffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    const keywordPattern = parseNumber
      ? new RegExp(`^${parseKeyword}\\s+\\d+\\s*${escapedSuffix}`, 'i')
      : new RegExp(`^${parseKeyword}\\s*${escapedSuffix}`, 'i')

    // Log what pattern we're using
    console.log(`[parse] doc=${params.docId} keyword="${parseKeyword}" number=${parseNumber} suffix="${parseSuffix}" style="${parseStyle}" pattern=${keywordPattern}`)

    const headingStyles = parseStyle === 'Heading1' ? ['Heading1', 'heading1', '1', 'Heading 1']
      : parseStyle === 'Heading2' ? ['Heading2', 'heading2', '2', 'Heading 2', 'heading 2']
      : parseStyle === 'Heading3' ? ['Heading3', 'heading3', '3', 'Heading 3']
      : []

    let docxBuffer: Buffer | null = null
    if (!doc.isManualInput && doc.filePath && (doc.filePath.endsWith('.docx') || doc.filePath.endsWith('.doc'))) {
      try {
        docxBuffer = await readFile(join(process.cwd(), 'public', doc.filePath))
        console.log(`[parse] loaded docx buffer: ${docxBuffer.length} bytes`)
      } catch (e) {
        console.warn('[parse] failed to read file:', String(e))
      }
    }

    let rawQuestions: any[] = []
    let strategy = 'none'

    // Structural parse (DOCX)
    if (docxBuffer && parseStyle !== 'ai') {
      const paragraphs = parseDocxParagraphs(docxBuffer)
      console.log(`[parse] paragraphs extracted: ${paragraphs.length}`)
      if (paragraphs.length > 0) {
        // Log first 5 paragraphs for debugging
        console.log('[parse] sample paragraphs:', JSON.stringify(paragraphs.slice(0, 5)))
      }
      if (parseStyle === 'numbered') {
        rawQuestions = parseByNumberedList(paragraphs)
        strategy = 'numbered'
      } else {
        rawQuestions = parseByHeadingKeyword(paragraphs, headingStyles, keywordPattern, parseKeyword)
        strategy = `heading(${parseStyle})+keyword(${keywordPattern})`
      }
      console.log(`[parse] structural result: ${rawQuestions.length} questions via ${strategy}`)
    }

    // Text-based fallback for PDF/TXT
    if (rawQuestions.length === 0 && !docxBuffer && parseStyle !== 'ai') {
      const text = await extractText(doc.filePath, doc.isManualInput, doc.content)
      if (text && text.trim().length >= 10) {
        rawQuestions = parseByTextSplit(text, keywordPattern)
        strategy = 'text-split'
        console.log(`[parse] text-split result: ${rawQuestions.length} questions`)
      }
    }

    // AI fallback — ALWAYS if structural found 0 (or forceAI/ai style)
    if (rawQuestions.length === 0 || parseStyle === 'ai' || forceAI) {
      console.log('[parse] falling back to AI parse...')
      const text = docxBuffer
        ? await extractTextFromBuffer(docxBuffer, doc.filePath)
        : await extractText(doc.filePath, doc.isManualInput, doc.content)
      if (!text || text.trim().length < 10) {
        return NextResponse.json({
          error: 'Could not extract text from document. Is the file corrupted?',
          parsed: [], count: 0, debug: { strategy, paragraphs: 0 }
        })
      }
      console.log(`[parse] AI parse on ${text.length} chars`)
      rawQuestions = await parseWithAI(text, params.id, parseKeyword, parseNumber)
      strategy = 'AI'
      console.log(`[parse] AI result: ${rawQuestions.length} questions`)
    }

    if (rawQuestions.length === 0) {
      return NextResponse.json({
        error: `No questions found. Pattern tried: "${parseKeyword}${parseNumber ? ' <N>' : ''}${parseSuffix}". Try: (1) change keyword, (2) use style "None", (3) try AI parse mode.`,
        parsed: [], count: 0,
        debug: { strategy, keyword: parseKeyword, suffix: parseSuffix, number: parseNumber }
      })
    }

    // Delete existing + save new
    await (db as any).parsedQuestion.deleteMany({ where: { documentId: params.docId } })
    const saved: any[] = []
    for (let i = 0; i < rawQuestions.length; i++) {
      const q = rawQuestions[i]
      try {
        const pq = await (db as any).parsedQuestion.create({
          data: {
            sessionId: params.id,
            documentId: params.docId,
            title: String(q.title || `Question ${i + 1}`),
            content: String(q.content || ''),
            answer: q.answer ? String(q.answer) : null,
            questionType: String(q.questionType || 'OTHER'),
            topicId: doc.topicId ?? null,
            topicName: doc.topicName ?? null,
            sectionId: doc.sectionId ?? null,
            sectionName: doc.sectionName ?? null,
            difficulty: String(q.difficulty || 'MEDIUM'),
            sortOrder: i,
            isManual: false,
          },
        })
        saved.push(pq)
      } catch (e) {
        console.error('[parse] save error', e)
      }
    }

    return NextResponse.json({ parsed: saved, count: saved.length, strategy })
  } catch (e) {
    console.error('[parse questions]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

**Thêm helper** `extractTextFromBuffer()` để dùng mammoth trên buffer (tránh đọc file lại):

```typescript
async function extractTextFromBuffer(buffer: Buffer, filePath: string): Promise<string> {
  if (filePath?.endsWith('.docx') || filePath?.endsWith('.doc')) {
    try {
      const mammoth = require('mammoth')
      const result = await mammoth.extractRawText({ buffer })
      return result.value ?? ''
    } catch {}
  }
  return buffer.toString('utf-8')
}
```

**Sửa `parseWithAI()`** — đảm bảo luôn dùng claudible API:

```typescript
async function parseWithAI(text: string, sessionId: string, parseKeyword: string = 'Example', parseNumber: boolean = true): Promise<any[]> {
  try {
    const patternNote = `Questions are separated by the pattern "${parseKeyword}${parseNumber ? ' <number>' : ''}:" e.g. "${parseKeyword} 1:", "${parseKeyword} 2:".`
    
    // ALWAYS use claudible for parse (fastest, most reliable)
    const provider = 'claudible'
    const model = process.env.CLAUDIBLE_MODEL || 'claude-haiku-4.5'
    const apiKey = process.env.CLAUDIBLE_API_KEY || ''
    const baseURL = process.env.CLAUDIBLE_BASE_URL || 'https://claudible.io/v1'

    const prompt = `You are parsing a sample exam questions document.
${patternNote}
Extract ALL individual questions. For each return JSON:
- title: string (e.g. "Example 1")
- content: string (full question text, do NOT truncate)
- answer: string | null (answer/solution if present)
- questionType: "MCQ_SINGLE" | "MCQ_MULTIPLE" | "SHORT_ANSWER" | "SCENARIO" | "CASE_STUDY" | "OTHER"
- difficulty: "EASY" | "MEDIUM" | "HARD"

Return ONLY a JSON array. No markdown. No explanation.

DOCUMENT TEXT:
${text.slice(0, 60000)}`

    const OpenAI = (await import('openai')).default
    const client = new OpenAI({ apiKey, baseURL })
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 16000,
    })
    const raw = response.choices[0]?.message?.content || ''
    console.log('[parseWithAI] response length:', raw.length)
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      console.warn('[parseWithAI] no JSON array found in response')
      return []
    }
    return JSON.parse(jsonMatch[0])
  } catch (e) {
    console.error('[parse AI]', e)
    return []
  }
}
```

**Sửa UI toast** để hiện debug info khi 0 questions:

**File:** `app/(dashboard)/exams/[projectId]/[sessionId]/documents/page.tsx`

```typescript
// Trong handleParseConfirm, sửa error handling:
const data = await res.json()
if (!res.ok || (data.error && !data.count)) throw new Error(data.error || 'Parse failed')
setParseCounts(prev => ({ ...prev, [parseDialogDocId]: data.count ?? 0 }))
if (data.count === 0) {
  toast({
    title: '0 questions found',
    description: data.error || `Strategy: ${data.debug?.strategy || 'unknown'}. Try: keyword="${data.debug?.keyword}", suffix="${data.debug?.suffix}", or switch to AI parse style.`,
    variant: 'destructive'
  })
} else {
  toast({ title: `✅ Parsed ${data.count} questions via ${data.strategy || ''}` })
}
setParseDialogDocId(null)
```

---

### Fix M1-2: Manual page crash — SelectItem empty value

**Root cause:** `<SelectItem value="" ...>Any topic</SelectItem>` — Radix UI Select prohibits empty string values.

**File:** `app/(dashboard)/exams/[projectId]/[sessionId]/manual/page.tsx`

```typescript
// Tìm:
<SelectItem value="" className="text-xs">Any topic</SelectItem>

// Thay:
<SelectItem value="__all__" className="text-xs">Any topic</SelectItem>

// Cũng sửa filter:
const relevantSamples = sampleQuestions.filter(sq => {
  if (!selectedTopicId || selectedTopicId === '__all__') return true
  return sq.topicId === selectedTopicId
})

// Và initial state:
const [selectedTopicId, setSelectedTopicId] = useState('__all__')
```

---

### Fix M1-3: Worked Solution — thêm cột "Mark" vào bảng

**File:** `lib/ai/prompts.ts`

Sửa format HTML table trong `buildExamQuestionPrompt()`:

```typescript
// Thay table format trong ANSWER FORMAT RULES:
`FOR MCQ — format modelAnswer as an HTML table with 4 columns:
<table>
  <tr>
    <th style="width:50px">Step</th>
    <th>Working / Description</th>
    <th style="width:100px">Amount (VND m)</th>
    <th style="width:60px">Mark</th>
  </tr>
  <tr><td>1</td><td>Description</td><td>500</td><td>0.5</td></tr>
  <tr><td>2</td><td>Next step</td><td>100</td><td>0.5</td></tr>
  <tr><td><b>Total</b></td><td>Tax liability</td><td><b>600</b></td><td><b>1.0</b></td></tr>
</table>
For pure theory: 2-4 sentences with regulation reference. No table needed.

FOR SCENARIO/ESSAY — HTML with per-part tables:
Each part: <p><b>(a) Part title — [X marks]</b></p> followed by table.
Table columns: Step | Working | Amount | Mark`
```

---

### Fix M1-4: Model display — hiện tên model thực thay vì "1" hay "2"

**Vấn đề:** `q.generatedBy` lưu `"claudible:1"`, hiển thị `.split(':').pop()` → `"1"` thay vì tên model thực.

**File:** `app/(dashboard)/exams/[projectId]/[sessionId]/questions/page.tsx`

Thêm helper để resolve model name:
```typescript
function resolveModelLabel(generatedBy: string | null): string {
  if (!generatedBy) return ''
  // Map new IDs
  const labelMap: Record<string, string> = {
    'claudible:1': 'Claudible (default)',
    'claudible:2': 'Claudible (model2)',
    'anthropic:1': 'Anthropic (model1)',
    'anthropic:2': 'Anthropic (model2)',
    'deepseek:deepseek-reasoner': 'DeepSeek Reasoner',
  }
  if (labelMap[generatedBy]) return labelMap[generatedBy]
  // Fallback: show last part
  return generatedBy.split(':').pop() || generatedBy
}
```

Sửa render:
```typescript
// Tìm:
{q.generatedBy && (
  <Badge ...>{q.generatedBy.split(':').pop()}</Badge>
)}

// Thay:
{q.generatedBy && (
  <Badge ...>{resolveModelLabel(q.generatedBy)}</Badge>
)}
```

**Cũng fix:** Đảm bảo non-MCQ questions cũng lưu `generatedBy`. Trong `run/route.ts`, verify tất cả `db.question.create()` calls đều có `generatedBy: resolvedModelId`. Check xem có chỗ nào tạo question mà không set `generatedBy` không — nếu có thì thêm vào.

---

### Fix M1-5: Sắp xếp lại menu Exam Session

**File:** `app/(dashboard)/exams/[projectId]/[sessionId]/layout.tsx`

```typescript
// Thay toàn bộ tabs array:
const tabs = [
  { label: 'Topics',        href: 'topics' },
  { label: 'Sections',      href: 'sections' },
  { label: 'Documents',     href: 'documents' },
  { label: 'Samples',       href: 'samples' },
  { label: 'Variables',     href: 'variables' },
  { label: 'Generate',      href: 'generate' },
  { label: 'Manual',        href: 'manual' },
  { label: 'Question Bank', href: 'questions' },
  { label: 'Mock Exams',    href: 'mock-exams' },
]
```

---

## MODULE 2

### Fix M2-1: Gameshow Online Multiplayer — player không vào được room

**Root cause:** 
1. Join URL được build là `${origin}/gameshow/${shareCode}?room=${roomCode}` (e.g. `.../cmoblfvbq.../kahoot?room=MN2C2P`) — **ĐÚNG** cho Kahoot.
2. Nhưng QR code cũng dùng URL này → khi player quét QR → vào đúng URL → detect `?room=` → phase = 'join' → **OK**.
3. **Thực tế bug:** `joinUrl` được build trong `lobby` phase NHƯNG `roomCode` state có thể chưa set khi URL được build. Và QR URL build ở setup phase trước khi `roomCode` có.

**Fix Kahoot:**

**File:** `app/gameshow/[shareCode]/kahoot/page.tsx`

```typescript
// Tìm chỗ build joinUrl trong lobby phase:
const joinUrl = typeof window !== 'undefined'
  ? `${window.location.origin}/gameshow/${shareCode}?room=${roomCode}`
  : ''

// Đây đã đúng. Nhưng cần đảm bảo LobbyQR và joinUrl chỉ render khi roomCode không null.

// Tìm:
<LobbyQR url={joinUrl}/>

// Thêm guard:
{roomCode && <LobbyQR url={joinUrl}/>}
{roomCode && <p className="text-xs opacity-60 mb-2 break-all px-2">{joinUrl}</p>}
```

**Fix router page** — đây là BUG CHÍNH:

**File:** `app/gameshow/[shareCode]/page.tsx`

Router hiện tại: `router.replace('/gameshow/xxx/kahoot')` — **KHÔNG forward `?room=` query param**.

```typescript
// Sửa toàn bộ useEffect trong GameshowRouterPage:
useEffect(() => {
  fetch(`/api/gameshow/${shareCode}`)
    .then(r => r.json())
    .then(data => {
      if (data.error) { setError(data.error); return }

      // Preserve query params (especially ?room=)
      const currentSearch = window.location.search  // e.g. "?room=MN2C2P"

      switch (data.type) {
        case 'WWTBAM':
          router.replace(`/gameshow/${shareCode}/wwtbam${currentSearch}`)
          break
        case 'KAHOOT':
          router.replace(`/gameshow/${shareCode}/kahoot${currentSearch}`)
          break
        case 'JEOPARDY':
          router.replace(`/gameshow/${shareCode}/jeopardy${currentSearch}`)
          break
        default:
          setError(`Unknown game type: ${data.type}`)
      }
    })
    .catch(() => setError('Failed to load gameshow'))
}, [shareCode, router])
```

**Fix QR URL** — QR nên link đến `/gameshow/${shareCode}?room=${roomCode}` (without `/kahoot`) sẽ hoạt động vì router page forward đúng params:

```typescript
// Trong Kahoot lobby phase, sửa joinUrl:
const joinUrl = typeof window !== 'undefined' && roomCode
  ? `${window.location.origin}/gameshow/${shareCode}?room=${roomCode}`
  : ''
// (URL này khi player mở → router page → detect type=KAHOOT → redirect sang /kahoot?room=MN2C2P)
```

**Fix tương tự cho WWTBAM và Jeopardy** nếu chúng cũng có ONLINE multiplayer với QR + room code (tìm file và áp dụng cùng pattern):

```typescript
// Trong wwtbam/page.tsx và jeopardy/page.tsx, sửa:
// - joinUrl build (đảm bảo dùng /gameshow/${shareCode}?room=${roomCode} không có /wwtbam)
// - guard để chỉ hiện QR khi roomCode không null
```

---

## Files cần sửa

| File | Fixes |
|---|---|
| `app/api/sessions/[id]/documents/[docId]/parse/route.ts` | M1-1 (hardened parse + debug logging + claudible AI fallback) |
| `app/(dashboard)/exams/.../documents/page.tsx` | M1-1 (better error toast with debug info) |
| `app/(dashboard)/exams/.../manual/page.tsx` | M1-2 (SelectItem empty value → "__all__") |
| `lib/ai/prompts.ts` | M1-3 (4-column table: Step/Working/Amount/Mark) |
| `app/(dashboard)/exams/.../questions/page.tsx` | M1-4 (resolveModelLabel helper) |
| `app/api/sessions/[id]/generate-jobs/[jobId]/run/route.ts` | M1-4 (verify all question creates have generatedBy) |
| `app/(dashboard)/exams/.../layout.tsx` | M1-5 (menu order) |
| `app/gameshow/[shareCode]/page.tsx` | M2-1 (forward ?room= query param in router.replace) |
| `app/gameshow/[shareCode]/kahoot/page.tsx` | M2-1 (guard QR/joinUrl on roomCode) |
| `app/gameshow/[shareCode]/wwtbam/page.tsx` | M2-1 (same if has online mode) |
| `app/gameshow/[shareCode]/jeopardy/page.tsx` | M2-1 (same if has online mode) |

---

## KHÔNG thay đổi
- Prisma schema (không cần migration)
- Module 2 quiz generation
- Auth, mock exams

---

**Sau khi Claude Code push → nhắn em deploy.**
