export type GenerationConfig = {
  source: 'upload' | 'paste' | 'manual'
  documentContent?: string
  totalQuestions: number
  easyCount: number
  mediumCount: number
  hardCount: number
  easyPoints: number
  mediumPoints: number
  hardPoints: number
  questionTypes: string[]
  aiInstructions?: string
  title: string
}

export type ExamGenerationConfig = {
  sectionName: string
  questionType: string          // fallback default type for the section
  marksPerQuestion: number
  count: number                 // total questions to generate

  // ── Per-generation override fields (from generate page config) ──
  selectedTopics?: string[]     // topic names the user selected (required ≥1, or AI picks randomly)
  selectedQuestionTypes?: string[] // question type codes user selected (or AI picks randomly)
  syllabusCode?: string         // optional syllabus code filter e.g. "A1, B2"
  issues?: string[]             // specific issues/subtopics e.g. ["late filing penalty", "CIT rate"]
  difficultyLevel?: string      // "STANDARD" | "EASY" | "HARD" | "MIXED"
  sampleQuestionsFiltered?: string // filtered sample questions matching selected topics (full text)
  referenceQuestionId?: string  // single sample question ID to mimic style

  // ── Section-level settings (from ExamSection model) ──
  topics?: string               // legacy/fallback topic string
  sectionInstructions?: string
  aiInstructions?: string
  extraInstructions?: string
  customInstructions?: string   // per-generation additional instructions
  documentContent?: string

  language?: string            // 'ENG' | 'VIE'
  calculationMarks?: number    // marks for calculation portion

  // ── Document context ──
  overallTopic?: string          // Session overall topic name
  syllabus?: string              // Syllabus document content
  regulations?: string           // Regulations/Tax law content
  studyMaterial?: string         // Study material content
  sampleQuestions?: string       // Sample questions & answers for style reference
  ratesTariff?: string           // Rates & tariff tables
  otherContext?: string          // Other supporting documents

  // ── Legacy breakdown (kept for backward compat) ──
  questionTypes?: string         // JSON: [{type, count, marksEach}]
  topicBreakdown?: string        // JSON: [{topicId?, topicName, count}]
}

export type GradingConfig = {
  stem: string
  markingScheme: string
  modelAnswer: string
  studentAnswer: string
  marks: number
}

export function buildQuizGenerationPrompt(config: GenerationConfig): string {
  const typesList = config.questionTypes.length > 0 ? config.questionTypes.join(', ') : 'MCQ'

  return `You are an expert exam question creator. Generate exactly ${config.totalQuestions} quiz questions based on the provided content.

CONTENT:
${config.documentContent || 'No specific document provided — generate general knowledge questions about the topic: ' + config.title}

QUESTION SPECIFICATIONS:
- Easy questions: ${config.easyCount} (worth ${config.easyPoints} point each)
- Medium questions: ${config.mediumCount} (worth ${config.mediumPoints} points each)
- Hard questions: ${config.hardCount} (worth ${config.hardPoints} points each)
- Question types to include: ${typesList}
  (Distribute the requested types roughly evenly unless only one type is specified)

${config.aiInstructions ? `ADDITIONAL INSTRUCTIONS:\n${config.aiInstructions}` : ''}

OUTPUT FORMAT:
Return a JSON array where each question object has:
{
  "stem": "The question text",
  "questionType": "MCQ" | "MULTIPLE_RESPONSE" | "TRUE_FALSE" | "SHORT_ANSWER" | "FILL_BLANK" | "ESSAY" | "LONG_ANSWER" | "MATCHING",
  "options": ["option1", "option2", "option3", "option4"],
  "correctAnswer": "The correct option text or answer (for MULTIPLE_RESPONSE: answers separated by ||)",
  "explanation": "Why this is correct",
  "difficulty": "EASY" | "MEDIUM" | "HARD",
  "points": number,
  "topic": "the main topic/subject this question belongs to (e.g. 'Algebra', 'Vietnam War', 'Cell Biology')",
  "tags": "comma-separated relevant tags (e.g. 'math,equations,quadratic' or 'history,vietnam,1975')"
}

RULES FOR EACH TYPE:
1. MCQ: provide exactly 4 options (plain text, NO letter prefixes like 'A.' — just the option text).
   correctAnswer = exact text of the correct option.
2. MULTIPLE_RESPONSE: provide 4-5 options (plain text, no letter prefixes).
   correctAnswer = all correct options separated by "||" (e.g. "Paris||London").
3. TRUE_FALSE: options = ["True", "False"]. correctAnswer = "True" or "False".
4. SHORT_ANSWER: no options. correctAnswer = brief model answer.
5. FILL_BLANK: stem contains blank as "___". no options. correctAnswer MUST contain multiple acceptable answer variants separated by "||".
   For Vietnamese fill-in-blank questions, include: (1) the answer with full diacritics, (2) the answer without diacritics, (3) any common alternate spellings.
   Example: "Hỏa hoạn||hoa hoan||hoả hoạn||hoa hoạn". Always provide at least 2-3 variants.
   Example JSON: {"questionType": "FILL_BLANK", "stem": "Điền vào chỗ trống: ___ là thủ đô của Pháp.", "correctAnswer": "Paris||paris||Pari", "options": [], "explanation": "Paris là thủ đô và thành phố lớn nhất của Pháp."}
6. ESSAY / LONG_ANSWER: no options, no correctAnswer. Just stem.
7. MATCHING: options is an object: { "left": ["item1", "item2", ...], "right": ["match1", "match2", ...] }.
   correctAnswer = JSON array of pairs: [["left1","right1"],["left2","right2"]] as a string.

IMPORTANT: For MCQ and MULTIPLE_RESPONSE, do NOT prefix options with letters (A., B., etc.).
The UI adds letters automatically. Just write the plain option text.

Quality rules:
- Questions must be based on the provided content — no hallucination.
- Distribute difficulties as specified.
- Make distractors plausible.
- Return ONLY the JSON array, no other text or markdown fences.`
}

