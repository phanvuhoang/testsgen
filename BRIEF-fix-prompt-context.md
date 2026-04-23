# BRIEF: Fix Document Loading + Prompt Context + Output Metadata

**Repo:** phanvuhoang/testsgen  
**Module:** Module 1  
**Nguyên nhân:** 3 bugs riêng biệt ở 3 tầng khác nhau khiến AI không "thấy" regulations và sample questions

---

## Phân tích root cause

### Bug A — `lib/ai/prompts.ts` (CRITICAL): Hard-coded `.slice()` override toàn bộ Fix 1

Dù `run/route.ts` đã truyền đúng context dài, trong `buildExamQuestionPrompt()` có các dòng này **override hết**:

```typescript
// lib/ai/prompts.ts — HIỆN TẠI (SAI)
contextParts.push(`=== SYLLABUS ===\n...\n${config.syllabus.slice(0, 15000)}`)         // bị cắt 15K
contextParts.push(`=== REGULATIONS / TAX LAW ===\n...\n${config.regulations.slice(0, 20000)}`)  // bị cắt 20K!
contextParts.push(`=== RATES & TARIFF TABLES ===\n...\n${config.ratesTariff.slice(0, 8000)}`)   // bị cắt 8K!
contextParts.push(`=== SAMPLE QUESTIONS ===\n...\n${sampleContent.slice(0, 12000)}`)           // bị cắt 12K!
contextParts.push(`=== ADDITIONAL CONTEXT ===\n...\n${config.otherContext.slice(0, 8000)}`)     // bị cắt 8K!
```

→ Fix 1 (caps 100K/40K/30K/15K) trong `run/route.ts` **hoàn toàn vô hiệu** vì prompts.ts re-slice lại.

### Bug B — `lib/ai/prompts.ts`: Prompt không yêu cầu AI cite document name

Prompt nói "ONLY cite regulations whose names appear verbatim in provided documents. If unsure, write **'See uploaded regulations'**" → đây chính là lý do AI luôn viết "See uploaded regulations" thay vì cite cụ thể. Rule này quá thụ động — cần sửa thành chủ động hơn.

### Bug C — `lib/ai/prompts.ts`: Sample questions chỉ được gọi là "STYLE REFERENCE"

Anti-hallucination rule #6 hiện tại: *"SAMPLE QUESTIONS are for STYLE REFERENCE only... do NOT extract regulation names from them"* → AI bị hướng dẫn **bỏ qua nội dung** của sample, chỉ học format. Vì vậy dù sample được load, AI không học topic/content từ đó.

---

## Fix 1: Xóa hard-coded `.slice()` trong `lib/ai/prompts.ts` (CRITICAL)

**File:** `lib/ai/prompts.ts`

Trong hàm `buildExamQuestionPrompt()`, tìm và sửa phần `// ── Document context ──`:

```typescript
// ── Document context ──────────────────────────────────────────────────────
const contextParts: string[] = []

if (config.syllabus) {
  let syllabusNote = 'IMPORTANT: Only generate questions on topics LISTED in the syllabus. Do NOT generate questions on [EXCLUDE] topics.'
  if (config.syllabusCode) {
    syllabusNote += `\nFOCUS ONLY on syllabus code(s): ${config.syllabusCode}. Ignore other sections.`
  }
  // THAY: config.syllabus.slice(0, 15000) → config.syllabus (NO slice — already capped upstream)
  contextParts.push(`=== SYLLABUS ===\n${syllabusNote}\n${config.syllabus}`)
}

if (config.regulations) {
  // THAY: config.regulations.slice(0, 20000) → config.regulations (NO slice)
  contextParts.push(`=== REGULATIONS / TAX LAW ===\nBase questions on these regulations. Use specific article numbers, percentages, thresholds, and rules.\nDO NOT hallucinate figures — only use numbers explicitly stated below.\n${config.regulations}`)
}

if (config.studyMaterial && config.studyMaterial !== config.regulations) {
  // THAY: .slice(0, 10000) → no slice
  contextParts.push(`=== STUDY MATERIAL ===\n${config.studyMaterial}`)
}

if (config.ratesTariff) {
  // THAY: .slice(0, 8000) → no slice
  contextParts.push(`=== RATES & TARIFF TABLES ===\nFor calculation questions, use ONLY the rates and thresholds in this table.\n${config.ratesTariff}`)
}

// Sample questions: prefer filtered (by selected topic) over full pool
const sampleContent = config.sampleQuestionsFiltered || config.sampleQuestions
if (sampleContent) {
  // THAY: .slice(0, 12000) → no slice
  contextParts.push(`=== SAMPLE QUESTIONS & ANSWERS (STYLE REFERENCE) ===\nUse these as style reference — same format, depth, language, and difficulty.\nDO NOT copy questions verbatim. Generate NEW questions in the same style.\n${sampleContent}`)
}

if (config.otherContext) {
  // THAY: .slice(0, 8000) → no slice
  contextParts.push(`=== ADDITIONAL CONTEXT ===\n${config.otherContext}`)
}
```

