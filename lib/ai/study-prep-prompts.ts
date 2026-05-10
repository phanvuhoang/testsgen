// Module 3 — Study Prep / Exams Prep prompt builders
// These builders produce study plans, "secret sauce" notes, and mock-exam plans
// from documents + questions already gathered in Module 1 / Module 2.

export type SourceDoc = {
  id: string
  fileName: string
  fileType?: string
  text: string                  // truncated extracted text
}

export type SourceQuestion = {
  id: string
  source: 'question' | 'quizQuestion' | 'parsedQuestion'
  topic?: string | null
  difficulty?: string | null
  stem: string
  correctAnswer?: string | null
  questionType?: string | null
}

export type StudyPrepContext = {
  prepSetName: string
  targetExam?: string | null
  examDate?: string | null         // ISO yyyy-mm-dd
  daysUntilExam?: number | null
  targetScore?: string | null
  weeklyHours?: number | null
  language: 'en' | 'vi'
  documents: SourceDoc[]
  questions: SourceQuestion[]
  topicNames: string[]
  notes?: string                   // free-form admin/teacher instructions
}

// ── Budget caps so we never blow the context window ─────────────────────────
const MAX_DOC_CHARS_TOTAL = 80_000
const MAX_DOC_CHARS_EACH  = 18_000
const MAX_QUESTIONS       = 60

function buildSourcesBlock(ctx: StudyPrepContext): string {
  let used = 0
  const docLines: string[] = []
  for (const d of ctx.documents) {
    if (used >= MAX_DOC_CHARS_TOTAL) break
    const slice = (d.text || '').slice(0, MAX_DOC_CHARS_EACH)
    used += slice.length
    docLines.push(
      `--- DOC[id=${d.id} | name="${d.fileName}"${d.fileType ? ` | type=${d.fileType}` : ''}] ---\n${slice}`
    )
  }
  const docsText = docLines.length
    ? docLines.join('\n\n')
    : '(no documents provided)'

  const qSample = ctx.questions.slice(0, MAX_QUESTIONS)
  const questionsText = qSample.length
    ? qSample
        .map((q, i) => {
          const stem = (q.stem || '').slice(0, 600).replace(/\s+/g, ' ').trim()
          const meta = [
            q.topic ? `topic="${q.topic}"` : null,
            q.difficulty ? `difficulty=${q.difficulty}` : null,
            q.questionType ? `type=${q.questionType}` : null,
          ].filter(Boolean).join(' ')
          return `Q${i + 1} [id=${q.id} src=${q.source}${meta ? ' ' + meta : ''}]: ${stem}`
        })
        .join('\n')
    : '(no questions provided)'

  const topicsText = ctx.topicNames.length
    ? ctx.topicNames.join(', ')
    : '(none registered — infer from documents)'

  return `KNOWN TOPICS: ${topicsText}

SOURCE DOCUMENTS:
${docsText}

REPRESENTATIVE QUESTIONS / PAST QUESTIONS / QUESTION BANK ITEMS:
${questionsText}`
}

function buildHeader(ctx: StudyPrepContext, role: string): string {
  const langLine = ctx.language === 'vi'
    ? 'LANGUAGE: Write the entire output in formal, professional Vietnamese. Use Vietnamese tax/exam terminology where appropriate.'
    : 'LANGUAGE: Write the entire output in clear, professional English.'
  const target = [
    ctx.targetExam ? `Target exam: ${ctx.targetExam}` : null,
    ctx.examDate ? `Exam date: ${ctx.examDate}` : null,
    ctx.daysUntilExam != null ? `Days until exam: ${ctx.daysUntilExam}` : null,
    ctx.targetScore ? `Target score / level: ${ctx.targetScore}` : null,
    ctx.weeklyHours ? `Available study time: ~${ctx.weeklyHours} hours / week` : null,
  ].filter(Boolean).join('\n')
  return `${role}

PREP SET: ${ctx.prepSetName}
${target || '(no specific exam target provided — produce a generic but actionable plan)'}

${langLine}

CONSTRAINTS:
- Ground every recommendation in the provided sources. If something is missing or unclear, state it explicitly rather than inventing facts.
- When you reference a source, cite it inline using the bracketed id format: [doc:<id>] for documents, [q:<id>] for questions.
- Be practical and exam-oriented, like a senior tutor — avoid generic filler.${ctx.notes ? `\n\nADMIN/TEACHER NOTES:\n${ctx.notes}` : ''}
`
}

// ── 1. STUDY PLAN ─────────────────────────────────────────────────────────────
export function buildStudyPlanPrompt(ctx: StudyPrepContext): string {
  const header = buildHeader(
    ctx,
    'You are an experienced exam coach helping a student prepare for a professional exam.'
  )
  const sources = buildSourcesBlock(ctx)

  return `${header}

${sources}

YOUR TASK
Produce a STUDY PLAN that is genuinely usable as a roadmap, like a personal mentor.
The plan must include:
1. A short situational assessment (what to focus on, where the risk is).
2. A topic-priority list (high / medium / low) with one-line reasoning each.
3. A week-by-week schedule (or sprint-by-sprint if examDate is unknown), with concrete tasks per period.
4. Revision milestones and self-check questions.
5. A mock-exam checkpoint schedule (when to do baseline / mid / final mock).
6. Final 7-day and 24-hour readiness checklist.
7. Recovery tactics for weak topics.

OUTPUT FORMAT — return ONE JSON object inside a \`\`\`json fenced block, with these fields:
{
  "title": "short title for the plan",
  "summary": "1–2 paragraph overview",
  "markdown": "the full plan rendered as Markdown — use headings, bullet lists, tables. This is the human-readable version teachers/students will edit.",
  "structured": {
    "topicPriorities": [{"topic": "...", "priority": "HIGH|MEDIUM|LOW", "reason": "..."}],
    "schedule": [{"label": "Week 1 / Sprint 1", "focus": "...", "tasks": ["...", "..."], "hours": 0}],
    "milestones": [{"when": "...", "goal": "..."}],
    "mockCheckpoints": [{"when": "...", "type": "baseline|mid|final", "scope": "..."}],
    "readinessChecklist": ["...", "..."]
  },
  "mindmap": "Mermaid mindmap source starting with 'mindmap\\n  root((Study Plan))' summarising the plan visually",
  "citedSources": [{"type": "doc"|"question", "id": "<id from input>", "label": "<short label>"}]
}

Inside the markdown body, keep inline citations like [doc:abc123] or [q:xyz789] so a teacher can trace each claim back to the source.`
}