export function buildExamQuestionPrompt(config: ExamGenerationConfig): string {
  // ── Question type resolution ──────────────────────────────────────────────
  const typeInstructions: Record<string, string> = {
    MCQ_SINGLE:   'Multiple Choice – ONE correct answer. Provide exactly 4 options (plain text, no letter prefixes). correctAnswer = exact text of the correct option.',
    MCQ_MULTIPLE: 'Multiple Choice – MULTIPLE correct answers. Provide 4-5 options (plain text, no letter prefixes). correctAnswer = all correct options joined by "||".',
    FILL_BLANK:   'Fill in the blank. Stem contains "___". correctAnswer = acceptable answers separated by "||".',
    SHORT_ANSWER: 'Short Answer. Concise question, 2-5 sentence model answer. No options.',
    ESSAY:        'Long-form Essay. Complex scenario with sub-parts (a)(b)(c). Full model answer with workings.',
    SCENARIO:     'Scenario-Based. Realistic scenario with numerical data. Full calculations/analysis required.',
    CASE_STUDY:   'Case Study. Detailed case with multiple sub-parts. Marking scheme per part.',
    OTHER:        'Question type as appropriate for the context.',
  }

  // Resolve which question types to use
  // Priority: selectedQuestionTypes (user pick) > legacy qtRows > section default
  let selectedTypes: string[] = []
  if (config.selectedQuestionTypes && config.selectedQuestionTypes.length > 0) {
    selectedTypes = config.selectedQuestionTypes
  } else {
    // try legacy qtRows
    try {
      if (config.questionTypes) {
        const qtRows: {type: string; count: number; marksEach: number}[] = JSON.parse(config.questionTypes)
        selectedTypes = qtRows.map(r => r.type)
      }
    } catch {}
  }
  if (selectedTypes.length === 0) selectedTypes = [config.questionType]

  // Resolve which topics to focus on
  // Priority: selectedTopics > legacy topicBreakdown > config.topics
  let topicList: string[] = []
  if (config.selectedTopics && config.selectedTopics.length > 0) {
    topicList = config.selectedTopics
  } else {
    try {
      if (config.topicBreakdown) {
        const rows: {topicName: string; count: number}[] = JSON.parse(config.topicBreakdown)
        topicList = rows.map(r => r.topicName)
      }
    } catch {}
    if (topicList.length === 0 && config.topics) topicList = [config.topics]
  }

  // Difficulty
  const diffLevel = config.difficultyLevel || 'STANDARD'
  let difficultyInstruction = ''
  if (diffLevel === 'STANDARD') {
    difficultyInstruction = 'Use the same difficulty level as the provided sample questions (standard exam difficulty). Mix of MEDIUM and HARD questions typical of a professional exam.'
  } else if (diffLevel === 'EASY') {
    difficultyInstruction = 'All questions should be EASY — straightforward recall or simple application.'
  } else if (diffLevel === 'HARD') {
    difficultyInstruction = 'All questions should be HARD — complex multi-step reasoning, calculation, or analysis required.'
  } else if (diffLevel === 'MIXED') {
    difficultyInstruction = 'Mix difficulties: approximately 20% EASY, 50% MEDIUM, 30% HARD.'
  }

  // ── Document context ──────────────────────────────────────────────────────
  const contextParts: string[] = []

  if (config.syllabus) {
    let syllabusNote = 'IMPORTANT: Only generate questions on topics LISTED in the syllabus. Do NOT generate questions on [EXCLUDE] topics.'
    if (config.syllabusCode) {
      syllabusNote += `\nFOCUS ONLY on syllabus code(s): ${config.syllabusCode}. Ignore other sections.`
    }
    contextParts.push(`=== SYLLABUS ===\n${syllabusNote}\n${config.syllabus.slice(0, 15000)}`)
  }

  if (config.regulations) {
    contextParts.push(`=== REGULATIONS / TAX LAW ===\nBase questions on these regulations. Use specific article numbers, percentages, thresholds, and rules.\nDO NOT hallucinate figures — only use numbers explicitly stated below.\n${config.regulations.slice(0, 20000)}`)
  }

  if (config.studyMaterial && config.studyMaterial !== config.regulations) {
    contextParts.push(`=== STUDY MATERIAL ===\n${config.studyMaterial.slice(0, 10000)}`)
  }

  if (config.ratesTariff) {
    contextParts.push(`=== RATES & TARIFF TABLES ===\nFor calculation questions, use ONLY the rates and thresholds in this table.\n${config.ratesTariff.slice(0, 8000)}`)
  }

  // Sample questions: prefer filtered (by selected topic) over full pool
  const sampleContent = config.sampleQuestionsFiltered || config.sampleQuestions
  if (sampleContent) {
    contextParts.push(`=== SAMPLE QUESTIONS & ANSWERS (STYLE REFERENCE) ===\nUse these as style reference — same format, depth, language, and difficulty.\nDO NOT copy questions verbatim. Generate NEW questions in the same style.\n${sampleContent.slice(0, 12000)}`)
  }

  if (config.otherContext) {
    contextParts.push(`=== ADDITIONAL CONTEXT ===\n${config.otherContext.slice(0, 8000)}`)
  }

  if (config.documentContent && contextParts.length === 0) {
    contextParts.push(`=== DOCUMENT CONTENT ===\n${config.documentContent.slice(0, 30000)}`)
  }

  const hasDocuments = contextParts.length > 0

  // ── Build specification section ───────────────────────────────────────────
  // Question type spec
  let qtypeSpec: string
  if (selectedTypes.length === 1) {
    qtypeSpec = `QUESTION TYPE: ${typeInstructions[selectedTypes[0]] || selectedTypes[0]}`
  } else {
    qtypeSpec = `QUESTION TYPES (distribute randomly across the ${config.count} questions):\n${selectedTypes.map(t => `  - ${typeInstructions[t] || t}`).join('\n')}`
  }

  // Topic spec
  let topicSpec = ''
  if (topicList.length === 1) {
    topicSpec = `\nTOPIC: ${topicList[0]}`
  } else if (topicList.length > 1) {
    const perTopic = Math.ceil(config.count / topicList.length)
    topicSpec = `\nTOPICS (distribute ~${perTopic} question(s) each, randomly if count doesn't divide evenly):\n${topicList.map(t => `  - ${t}`).join('\n')}`
  }

  // Issues spec
  let issuesSpec = ''
  if (config.issues && config.issues.length > 0) {
    issuesSpec = `\nSPECIFIC ISSUES TO TEST (focus questions on these):\n${config.issues.map(i => `  - ${i}`).join('\n')}`
  }

  // Syllabus code spec (if no syllabus doc, still use as hint)
  let syllabusCodeSpec = ''
  if (config.syllabusCode && !config.syllabus) {
    syllabusCodeSpec = `\nSYLLABUS CODE(S): ${config.syllabusCode} — generate questions that test these code areas specifically.`
  }

  // ── Language instruction ──
  const languageInstruction = (config.language === 'VIE')
    ? 'LANGUAGE: Write ALL question stems, options, and answers in Vietnamese. Use formal Vietnamese appropriate for professional exams.\n\n'
    : ''

  // ── Calculation marks instruction ──
  const calcMarks = config.calculationMarks || 0
  const calcMarksInstruction = (calcMarks > 0 && config.marksPerQuestion > 0)
    ? `MARK ALLOCATION: Each question is worth ${config.marksPerQuestion} marks total:\n- ${calcMarks} marks for calculation/computation steps\n- ${config.marksPerQuestion - calcMarks} marks for theory/identification/written explanation\nDesign question parts accordingly.\n\n`
    : ''

  return `${languageInstruction}${calcMarksInstruction}You are an expert professional exam question writer${config.overallTopic ? ` specialising in ${config.overallTopic}` : ''}.

## GENERATION PARAMETERS
SECTION: ${config.sectionName}
TOTAL QUESTIONS TO GENERATE: ${config.count}
MARKS PER QUESTION: ${config.marksPerQuestion}
${qtypeSpec}${topicSpec}${issuesSpec}${syllabusCodeSpec}

DIFFICULTY: ${difficultyInstruction}

## DOCUMENT CONTEXT
${contextParts.length > 0
  ? contextParts.join('\n\n')
  : (config.overallTopic
      ? `No specific documents provided. Generate questions based on your expert knowledge of: ${config.overallTopic}`
      : 'No documents provided.')}

## INSTRUCTIONS FROM EXAM DESIGNER
${config.sectionInstructions ? `Section instructions: ${config.sectionInstructions}\n` : ''}\
${config.aiInstructions ? `AI instructions: ${config.aiInstructions}\n` : ''}\
${config.customInstructions ? `Additional instructions: ${config.customInstructions}\n` : ''}\
${config.extraInstructions ? `Global instructions: ${config.extraInstructions}\n` : ''}

## GENERATION RULES
1. ${hasDocuments ? 'Base ALL questions strictly on the provided documents. DO NOT hallucinate facts, figures, law articles, or tax rates.' : 'Generate questions based on expert knowledge.'}
2. SYLLABUS CONSTRAINT: If a syllabus is provided, ONLY test topics listed there. Never generate questions on [EXCLUDE] topics.
3. RATES CONSTRAINT: For calculation questions, use ONLY the rates/thresholds from the Rates & Tariff section.
4. STYLE MATCHING: If sample questions are provided, match their format, language, depth, and structure exactly.
5. TOPIC DISTRIBUTION: If multiple topics are specified and count doesn't divide evenly, distribute randomly — AI chooses which topics to cover.
6. TYPE DISTRIBUTION: If multiple question types are specified and count doesn't divide evenly, AI assigns types randomly — but each type must appear at least once if count allows.
7. Each question MUST include:
   - Full stem with all data needed to answer (no external lookup required)
   - Detailed marking scheme (one point per line, each line shows mark allocation)
   - Complete model answer with calculations in table format if \u22653 rows
   - Per-option explanations (for MCQ): correct option shows inline calculation; wrong options get ONE short sentence
   - Reference at end: "Ref: Article X, Decree Y"
   - Syllabus codes tested at end

EXPLANATION STYLE (CRITICAL \u2014 follow examsgen format):
- Correct option: show calculations inline like "Annual salary = 50mil \u00d7 9 months = 450mil (0.5mk)"
- When \u22653 calculation rows: use markdown table format:
  | Item | Calculation | Amount | Marks |
  |------|-------------|--------|-------|
  | Salary | 50 \u00d7 9 | 450 mil | 0.5mk |
- Wrong options: ONE short sentence only, e.g. "Wrong rate: 20% used instead of 22%"
- NEVER write verbose Step 1/Step 2 paragraphs
- Reference at end: "Ref: Article X, Decree Y"
- Syllabus codes: "Tested: C2d, C2n" at end

## OUTPUT FORMAT
Return a JSON array only — no markdown fences, no preamble, no explanation.
[
  {
    "stem": "Full question text. For scenarios: embed all numerical data in the stem.",
    "options": ["Option A", "Option B", "Option C", "Option D"] or null for non-MCQ,
    "correctAnswer": "Exact correct answer (MCQ: exact option text; MULTIPLE: options joined by '||')",
    "optionExplanations": {
      "A": "Wrong rate applied: used 20% instead of 22%",
      "B": "Correct \u2014 salary = 50 \u00d7 9 = 450 mil (0.5mk); less insurance = 4.5 mil (0.5mk); net = 445.5 mil (1mk)",
      "C": "Forgot to deduct compulsory insurance",
      "D": "Applied annual threshold incorrectly"
    },
    "markingScheme": "concise marking scheme, one point per line, each line shows mark allocation",
    "modelAnswer": "Full answer with calculations in table format if \u22653 rows",
    "reference": "Article 9, Decree 320/2025/ND-CP; Circular 78/2014 s.3",
    "syllabusCode": "C2d, C2n",
    "topic": "Specific topic/subtopic this question tests",
    "difficulty": "EASY" | "MEDIUM" | "HARD",
    "marks": ${config.marksPerQuestion}
  }
]

Return ONLY the JSON array. No other text.`
}

export function buildGradingPrompt(config: GradingConfig): string {
  return `You are an expert examiner grading a student's written answer.

QUESTION (${config.marks} marks):
${config.stem}

MODEL ANSWER:
${config.modelAnswer}

MARKING SCHEME:
${config.markingScheme}

STUDENT'S ANSWER:
${config.studentAnswer}

INSTRUCTIONS:
1. Grade the student's answer against the marking scheme
2. Award marks fairly — partial credit where appropriate
3. Provide constructive feedback
4. Be consistent and objective

Respond in JSON format:
{
  "marksAwarded": <number between 0 and ${config.marks}>,
  "feedback": "<2-3 sentences of constructive feedback explaining what was done well and what was missed>",
  "keyPointsHit": ["point 1", "point 2"],
  "keyPointsMissed": ["point 1", "point 2"]
}

Return ONLY the JSON object, no other text.`
}