**Tóm lại: xóa TẤT CẢ `.slice(0, NNNNN)` trong phần contextParts.** Context đã được capped đúng ở `run/route.ts` và `generate/route.ts` rồi — không cần cắt lần hai.

---

## Fix 2: Cải thiện prompt — citation và document reference (HIGH)

**File:** `lib/ai/prompts.ts`

### 2a. Thêm `sourceDocuments` vào `ExamGenerationConfig` type

Thêm field này vào type `ExamGenerationConfig`:

```typescript
// Thêm vào interface ExamGenerationConfig:
sourceDocuments?: {    // List of uploaded document names for citation
  regulations: string[]    // e.g. ["Decree_320_2025.pdf", "Circular_80_2021.pdf"]
  syllabus: string[]       // e.g. ["ACCA_TX_VNM_Syllabus_2025.pdf"]
  samples: string[]        // e.g. ["Sample_MCQ_CIT_2024.pdf"]
  rates: string[]          // e.g. ["Tax_Rates_2025.xlsx"]
}
```

### 2b. Truyền `sourceDocuments` từ `run/route.ts`

**File:** `app/api/sessions/[id]/generate-jobs/[jobId]/run/route.ts`

Sau khi build `relevantDocsByType`, thêm:

```typescript
// Sau vòng lặp `for (const doc of relevantDocs)`:
const sourceDocuments = {
  regulations: (relevantDocsByType['TAX_REGULATIONS'] || []).map((_: string, i: number) => relevantDocs.filter((d: any) => d.fileType === 'TAX_REGULATIONS')[i]?.fileName || '').filter(Boolean),
  syllabus:    (relevantDocsByType['SYLLABUS'] || []).map((_: string, i: number) => relevantDocs.filter((d: any) => d.fileType === 'SYLLABUS')[i]?.fileName || '').filter(Boolean),
  samples:     (relevantDocsByType['SAMPLE_QUESTIONS'] || []).map((_: string, i: number) => relevantDocs.filter((d: any) => d.fileType === 'SAMPLE_QUESTIONS')[i]?.fileName || '').filter(Boolean),
  rates:       (relevantDocsByType['RATES_TARIFF'] || []).map((_: string, i: number) => relevantDocs.filter((d: any) => d.fileType === 'RATES_TARIFF')[i]?.fileName || '').filter(Boolean),
}
```

Thêm `sourceDocuments` vào `generatorConfig`:

```typescript
const generatorConfig = {
  // ... các fields hiện tại ...
  sourceDocuments,   // ← thêm dòng này
}
```

### 2c. Tương tự cho `generate/route.ts`

**File:** `app/api/sessions/[id]/generate/route.ts`

Thêm logic tương tự: build `sourceDocuments` từ `docsByType` và `docs`, rồi truyền vào `generatorConfig`.

### 2d. Sửa anti-hallucination rules và citation instructions trong prompt

