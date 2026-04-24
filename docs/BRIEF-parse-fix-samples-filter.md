# BRIEF: Parse Fix + Samples Filter/Search/Bulk Delete

**Repo:** github.com/phanvuhoang/testsgen  
**Date:** 2026-04-24  
**Files to modify:**
1. `app/api/sessions/[id]/documents/[docId]/parse/route.ts`
2. `app/(dashboard)/exams/[projectId]/[sessionId]/samples/page.tsx`

---

## CHANGE 1: Fix Parse — Remove AI Fallback, Pure Rule-Based Only

### Problem
Currently `parse/route.ts` falls back to AI (`parseWithAI`) when the structural parse finds 0 questions. This causes two issues:
1. AI sometimes omits the `answer` field (truncates content)
2. Parse should be purely algorithmic — no AI involvement

### Fix Required in `parse/route.ts`

**Remove AI fallback entirely from the main POST handler.**

Current logic (simplified):
```
if structural parse → 0 results → fall back to AI
if forceAI || parseStyle === 'ai' → use AI
```

**New logic — Remove ALL AI fallback:**
```
if structural parse → 0 results → return error "No questions found. ..."
NEVER call parseWithAI() in normal flow
```

Specifically in the POST handler, remove this entire block:
```typescript
// AI fallback — always if structural found 0, or forceAI/ai style
if (rawQuestions.length === 0 || parseStyle === 'ai' || forceAI) {
  // ... all this AI stuff
}
```

Replace with: if `rawQuestions.length === 0`, return the existing "No questions found" error response immediately.

**Keep** the `parseWithAI` function definition in the file (don't delete it), but it should NOT be called from the POST handler anymore.

**Keep** the `forceAI` and `parseStyle === 'ai'` variables — but simply ignore them (or keep for future use, just don't call AI).

### How the rule-based parse works (no changes needed here)

The existing `parseByHeadingKeyword()` and `parseByTextSplit()` functions are correct. They:
1. Extract paragraphs from DOCX via `parseDocxParagraphs()` (3 strategies: adm-zip → buffer scan → mammoth)
2. Find all paragraphs matching `keywordPattern` (e.g. `/^Example\s+\d+\s*:/i`)
3. Collect ALL text from that heading to the next matching heading
4. Split on `Answer|Ans|Solution|Marking Scheme|ANSWER` to separate question vs answer
5. Return `{ title, content, answer, questionType, difficulty }`

This already captures the full answer text — the AI was the one losing it. The rule-based approach keeps everything verbatim.

### Also fix: Parse Dialog UI — Remove "AI Parse" mode option (if present)

In `documents/page.tsx`, if there is a "Use AI" toggle or `parseStyle = 'ai'` option in the Parse dialog UI, remove it or disable it. Parse should only offer: Heading1 / Heading2 / Heading3 / None / Numbered.

---

## CHANGE 2: Samples Page — Add Filter/Search + Bulk Delete

### File: `app/(dashboard)/exams/[projectId]/[sessionId]/samples/page.tsx`

The Samples page currently shows all `ParsedQuestion` records. Add these features (mirror the Question Bank page style):

### 2a. Filter Bar (above the question list)

Add a filter/search bar with these controls in a single row:

```
[🔍 Search text input] [Topic dropdown] [Section dropdown] [Question Type dropdown] [Clear Filters button]
```

- **Search:** filters by `q.content` or `q.title` containing the search string (case-insensitive, client-side)
- **Topic filter:** `<Select>` populated from `topics` state (already fetched). Value = topic id. Filter: `q.topicName === selectedTopic.name` or `q.topicId === selectedTopicId`. Show "All Topics" as default (`"__all__"` sentinel).
- **Section filter:** `<Select>` populated from `sections` state (already fetched). Show "All Sections" as default (`"__all__"` sentinel).
- **Question Type filter:** hardcoded options from `questionTypeLabels`. Show "All Types" as default (`"__all__"` sentinel).
- **NO difficulty filter** (as requested — no difficulty filter needed)
- **Clear Filters:** reset all filters to default

All filtering is **client-side** — filter the `questions` array before rendering.

### 2b. Bulk Select + Delete

Add bulk selection mechanism:

**Header row changes:**
- Add a "Select All" checkbox on the left of the header
- Add a "Delete Selected (N)" button that appears only when `selectedIds.size > 0`

**Each question card:**
- Add a checkbox on the far left (before the index number)
- Clicking checkbox toggles `selectedIds` Set

**State to add:**
```typescript
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
```

**Bulk delete handler:**
```typescript
const handleBulkDelete = async () => {
  if (!confirm(`Delete ${selectedIds.size} selected questions?`)) return
  // Call DELETE for each selected id
  await Promise.all(
    Array.from(selectedIds).map(id =>
      fetch(`/api/sessions/${params.sessionId}/parsed-questions/${id}`, { method: 'DELETE' })
    )
  )
  setQuestions(prev => prev.filter(q => !selectedIds.has(q.id)))
  setSelectedIds(new Set())
  toast({ title: `Deleted ${selectedIds.size} questions` })
}
```

**Select All behavior:**
- If all visible (filtered) questions are selected → unselect all
- Otherwise → select all visible (filtered) questions

### 2c. Result count

Below the filter bar, show: `Showing X of Y questions` (X = filtered count, Y = total).

### 2d. Keep existing features

Keep all existing functionality:
- Expand/collapse individual question
- Edit individual question (inline)
- Delete individual question
- Add manual sample (dialog)

---

## Summary of changes

| File | Change |
|---|---|
| `parse/route.ts` | Remove AI fallback from POST handler. Rule-based only. |
| `samples/page.tsx` | Add filter bar (Search + Topic + Section + Type) + Bulk select/delete |

## Important notes

- Do NOT change any DB schema or API routes
- Do NOT add difficulty filter to Samples
- Keep `parseWithAI()` function body in route.ts (just don't call it)
- After implementing, delete this brief file, then commit and push to GitHub

