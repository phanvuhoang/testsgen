# BRIEF: Fix Document Context + Improve Question Bank Display

**Repo:** phanvuhoang/testsgen  
**Module:** Module 1 (Exam generation + Question Bank view)  
**Priority:** Critical (context caps) + High (display quality)

---

## 1. Root Cause — Document Context Bị Cắt Quá Ngắn

Mọi document đều bị cắt còn **20,000 chars** trước khi đưa vào AI prompt:

```typescript
// run/route.ts — HIỆN TẠI (sai)
const joinScopedContent = (key: string) =>
  (relevantDocsByType[key] || []).join('\n\n---\n\n').slice(0, 20_000)
```

Và `extractDocumentText()` cắt ở 50K:
```typescript
return data.text.slice(0, 50000)  // cần nâng lên
```

Một Nghị định thuế thực tế (VD: Decree 320/2025/NĐ-CP) thường **80,000–150,000 chars**. Với giới hạn 20K, AI chỉ thấy ~15% đầu file → **bịa article numbers và tax rates**.

---

## 2. Fix 1: Tăng Context Caps Theo Loại Document (CRITICAL)

### Caps mới theo yêu cầu:

| Document type | Cap cũ | Cap mới |
|---|---|---|
| `TAX_REGULATIONS` | 20K | **100,000** |
| `SAMPLE_QUESTIONS` | 20K | **40,000** |
| `SYLLABUS` | 20K | **30,000** |
| `RATES_TARIFF` | 20K | **15,000** |
| `STUDY_MATERIAL` | 20K | **15,000** |
| `OTHER` | 20K | **10,000** |
| Per-file extraction | 50K | **150,000** |

### Thay đổi trong `app/api/sessions/[id]/generate-jobs/[jobId]/run/route.ts`:

```typescript
// ── Context budget constants — add these near the top of the file ───────────
const MAX_PER_FILE_CHARS = 150_000

const JOIN_CAPS: Record<string, number> = {
  TAX_REGULATIONS:  100_000,
  SAMPLE_QUESTIONS:  40_000,
  SYLLABUS:          30_000,
  RATES_TARIFF:      15_000,
  STUDY_MATERIAL:    15_000,
  OTHER:             10_000,
}
```

Thay `extractDocumentText`:

```typescript
async function extractDocumentText(filePath: string): Promise<string> {
  try {
    const fullPath = join(process.cwd(), 'public', filePath)
    const buffer = await readFile(fullPath)

    if (filePath.endsWith('.txt')) {
      return buffer.toString('utf-8').slice(0, MAX_PER_FILE_CHARS)
    }

    if (filePath.endsWith('.pdf')) {
      const pdfParse = require('pdf-parse')
      const data = await pdfParse(buffer)
      return data.text.slice(0, MAX_PER_FILE_CHARS)
    }

    return buffer.toString('utf-8').slice(0, MAX_PER_FILE_CHARS)
  } catch {
    return ''
  }
}
```

Thay `joinScopedContent` (dòng hiện tại là `const joinScopedContent = ...`):

```typescript
const joinScopedContent = (key: string) => {
  const cap = JOIN_CAPS[key] ?? 10_000
  return (relevantDocsByType[key] || []).join('\n\n---\n\n').slice(0, cap)
}
```

### Thay đổi tương tự trong `app/api/sessions/[id]/generate/route.ts`:

```typescript
const JOIN_CAPS_SYNC: Record<string, number> = {
  TAX_REGULATIONS:  100_000,
  SAMPLE_QUESTIONS:  40_000,
  SYLLABUS:          30_000,
  RATES_TARIFF:      15_000,
  STUDY_MATERIAL:    15_000,
  OTHER:             10_000,
}

// Thay extractDocumentText (50K → 150K)
// Thay const joinContent = ... bằng:
const joinContent = (key: string) => {
  const cap = JOIN_CAPS_SYNC[key] ?? 10_000
  return (docsByType[key] || []).join('\n\n---\n\n').slice(0, cap)
}
```

---

## 3. Fix 2: Cải Thiện Section Filtering trong `getRelevantDocs()` (HIGH)

**File:** `app/api/sessions/[id]/generate-jobs/[jobId]/run/route.ts`

CASE 2 hiện tại (user chọn topic) chỉ filter theo topicId, không check sectionId. Fix để thêm section check:

