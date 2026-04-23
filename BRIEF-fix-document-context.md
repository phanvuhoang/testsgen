# BRIEF: Fix Document Context — AI Bịa Regulations Do Context Bị Cắt Quá Ngắn

**Repo:** phanvuhoang/testsgen  
**Module:** Module 1 (Exam generation — `app/api/sessions/[id]/generate-jobs/[jobId]/run/route.ts` + `lib/ai/prompts.ts`)  
**Priority:** Critical — đây là nguyên nhân chính AI không tham khảo regulations mà tự bịa article numbers

---

## 1. Root Cause

Hiện tại mọi document đều bị cắt còn **20,000 chars** trước khi đưa vào AI prompt:

```typescript
// run/route.ts — hiện tại
const joinScopedContent = (key: string) =>
  (relevantDocsByType[key] || []).join('\n\n---\n\n').slice(0, 20_000)  // ← QUÁ NGẮN
```

Và `extractDocumentText()` cũng cắt ở 50K:
```typescript
return data.text.slice(0, 50000)  // ← cần nâng lên
```

Một Nghị định thuế thực tế (VD: Decree 320/2025/NĐ-CP) thường **80,000–150,000 chars**. Với giới hạn 20K, AI chỉ thấy ~15% đầu file (thường là header + định nghĩa chung), không thấy các điều khoản cụ thể → **bịa article numbers và tax rates**.

---

## 2. Các Thay Đổi Cần Làm

### Fix 1: Tăng context caps theo từng loại document (QUAN TRỌNG NHẤT)

**File:** `app/api/sessions/[id]/generate-jobs/[jobId]/run/route.ts`

Thay đổi hàm `extractDocumentText` và thêm constants:

```typescript
// ── Context budget constants ─────────────────────────────────────────────
const MAX_REGULATIONS_CHARS  = 80_000   // ~20K tokens — đủ cho 1 Nghị định dài
const MAX_SYLLABUS_CHARS     = 40_000   // ~10K tokens
const MAX_RATES_CHARS        = 30_000   // ~7.5K tokens
const MAX_SAMPLE_CHARS       = 15_000   // ~3.75K tokens
const MAX_STUDY_CHARS        = 15_000   // ~3.75K tokens
const MAX_OTHER_CHARS        = 10_000   // ~2.5K tokens
const MAX_PER_FILE_CHARS     = 120_000  // cap per individual file extraction

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

Thay hàm `joinScopedContent` bằng `joinScopedContentTyped` có per-type caps:

```typescript
// Thay dòng này:
// const joinScopedContent = (key: string) => (relevantDocsByType[key] || []).join('\n\n---\n\n').slice(0, 20000)

// Bằng hàm này:
const JOIN_CAPS: Record<string, number> = {
  TAX_REGULATIONS: MAX_REGULATIONS_CHARS,
  SYLLABUS:        MAX_SYLLABUS_CHARS,
  RATES_TARIFF:    MAX_RATES_CHARS,
  SAMPLE_QUESTIONS: MAX_SAMPLE_CHARS,
  STUDY_MATERIAL:  MAX_STUDY_CHARS,
  OTHER:           MAX_OTHER_CHARS,
}

const joinScopedContent = (key: string) => {
  const cap = JOIN_CAPS[key] ?? MAX_OTHER_CHARS
  return (relevantDocsByType[key] || []).join('\n\n---\n\n').slice(0, cap)
}
```

Áp dụng tương tự cho `generate/route.ts` (sync generate endpoint):

**File:** `app/api/sessions/[id]/generate/route.ts`

```typescript
// Thêm constants giống trên vào đầu file

// Thay:
// const joinContent = (key: string) => (docsByType[key] || []).join('\n\n---\n\n').slice(0, 20000)

