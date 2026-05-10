# Module 3 — Study Prep / Exams Prep

Module 3 turns the documents and question bank you already own (Module 1
sessions, Module 2 quiz sets) into student-facing prep assets. It does **not**
re-implement document handling or AI plumbing — it reuses what is already in
place.

## What it produces

For each **Study Prep Set**, an Admin / Teacher can generate any of the three
assets, as many times as they want:

1. **Study Plan** (`StudyPlan`) — mentor-style roadmap.
2. **Secret-Sauce Notes** (`StudyMaterial`) — condensed, exam-oriented notes.
3. **Mock Exam Plan** (`MockExamPlan`) — blueprint for baseline / mid / final
   mocks, mapped to existing question-bank items.

Each asset is stored as Markdown (`content`) plus optional structured JSON
(`structured`), an optional Mermaid mindmap (`mindmap`), and citation refs
(`sourceRefs`). Teachers can edit, publish, and download as `.md`.

## Schema additions

Only four new tables are added (see `prisma/schema.prisma`):

```
testsgen_study_prep_sets    -- container linked to a Session and/or QuizSet
testsgen_study_plans        -- generated study plans
testsgen_study_materials    -- generated "secret sauce" notes
testsgen_mock_exam_plans    -- generated mock exam blueprints
```

`StudyPrepSet.sessionId` and `StudyPrepSet.quizSetId` are nullable, with
`onDelete: SetNull` — deleting the source session/quiz keeps the prep assets
intact.

The Coolify Dockerfile already runs `prisma db push --accept-data-loss
--skip-generate` on container start, so the new tables are created
automatically — no manual migration step.

## API surface

Under `/api/study-prep/`:

- `GET  /sets` — list visible prep sets
- `POST /sets` — create one (must link to a Session or QuizSet you own)
- `GET  /sets/{id}` — detail (with embedded session/quiz docs, topics, assets)
- `PATCH /sets/{id}` — edit metadata
- `DELETE /sets/{id}` — delete
- `GET  /available-sources` — source picker data for the New Prep Set page
- `POST /sets/{id}/plans/generate`     → creates a `StudyPlan`
- `POST /sets/{id}/materials/generate` → creates a `StudyMaterial`
- `POST /sets/{id}/mock-plans/generate` → creates a `MockExamPlan`
- `GET / PATCH / DELETE /plans/{id}`, `/materials/{id}`, `/mock-plans/{id}`

Generation request body (all optional):

```json
{
  "modelId": "openrouter:qwen/qwen3-plus",
  "notes": "Focus on Vietnam CIT and PIT only.",
  "documentIds": ["..."],
  "quizDocumentIds": ["..."],
  "questionIds": ["..."],
  "quizQuestionIds": ["..."],
  "includeParsedQuestions": true
}
```

If you omit the include* arrays, all documents and questions linked to the
session / quiz set are used.

## How sources are reused

`lib/ai/study-prep-sources.ts` builds a normalized `StudyPrepContext` by
reading directly from the existing Module 1 / Module 2 tables:

- `Document` and `QuizDocument` — text extracted via the same helpers used
  elsewhere (`pdf-parse`, `mammoth`, raw UTF-8).
- `Question`, `ParsedQuestion`, `QuizQuestion` — used as "representative
  questions / past questions / question bank items" in the prompt.
- `Topic` — registered topic names are passed through as known topics.

Per-file extraction is capped (60k chars per file, 80k total across docs, 60
representative questions) to fit the AI context window.

## Prompts

`lib/ai/study-prep-prompts.ts` exports three builders. They share a common
header (target exam, days until exam, weekly hours, language) and a sources
block. Every prompt asks the model to:

- ground claims in the supplied sources;
- cite inline using `[doc:<id>]` / `[q:<id>]`;
- return a single fenced JSON object containing
  `title`, `summary`, `markdown`, `structured`, `mindmap`, `citedSources`.

The renderer in `components/study-prep/markdown-view.tsx` highlights
`[doc:id]` / `[q:id]` citations as small green chips so teachers can spot the
traceability quickly.