```typescript
function getRelevantDocs(allDocs: any[], sectionConfig: any, sec: any): any[] {
  const selectedTopicIds: string[] = sectionConfig.selectedTopicIds || []
  const selectedSectionId: string = sectionConfig.sectionId

  // Helper: parse sectionIds JSON array from doc
  const parseDocSectionIds = (d: any): string[] => {
    if (d.sectionIds) {
      try { return JSON.parse(d.sectionIds) } catch {}
    }
    return d.sectionId ? [d.sectionId] : []
  }

  // Helper: doc matches current section OR is unscoped (no section tag)
  const matchesSection = (d: any): boolean => {
    const docSectionIds = parseDocSectionIds(d)
    if (docSectionIds.length === 0) return true  // unscoped → always include
    return docSectionIds.includes(selectedSectionId)
  }

  if (selectedTopicIds.length === 0) {
    // CASE 1: no topic selected — filter by section only
    return allDocs.filter((d: any) => {
      const hasTopicTag = d.topicId || (d.topicIds && d.topicIds !== '[]')
      return !hasTopicTag || matchesSection(d)
    })
  }

  // CASE 2: topic(s) selected — filter by topic AND section
  return allDocs.filter((d: any) => {
    const docTopicIds: string[] = d.topicIds
      ? (() => { try { return JSON.parse(d.topicIds) } catch { return d.topicId ? [d.topicId] : [] } })()
      : (d.topicId ? [d.topicId] : [])

    // Untagged docs always included
    if (docTopicIds.length === 0) return true

    // Must match topic
    if (!docTopicIds.some((id: string) => selectedTopicIds.includes(id))) return false

    // Must also match section (or be section-unscoped)
    return matchesSection(d)
  })
}
```

---

## 4. Fix 3: Tăng `max_tokens` Claudible (MEDIUM)

**File:** `lib/ai/index.ts`

```typescript
// Tìm:
if (provider === 'claudible') {
  createParams.max_tokens = 8000
}

// Thay bằng:
if (provider === 'claudible') {
  createParams.max_tokens = 16000
}
```

---

## 5. Fix 4: Cải Thiện Question Bank Display (HIGH)

**Vấn đề:** Testsgen hiện render `markingScheme` và `modelAnswer` qua `<HtmlContent>` component — nhưng AI trả về text dạng markdown/plain (dùng `\n`, `|table|`, ký hiệu `mk`) thay vì HTML thực. Cần thêm một hàm `renderAnswerContent()` tương tự `html_renderer.py` của examsgen để tự động convert sang HTML đẹp trước khi render.

**File:** `app/(dashboard)/exams/[projectId]/[sessionId]/questions/page.tsx`

### 4a. Thêm hàm `renderAnswerContent()` — convert markdown/plain text → HTML

Thêm hàm này vào sau phần `HtmlContent` component (trước `HtmlEditor`):

```typescript
/**
 * Smart renderer: converts AI output (markdown tables, calc lines, plain text) to HTML.
 * Mirrors the logic of examsgen's html_renderer.py.
 */
function renderAnswerContent(text: string): string {
  if (!text) return ''

  // Already HTML — return as-is
  if (/<[a-z][\s\S]*>/i.test(text)) return text

  const lines = text.split('\n').map(l => l.trimEnd())

  // ── Markdown table (lines starting with |) ──────────────────────────────
  const tableLines = lines.filter(l => l.startsWith('|'))
  if (tableLines.length >= 3) {
    let html = '<table class="calc-table w-full border-collapse text-xs my-2">'
    let isFirstRow = true
    for (const line of tableLines) {
      // Skip separator rows  |---|---|
      if (/^\|[-| :]+\|$/.test(line)) { isFirstRow = false; continue }
      const cells = line.replace(/^\||\|$/g, '').split('|').map(c => c.trim())
      if (isFirstRow) {
        html += '<thead><tr>' + cells.map(c => `<th class="border border-gray-300 bg-gray-100 px-2 py-1 text-left">${c}</th>`).join('') + '</tr></thead>'
        isFirstRow = false
      } else {
        html += '<tr>' + cells.map(c => `<td class="border border-gray-200 px-2 py-1">${c}</td>`).join('') + '</tr>'
      }
    }
    html += '</table>'
    // Append non-table lines
    const nonTableLines = lines.filter(l => !l.startsWith('|') && l.trim())
    if (nonTableLines.length > 0) {
      html += '<p class="text-xs mt-1">' + nonTableLines.join('<br>') + '</p>'
    }
    return html
  }

  // ── Inline calc pattern: "Description = expr = result (0.5 mk)" ─────────
  const calcPattern = /^.{2,80}=.+\([\d.]+\s*(mk|mark|marks)\)/i
  const calcLines = lines.filter(l => calcPattern.test(l))
  if (calcLines.length >= 2) {
    let html = '<table class="calc-table w-full border-collapse text-xs my-2"><tbody>'
    for (const line of lines.filter(l => l.trim())) {
      // "Desc = expr = result (X mk)"
      const m3 = line.match(/^(.*?)\s*=\s*(.*?)\s*=\s*([^(=]+)\s*\(([\d.]+\s*(?:mk|marks?))\)/i)
      if (m3) {
        html += `<tr><td class="border border-gray-200 px-2 py-1">${m3[1]}</td><td class="border border-gray-200 px-2 py-1 font-mono">${m3[2]}</td><td class="border border-gray-200 px-2 py-1 font-semibold">${m3[3].trim()}</td><td class="border border-gray-200 px-2 py-1 text-right text-blue-700 font-medium">${m3[4]}</td></tr>`
        continue
      }
      // "Desc = result (X mk)"
      const m2 = line.match(/^(.*?)\s*=\s*([^(]+)\s*\(([\d.]+\s*(?:mk|marks?))\)/i)
      if (m2) {
        html += `<tr><td class="border border-gray-200 px-2 py-1">${m2[1]}</td><td class="border border-gray-200 px-2 py-1"></td><td class="border border-gray-200 px-2 py-1 font-semibold">${m2[2].trim()}</td><td class="border border-gray-200 px-2 py-1 text-right text-blue-700 font-medium">${m2[3]}</td></tr>`
        continue
      }
      // Plain line
      html += `<tr><td class="border border-gray-200 px-2 py-1" colspan="4">${line}</td></tr>`
    }
    html += '</tbody></table>'
    return html
  }

  // ── Bold text (**text**) ─────────────────────────────────────────────────
  let result = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>')

  return `<div class="text-xs">${result}</div>`
}
```