// ── 2. STUDY MATERIALS — "SECRET SAUCE" NOTES ─────────────────────────────────
export function buildStudyMaterialsPrompt(ctx: StudyPrepContext): string {
  const header = buildHeader(
    ctx,
    'You are a top-rated exam tutor writing a high-yield "secret sauce" revision pack for a student preparing for this exam.'
  )
  const sources = buildSourcesBlock(ctx)

  return `${header}

${sources}

YOUR TASK
Compress the source materials into CONDENSED, HIGH-YIELD EXAM NOTES — the kind that a smart student would print and revise from in the final 30 days. NOT a generic summary.

The notes must:
- Cover every major topic that appears in the syllabus / known topics list.
- Highlight the most exam-relevant rules, formulas, definitions, decision rules, deadlines, thresholds, and exceptions.
- Identify "examiner traps" and common mistakes — based on patterns in the past questions and question bank.
- Cross-reference each section back to the source documents and to specific past questions where possible.
- Be concise: prefer bullet points, tables, short numbered steps over long paragraphs.

OUTPUT FORMAT — return ONE JSON object inside a \`\`\`json fenced block:
{
  "title": "...",
  "summary": "1 short paragraph describing the scope of these notes",
  "markdown": "the full Secret Sauce notes as Markdown — top-level title, then one '## Section' per major topic, each with: Key Rules / Formulas / Common Traps / Likely Exam Themes / Linked Past Questions",
  "structured": {
    "sections": [{
      "title": "Topic name",
      "keyPoints": ["..."],
      "formulas": ["..."],
      "traps": ["..."],
      "likelyExamThemes": ["..."],
      "linkedQuestions": ["<question id>", "..."],
      "linkedDocs": ["<doc id>", "..."]
    }]
  },
  "mindmap": "Mermaid mindmap source summarising the notes hierarchy",
  "citedSources": [{"type": "doc"|"question", "id": "...", "label": "..."}]
}

Inline citations [doc:<id>] / [q:<id>] are required throughout the markdown.`
}

// ── 3. MOCK EXAM PLAN ─────────────────────────────────────────────────────────
export function buildMockExamPlanPrompt(ctx: StudyPrepContext): string {
  const header = buildHeader(
    ctx,
    'You are an exam-paper architect designing a mock-exam strategy for this student.'
  )
  const sources = buildSourcesBlock(ctx)

  return `${header}

${sources}

YOUR TASK
Design a MOCK EXAM PLAN that the teacher can execute using the existing question bank.

The plan must include:
1. How many mock exams to run (typically 2–4: baseline / mid / final).
2. For each mock exam: when to run it, total duration, target difficulty mix, topic coverage, and which existing question-bank items fit best (cite by [q:<id>]).
3. A section-by-section blueprint per mock (section name, # questions, marks, difficulty mix, topic mix).
4. A coverage matrix showing each topic × each mock exam (so nothing is left untested).
5. Notes on how to assemble VARIANTS from the same blueprint.

OUTPUT FORMAT — return ONE JSON object inside a \`\`\`json fenced block:
{
  "title": "...",
  "summary": "...",
  "markdown": "full plan as Markdown with headings, tables, and inline [q:<id>] / [doc:<id>] citations",
  "structured": {
    "mockExams": [{
      "name": "Baseline Mock 1",
      "when": "Week 2",
      "durationMinutes": 90,
      "difficultyMix": {"easy": 30, "medium": 50, "hard": 20},
      "sections": [{
        "name": "Section A — MCQ",
        "questionCount": 20,
        "marksPerQuestion": 1,
        "topicMix": [{"topic": "...", "count": 10}],
        "suggestedQuestionIds": ["<q-id>", "..."]
      }]
    }],
    "coverageMatrix": [{"topic": "...", "mockExams": ["Baseline Mock 1", "Final Mock"]}]
  },
  "citedSources": [{"type": "doc"|"question", "id": "...", "label": "..."}]
}`
}

// ── Loose JSON extractor (tolerant) ─────────────────────────────────────────
export function extractStudyPrepJSON(text: string): {
  title?: string
  summary?: string
  markdown?: string
  structured?: unknown
  mindmap?: string
  citedSources?: { type: string; id: string; label?: string }[]
} {
  if (!text) return {}

  // 1. Try fenced ```json block
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidates: string[] = []
  if (fence) candidates.push(fence[1].trim())

  // 2. Try the largest {...} block
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(text.slice(firstBrace, lastBrace + 1))
  }

  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c)
      if (parsed && typeof parsed === 'object') return parsed
    } catch {
      // try next
    }
  }

  // Fallback — wrap the whole text as markdown so the teacher still gets something usable
  return { markdown: text.trim() }
}