**File:** `lib/ai/prompts.ts` — trong `buildExamQuestionPrompt()`

#### Thêm block `sourceDocumentsBlock` (sau phần context, trước anti-hallucination):

```typescript
// Thêm sau dòng: const hasDocuments = contextParts.length > 0

// ── Source document names block ───────────────────────────────────────────
let sourceDocumentsBlock = ''
if (config.sourceDocuments) {
  const sd = config.sourceDocuments
  const parts: string[] = []
  if (sd.regulations?.length)  parts.push(`Regulations: ${sd.regulations.join(', ')}`)
  if (sd.syllabus?.length)     parts.push(`Syllabus: ${sd.syllabus.join(', ')}`)
  if (sd.samples?.length)      parts.push(`Sample questions: ${sd.samples.join(', ')}`)
  if (sd.rates?.length)        parts.push(`Rates/Tariff: ${sd.rates.join(', ')}`)
  if (parts.length > 0) {
    sourceDocumentsBlock = `## UPLOADED DOCUMENTS FOR THIS EXAM SESSION\n${parts.join('\n')}\n(Use these document names when citing sources in your output)`
  }
}
```

#### Sửa `antiHallucinationRules`:

```typescript
const antiHallucinationRules = hasDocuments ? `
## CRITICAL DOCUMENT RULES — READ FIRST
1. ALL questions MUST be based on the provided documents (Regulations, Syllabus, Sample Questions).
   If documents are provided, DO NOT draw from general knowledge or training data.
2. REGULATIONS: Use the specific article numbers, rates, thresholds, and rules that appear in
   the REGULATIONS / TAX LAW section. When citing, name the document AND article, e.g.
   "Article 9, Decree 320/2025/ND-CP" — extract the name from the document filename or header.
3. SYLLABUS CODES: Tag every question with the exact syllabus code(s) from the SYLLABUS document,
   e.g. "C2d", "A1.3". Do not invent codes not in the syllabus.
4. SAMPLE QUESTIONS: Study the sample questions deeply — replicate their TOPIC COVERAGE,
   SCENARIO STYLE, CALCULATION DEPTH, and OPTION STRUCTURE. The samples show exactly what
   kind of questions are expected. Match their difficulty and approach closely.
5. SOURCE CITATION in output: Every question must include:
   - "syllabusCode": exact code(s) from syllabus document (e.g. "C2d, C2n")
   - "reference": specific article + document name (e.g. "Article 9(1), Decree 320/2025/ND-CP")
     If article not found: cite document name only, e.g. "Decree 320/2025/ND-CP"
     NEVER write "See uploaded regulations" — always cite the document name at minimum.
   - "sampleRef": name of the sample file whose style was referenced (e.g. "Sample_MCQ_CIT_2024.pdf")
6. If NO documents are provided for a given type (no regulations, no samples), you may draw
   from general knowledge — but state clearly in the reference field that no document was provided.` : ''
```

### 2e. Sửa OUTPUT FORMAT — thêm `sampleRef` field

Trong phần `## OUTPUT FORMAT` của `buildExamQuestionPrompt()`, thêm field `sampleRef`:

```typescript
// Tìm phần OUTPUT FORMAT JSON example, thêm field sampleRef:
// Sau dòng "reference": "...",
// Thêm:
// "sampleRef": "Name of the sample file whose style was followed (from UPLOADED DOCUMENTS list)",
```

Cụ thể, trong chuỗi return, tìm:
```
    "reference": "Only cite if regulation name appears verbatim in the provided documents. Otherwise: See uploaded regulations.",
    "syllabusCode": "C2d, C2n",
```

Thay bằng:
```
    "reference": "Article X(Y), Decree 320/2025/ND-CP — cite specific article and document name. NEVER write 'See uploaded regulations'.",
    "syllabusCode": "C2d, C2n — exact codes from the provided syllabus document",
    "sampleRef": "Sample_MCQ_CIT_2024.pdf — name of sample file whose style was followed",
```

---

## Fix 3: Lưu `sampleRef` vào DB và hiển thị trong Question Bank (MEDIUM)