// Bằng:
const JOIN_CAPS_SYNC: Record<string, number> = {
  TAX_REGULATIONS:  80_000,
  SYLLABUS:         40_000,
  RATES_TARIFF:     30_000,
  SAMPLE_QUESTIONS: 15_000,
  STUDY_MATERIAL:   15_000,
  OTHER:            10_000,
}
const joinContent = (key: string) => {
  const cap = JOIN_CAPS_SYNC[key] ?? 10_000
  return (docsByType[key] || []).join('\n\n---\n\n').slice(0, cap)
}
```

---

### Fix 2: Thêm section filtering trong `getRelevantDocs()` — CASE 2

**File:** `app/api/sessions/[id]/generate-jobs/[jobId]/run/route.ts`

Hiện tại CASE 2 (user chọn topic) **chỉ filter theo topicId, bỏ qua sectionId**. Nếu document được tagged vào specific sections nhưng không match topic, nó vẫn bị exclude đúng — nhưng ngược lại, nếu document được tagged vào nhiều sections mà user chỉ muốn gen 1 section, vẫn bị include tất cả.

Thêm logic: nếu document có section tags VÀ selectedSectionId không nằm trong đó → exclude:

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

  // Helper: check if doc is scoped to the current section (or unscoped)
  const matchesSection = (d: any): boolean => {
    const docSectionIds = parseDocSectionIds(d)
    if (docSectionIds.length === 0) return true  // unscoped → always include
    return docSectionIds.includes(selectedSectionId)
  }

  if (selectedTopicIds.length === 0) {
    // CASE 1: no topic selected → filter by section tag
    return allDocs.filter((d: any) => {
      const hasTopicTag = d.topicId || (d.topicIds && d.topicIds !== '[]')
      const hasSectionTag = matchesSection(d)
      return !hasTopicTag || hasSectionTag
    })
  }

  // CASE 2: topic(s) selected → filter by topic AND section
  return allDocs.filter((d: any) => {
    // Check topic match
    const docTopicIds: string[] = d.topicIds
      ? (() => { try { return JSON.parse(d.topicIds) } catch { return d.topicId ? [d.topicId] : [] } })()
      : (d.topicId ? [d.topicId] : [])

    const topicMatch = docTopicIds.length === 0 || docTopicIds.some((id: string) => selectedTopicIds.includes(id))
    if (!topicMatch) return false

    // Also check section match (unscoped docs always pass)
    return matchesSection(d)
  })
}
```

---

### Fix 3: Fallback khi sample questions chưa được parse

**File:** `app/api/sessions/[id]/generate-jobs/[jobId]/run/route.ts`

Hiện tại nếu `filteredSamples = []` (user chưa bấm Parse 🧩), `sampleQuestionsFiltered = undefined` và code dùng:
```typescript
sampleQuestions: joinScopedContent('SAMPLE_QUESTIONS'),  // ← raw file, ok
```

Đây thực ra đã có fallback đúng rồi. **Không cần thay đổi gì thêm cho Fix 3** — logic hiện tại đã fallback về raw file khi không có parsed questions.

---

### Fix 4: Tăng `max_tokens` cho Claudible trong `lib/ai/index.ts`

**File:** `lib/ai/index.ts`

Với context lớn hơn, AI cần nhiều output tokens hơn để trả lời đầy đủ:

```typescript
// Tìm đoạn này:
if (provider === 'claudible') {
  createParams.max_tokens = 8000
}

// Thay bằng:
if (provider === 'claudible') {
  createParams.max_tokens = 16000
}
```

---

## 3. Files Cần Sửa (tóm tắt)

| File | Thay đổi |
|------|----------|
| `app/api/sessions/[id]/generate-jobs/[jobId]/run/route.ts` | Fix 1 (caps), Fix 2 (section filter) |
| `app/api/sessions/[id]/generate/route.ts` | Fix 1 (caps) |
| `lib/ai/index.ts` | Fix 4 (max_tokens Claudible) |

---

## 4. KHÔNG thay đổi

- Schema Prisma — không cần migration
- `lib/ai/prompts.ts` — prompt đã tốt, không đụng vào
- Frontend — không cần thay đổi gì
- Các module khác (Module 2, quiz, gameshow) — không đụng vào

---

## 5. Verify sau khi sửa

Chạy một generation test với file Decree 320-2025 (tagged CIT) và kiểm tra:
1. Log console: context size phải > 20K chars cho TAX_REGULATIONS
2. Câu hỏi output: phải cite đúng "Decree 320/2025/NĐ-CP, Article X" (không phải bịa)
3. Không có lỗi runtime

---

**Sau khi Claude Code implement xong và push → nhắn deploy.**