`lib/ai/study-prep-runner.ts` wraps `callAI` (already used by Module 1 / 2),
parses the JSON tolerantly via `extractStudyPrepJSON`, and falls back to
"raw text as Markdown" if the model didn't follow the schema.

## UI surface

Under `/dashboard/study-prep/`:

- `/study-prep` — list of prep sets
- `/study-prep/new` — create one (pick session and/or quiz set, set goals)
- `/study-prep/[id]` — detail page with three tabs (Plans / Materials / Mock
  Plans), a generator panel (model picker + extra notes), and editable cards
  per asset.

Asset cards support inline editing of Markdown content, a Mindmap tab
rendered with Mermaid (lazy-loaded from CDN — no npm dep), Publish / Unpublish
toggle, `.md` download, and delete.

## Mindmap & exports

- **Mindmap** — Mermaid mindmap source is generated alongside plans and
  notes, rendered client-side via `https://cdn.jsdelivr.net/npm/mermaid@11`.
  If Mermaid fails to load (offline VPS, blocked CDN, etc.) the source code
  is shown as a fallback so nothing is lost.
- **Markdown export** — every asset card has a Download button that exports
  the current Markdown (after edits) to `<title>.md`.
- **Slides / PPTX** — out of scope for v1. The Markdown can be pasted into
  any Markdown-to-slides tool (Marp, Slidev, Google Slides via the existing
  Pipedream connector if you want to automate).
- **Audio brief / podcast** — also out of scope for v1. See SurfSense
  recommendation below.

## Optional companion: SurfSense / NotebookLM

We **do not** merge the SurfSense codebase into TestsGen. Module 3 is
self-contained.

If you want richer, NotebookLM-style features (multi-document cited
synthesis, podcast generation, notebook Q&A across many sources), the
recommended pattern is:

- Run SurfSense as a separate service (its own container in Coolify) with
  its own auth and database.
- From TestsGen, hit SurfSense via HTTP through a small client wrapper. Keep
  it behind an env flag like `SURFSENSE_BASE_URL` and only show the related
  buttons when that env var is set.
- Push relevant Module 3 source files to a SurfSense notebook on prep-set
  creation, then call the SurfSense generate-podcast endpoint when the user
  clicks "Audio brief".

This keeps the boundary clean — SurfSense upgrades stay independent and
TestsGen stays small. Module 3 already produces editable Markdown plus
structured JSON, which is exactly the artifact a podcast/audio service
needs as input.

## Constraints honoured

- **Module 1 / 2 still work** — no existing route, model, or UI changed
  beyond adding a sidebar entry, a dashboard tile, and three new relations.
- **Reuse, not duplication** — extraction is shared and the same `callAI`
  is used.
- **Coolify-friendly** — no new heavy npm deps, no native modules, no
  background workers; generation is synchronous on a single request (capped
  by `maxDuration = 300` per route).
- **Editable** — every asset is plain Markdown that the teacher can edit and
  republish.
- **Citations visible** — all prompts demand `[doc:id]` / `[q:id]` inline
  citations, and the renderer highlights them.
- **Hallucination control** — the prompt explicitly tells the model to state
  "missing / unclear" rather than invent facts when sources don't cover a
  topic.

## Recommended workflow for Admin / Teacher

1. **Reuse, don't rebuild.** Pick the existing Module 1 session and/or
   Module 2 quiz set as the source of truth. Do **not** re-upload documents
   for Module 3.
2. **Set the target.** Fill in the exam date, target score, and weekly study
   hours when creating the prep set. The AI uses these to size the schedule.
3. **Generate the Study Plan first.** Review and edit it — that becomes the
   spine of the prep cycle.
4. **Generate the Secret-Sauce Notes.** Skim and edit any topic where the
   model was thin or got the citation wrong; trust the `[doc:id]` chips
   for traceability.
5. **Generate the Mock Exam Plan last.** It uses the question bank IDs from
   Module 1 — verify the suggested IDs actually exist before assembling
   variants.
6. **Publish.** Mark the assets as `PUBLISHED` once you're happy. Download
   to `.md` if you want to share outside the app.
7. **Iterate.** Each generation is a new draft — keep the best ones and
   delete the rest.