### 3a. Lưu `sampleRef` vào DB

**File:** `app/api/sessions/[id]/generate-jobs/[jobId]/run/route.ts`

Trong vòng lặp `for await (const q of generateExamQuestions(...))`, trong `db.question.create()`:

```typescript
// Tìm phần data trong question.create, thêm field:
regulationRefs: q.reference ? String(q.reference) : (q.regulationRefs ? String(q.regulationRefs) : undefined),
// Thêm ngay sau dòng trên:
// sampleRef: q.sampleRef ? String(q.sampleRef) : undefined,
```

**Lưu ý:** Field `sampleRef` chưa có trong schema Prisma. Có 2 cách xử lý không cần migration:

**Option A (không cần migration — dùng ngay):** Nối `sampleRef` vào cuối `regulationRefs`:
```typescript
const refParts = []
if (q.reference) refParts.push(String(q.reference))
if (q.regulationRefs) refParts.push(String(q.regulationRefs))
if (q.sampleRef) refParts.push(`Sample ref: ${String(q.sampleRef)}`)

regulationRefs: refParts.length > 0 ? refParts.join(' | ') : undefined,
```

→ Dùng Option A để tránh migration.

### 3b. Thêm `sourceDocumentsBlock` vào prompt return

**File:** `lib/ai/prompts.ts`

Trong chuỗi `return` của `buildExamQuestionPrompt()`, thêm `sourceDocumentsBlock` vào sau `antiHallucinationRules`:

```typescript
return `${personaLine}

${antiHallucinationRules}

${sourceDocumentsBlock}

${languageInstruction}${calcMarksInstruction}
## GENERATION PARAMETERS
...
```

---

## Fix 4: Cải thiện Question Bank display (từ brief trước — giữ nguyên)

**File:** `app/(dashboard)/exams/[projectId]/[sessionId]/questions/page.tsx`

Xem chi tiết Fix 4 trong brief trước (renderAnswerContent, syllabus badges, marks badge). Implement đầy đủ theo brief trước.

---

## Tóm tắt files cần sửa

| File | Fix | Tại sao |
|---|---|---|
| `lib/ai/prompts.ts` | Fix 1: xóa `.slice()` trong contextParts | Đây là bug chính — override hết caps từ Fix 1 cũ |
| `lib/ai/prompts.ts` | Fix 2d+2e: sửa anti-hallucination, output format | AI bị hướng dẫn không cite cụ thể |
| `app/api/sessions/[id]/generate-jobs/[jobId]/run/route.ts` | Fix 2b: build + truyền sourceDocuments | Để AI biết tên file để cite |
| `app/api/sessions/[id]/generate/route.ts` | Fix 2c: tương tự | Đồng bộ 2 generate endpoints |
| `app/(dashboard)/exams/[projectId]/[sessionId]/questions/page.tsx` | Fix 4: display cải thiện | Question bank hiển thị đẹp hơn |

---

## KHÔNG thay đổi

- Schema Prisma — không cần migration (dùng Option A nối string cho sampleRef)
- `run/route.ts` caps constants — đã đúng, giữ nguyên
- `lib/ai/index.ts` max_tokens — đã fix, giữ nguyên
- Module 2, quiz, gameshow — không đụng vào

---

## Verify sau khi sửa

1. Generate 1 MCQ CIT với Decree 320/2025 và Sample_MCQ_CIT
2. Output phải có:
   - `"reference": "Article X, Decree 320/2025/ND-CP"` (KHÔNG phải "See uploaded regulations")
   - `"syllabusCode": "C2d"` (code thực từ syllabus file)
   - `"sampleRef": "Sample_MCQ_CIT_2024.pdf"` (tên file sample)
3. Style câu hỏi phải gần giống sample (scenario → calculation → 4 options)
4. Question Bank: regulation ref hiện ở cuối câu, syllabus badge màu xanh

---

**Sau khi Claude Code implement xong và push → nhắn em deploy.**