### 4b. Cập nhật `renderAnswerPanel()` — dùng `renderAnswerContent()` thay `HtmlContent`

Trong hàm `renderAnswerPanel(q: Question)`, thay tất cả `<HtmlContent html={...} />` bằng dùng `renderAnswerContent()`:

```typescript
// Thay:
<HtmlContent html={q.markingScheme} />

// Bằng:
<div dangerouslySetInnerHTML={{ __html: renderAnswerContent(q.markingScheme) }} 
     className="text-xs [&_table]:border-collapse [&_table]:w-full [&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-100 [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-gray-200 [&_td]:px-2 [&_td]:py-1" />
```

Tương tự cho `q.modelAnswer` và option `explanation` trong MCQ options loop.

### 4c. Thêm Syllabus code badges đẹp hơn (giống examsgen)

Trong `renderAnswerPanel()`, thay phần syllabus codes section:

```typescript
// Thay phần:
{q.syllabusCode && q.syllabusCode.split(/[,;]/).map(code => code.trim()).filter(Boolean).map(code => (
  <span key={code} className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded font-mono border border-purple-200">
    [{code}]
  </span>
))}
{q.regulationRefs && (
  <span className="text-xs text-gray-400 italic">{q.regulationRefs}</span>
)}

// Bằng:
{(q.syllabusCode || q.regulationRefs) && (
  <div className="mt-3 pt-3 border-t border-gray-200 flex flex-wrap gap-2 items-center">
    {q.syllabusCode && (
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Syllabus tested:</span>
        {q.syllabusCode.split(/[,;]/).map(code => code.trim()).filter(Boolean).map(code => (
          <span key={code} className="inline-block bg-green-50 text-green-800 border border-green-300 rounded px-2 py-0.5 text-xs font-semibold">
            {code}
          </span>
        ))}
      </div>
    )}
    {q.regulationRefs && (
      <span className="text-xs text-gray-400 italic">📋 {q.regulationRefs}</span>
    )}
  </div>
)}
```

### 4d. Thêm section label + marks badge trong question card header

Trong phần render câu hỏi (question card header), cập nhật metadata badges để hiển thị marks rõ hơn:

```typescript
// Tìm dòng:
<span className="text-xs text-gray-500">{q.marks}m</span>

// Thay bằng:
<span className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded font-medium">
  {q.marks} mk
</span>
```

---

## 6. Files Cần Sửa (tóm tắt)

| File | Fix |
|---|---|
| `app/api/sessions/[id]/generate-jobs/[jobId]/run/route.ts` | Fix 1 (caps 100K/40K/30K/15K), Fix 2 (section filter) |
| `app/api/sessions/[id]/generate/route.ts` | Fix 1 (caps) |
| `lib/ai/index.ts` | Fix 3 (max_tokens 8K → 16K) |
| `app/(dashboard)/exams/[projectId]/[sessionId]/questions/page.tsx` | Fix 4 (renderAnswerContent, badges) |

---

## 7. KHÔNG thay đổi

- Schema Prisma — không cần migration
- `lib/ai/prompts.ts` — prompt đã tốt
- Các module khác (Module 2, quiz, gameshow) — không đụng vào
- Document upload flow — không thay đổi

---

## 8. Verify Sau Khi Sửa

1. Upload Decree 320/2025 PDF → generate 1 MCQ CIT question
2. Kiểm tra console log: context size phải > 20K cho TAX_REGULATIONS
3. Câu hỏi phải cite đúng "Decree 320/2025/NĐ-CP, Article X"
4. Question Bank: mở một câu → marking scheme phải hiển thị bảng đẹp (không phải plain text)
5. Syllabus codes phải hiện badge xanh lá (không phải `[C2d]` brackets)

---

**Sau khi Claude Code implement xong và push → nhắn em deploy.**
