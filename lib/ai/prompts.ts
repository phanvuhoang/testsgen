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
  language?: string   // 'ENG' | 'VIE'
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
  sourceDocuments?: {            // List of uploaded document names for citation
    regulations: string[]
    syllabus: string[]
    samples: string[]
    rates: string[]
  }
  minMarkPerPoint?: number       // Minimum marks per marking point (default 0.5)
  assumedDate?: string           // e.g. "31 December 2025"
  vndUnit?: string               // 'vnd' | 'thousand' | 'million'
  excludingIssues?: string[]     // issues explicitly excluded from this question set

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
  const languageInstruction = config.language === 'VIE'
    ? 'LANGUAGE: Write ALL question stems, options, and answers in Vietnamese. Use formal Vietnamese appropriate for professional exams.\n\n'
    : ''

  return `You are an expert exam question creator. Generate exactly ${config.totalQuestions} quiz questions based on the provided content.

${languageInstruction}CONTENT:
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
    contextParts.push(`=== SYLLABUS ===\n${syllabusNote}\n${config.syllabus}`)
  }

  if (config.regulations) {
    contextParts.push(`=== REGULATIONS / TAX LAW ===\nBase questions on these regulations. Use specific article numbers, percentages, thresholds, and rules.\nDO NOT hallucinate figures — only use numbers explicitly stated below.\n${config.regulations}`)
  }

  if (config.studyMaterial && config.studyMaterial !== config.regulations) {
    contextParts.push(`=== STUDY MATERIAL ===\n${config.studyMaterial}`)
  }

  if (config.ratesTariff) {
    contextParts.push(`=== RATES & TARIFF TABLES ===\nFor calculation questions, use ONLY the rates and thresholds in this table.\n${config.ratesTariff}`)
  }

  // Sample questions: prefer filtered (by selected topic) over full pool
  const sampleContent = config.sampleQuestionsFiltered || config.sampleQuestions
  if (sampleContent) {
    contextParts.push(`=== SAMPLE QUESTIONS & ANSWERS (STYLE REFERENCE) ===\nUse these as style reference — same format, depth, language, and difficulty.\nDO NOT copy questions verbatim. Generate NEW questions in the same style.\n${sampleContent}`)
  }

  if (config.otherContext) {
    contextParts.push(`=== ADDITIONAL CONTEXT ===\n${config.otherContext}`)
  }

  if (config.documentContent && contextParts.length === 0) {
    contextParts.push(`=== DOCUMENT CONTENT ===\n${config.documentContent.slice(0, 30000)}`)
  }

  const hasDocuments = contextParts.length > 0

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

  // Excluding issues spec
  let excludingIssuesSpec = ''
  if (config.excludingIssues && config.excludingIssues.length > 0) {
    excludingIssuesSpec = `\n\n## CRITICAL: EXCLUDED TOPICS — DO NOT TEST THESE\nThe following issues MUST NOT appear in any question, option, or explanation:\n${config.excludingIssues.map(i => `  ❌ ${i}`).join('\n')}\nEven if these issues appear in the uploaded regulations or syllabus, EXCLUDE them completely.`
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

  // ── Assumed date instruction ──
  const dateInstruction = config.assumedDate
    ? `ASSUMED DATE: All questions in this set assume today's date is ${config.assumedDate}. Use this for deadline calculations, tax periods, and filing dates.\n\n`
    : ''

  // ── VND currency unit instruction ──
  const vndUnitLabel = config.vndUnit === 'thousand' ? 'VND 000 (thousands)'
    : config.vndUnit === 'vnd' ? 'VND (absolute amounts)'
    : 'VND million'
  const vndUnitInstruction = `CURRENCY UNIT: Express all VND monetary amounts in ${vndUnitLabel}.
${config.vndUnit === 'million' || !config.vndUnit
  ? 'Example: write "500" to mean 500 million VND. For decimals: "round to the nearest million VND" or "to one decimal place (e.g. 1.5 million VND)".'
  : config.vndUnit === 'thousand'
  ? 'Example: write "500,000" to mean 500 million VND. Round to nearest thousand VND.'
  : 'Write full VND amounts (e.g. 500,000,000 VND).'
}\n\n`

  // ── Min mark / max points instruction ──
  const minMark = config.minMarkPerPoint ?? 0.5
  const maxPoints = config.marksPerQuestion > 0 ? Math.floor(config.marksPerQuestion / minMark) : 0
  const markAllocationRule = config.marksPerQuestion > 0
    ? `MARK ALLOCATION RULES:
- Minimum ${minMark} mark(s) per marking point
- A ${config.marksPerQuestion}-mark question can have at most ${maxPoints} marking points
- Each marking point must be worth at least ${minMark} mark(s)
- Distribute marks in multiples of ${minMark}\n\n`
    : ''

  // ── Calculation marks instruction ──
  const calcMarks = config.calculationMarks || 0
  const calcMarksInstruction = (calcMarks > 0 && config.marksPerQuestion > 0)
    ? `MARK ALLOCATION: Each question is worth ${config.marksPerQuestion} marks total:\n- ${calcMarks} marks for calculation/computation steps\n- ${config.marksPerQuestion - calcMarks} marks for theory/identification/written explanation\nDesign question parts accordingly.\n\n`
    : ''

  // ── System / persona prompt ──────────────────────────────────────────────
  const personaLine = config.overallTopic
    ? `You are a Senior ${config.overallTopic} Examiner with 30+ years of experience setting professional-level exam questions.`
    : `You are a Senior Professional Examiner with 30+ years of experience setting professional-level exam questions.`

  // ── Anti-hallucination block ──────────────────────────────────────────────
  const vndEnforcementRule = (config.vndUnit && config.vndUnit !== 'vnd')
    ? `\n## CRITICAL: CURRENCY FORMAT\nALL monetary amounts in VND MUST be expressed in ${vndUnitLabel}.\nNEVER write raw VND figures like "1,000,000,000 VND" or "VND 500,000,000".\n${
        config.vndUnit === 'million'
          ? 'CORRECT: "500 million VND" or "VND 500m" or just "500" (context clear). WRONG: "500,000,000 VND".'
          : 'CORRECT: "500,000 (thousand VND)". WRONG: "500,000,000 VND".'
      }\n`
    : ''

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
   from general knowledge — but state clearly in the reference field that no document was provided.` : '';

  return `${personaLine}

${antiHallucinationRules}
${vndEnforcementRule}
${sourceDocumentsBlock}

${languageInstruction}${dateInstruction}${vndUnitInstruction}${markAllocationRule}${calcMarksInstruction}
## GENERATION PARAMETERS
SECTION: ${config.sectionName}
TOTAL QUESTIONS TO GENERATE: ${config.count}
MARKS PER QUESTION: ${config.marksPerQuestion}
${qtypeSpec}${topicSpec}${issuesSpec}${excludingIssuesSpec}${syllabusCodeSpec}

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
1. ${hasDocuments ? 'Base ALL questions strictly on the provided documents. DO NOT hallucinate facts, figures, law articles, or tax rates not found in the documents.' : 'Generate questions based on expert knowledge.'}
2. SYLLABUS CONSTRAINT: If a syllabus is provided, ONLY test topics listed there. Never generate questions on [EXCLUDE] topics.
3. RATES CONSTRAINT: For calculation questions, use ONLY the rates/thresholds explicitly stated in the provided Rates & Tariff section or Regulations section.
4. STYLE MATCHING: If sample questions are provided, match their format, language, depth, option phrasing, and structure exactly. This is the highest priority for style.
5. TOPIC DISTRIBUTION: If multiple topics are specified and count doesn't divide evenly, distribute randomly — AI chooses which topics to cover.
6. TYPE DISTRIBUTION: If multiple question types are specified and count doesn't divide evenly, AI assigns types randomly — but each type must appear at least once if count allows.
7. Each question MUST include:
   - Full stem with all data needed to answer (no external lookup required)
   - optionExplanations (MCQ only): correct option shows brief calc + regulation ref; wrong options ONE sentence each
   - modelAnswer: REQUIRED for ALL question types (including MCQ).
     MCQ: show worked solution for correct answer (e.g. "Tax = 500m \u00d7 20% = 100m per Art.10, Decree 320/2025"). Keep concise \u2014 3-6 lines.
     SCENARIO/ESSAY: full multi-part solution with calc tables where needed.
     SHORT_ANSWER: concise 1-3 sentence answer.
     Format: plain text or HTML \u2014 use <table> only if \u22653 calculation rows. NEVER null.
   - syllabusCode: exact codes from the syllabus document
   - reference: specific article + document name
   - DO NOT include a markingScheme field \u2014 it is not required
8. SCENARIO/CASE STUDY FORMATTING: When the question has a scenario/case description followed
   by a question prompt, format the stem as:
   "Case: [scenario text here]\\n\\nQuestion: [actual question prompt here]"
   Use "Case:" label for the scenario and "Question:" label for the question prompt.
   This applies to: SCENARIO, CASE_STUDY, ESSAY question types.
   For MCQ with a short lead-in: use "Case: [brief context]\\n\\nQuestion: [question]"
   For pure MCQ without scenario context: no labels needed, just the question text.
9. correctAnswer field rules by question type:
   - MCQ_SINGLE: exact text of correct option
   - MCQ_MULTIPLE: correct options joined by "||"
   - FILL_BLANK: acceptable answers joined by "||"
   - TRUE_FALSE: "True" or "False"
   - SCENARIO / ESSAY / CASE_STUDY / SHORT_ANSWER: set correctAnswer = null
     These types use modelAnswer for the full worked solution.

ANSWER FORMAT RULES:
- markingScheme: do NOT include
- modelAnswer: REQUIRED for ALL question types including MCQ.

  FOR MCQ \u2014 format modelAnswer as an HTML table:
  <table>
    <tr><th style="width:60px">Step</th><th>Working / Description</th><th style="width:100px">Amount (VND m)</th><th style="width:50px">Mark</th></tr>
    <tr><td>1</td><td>Description of step</td><td>XXX</td><td>0.5</td></tr>
    <tr><td><b>Answer</b></td><td>Brief conclusion</td><td><b>XXX</b></td><td><b>X</b></td></tr>
  </table>
  If pure theory (no calculation): write 2-4 sentences with regulation reference.

  FOR SCENARIO/ESSAY/CASE_STUDY \u2014 format as HTML with:
  - Each part (a)(b)(c) as <p><b>(a) Part title</b></p>
  - Calculation steps as <table> with columns: Step | Working / Description | Amount (VND m) | Mark
  - Brief conclusion per part

  FOR SHORT_ANSWER \u2014 1-3 sentences, plain text or short HTML.

- optionExplanations (MCQ only):
  - Correct option: "\u2713 CORRECT \u2014 [one-line explanation or key calc, e.g. '500m \u00d7 20% = 100m (Art.10, Decree 320)']"
  - Wrong options: EACH includes brief working if calculation: "\u2717 [Why wrong]. [Working if applicable]"
  - Format: plain text per option (NOT HTML in optionExplanations)
  - NEVER say "See uploaded regulations" \u2014 always explain specifically

## OUTPUT FORMAT
Return a JSON array only — no markdown fences, no preamble, no explanation.
[
  {
    "stem": "Full question text. For scenarios: embed all numerical data in the stem.",
    "options": ["Option A", "Option B", "Option C", "Option D"] or null for non-MCQ,
    "correctAnswer": "MCQ: exact option text; MULTIPLE: options joined by '||'; SCENARIO/ESSAY/CASE_STUDY/SHORT_ANSWER: null",
    "optionExplanations": {
      "A": "Wrong rate applied: used 20% instead of 22%",
      "B": "CORRECT \u2014 500m \u00d7 20% = 100m (Art. 10, Decree 320/2025)",
      "C": "Forgot to deduct compulsory insurance",
      "D": "Applied annual threshold incorrectly"
    },
    "modelAnswer": "Worked solution: [Tax base] = Revenue - Deductible expenses = 10,000m - 7,500m = 2,500m. Tax = 2,500m × 20% = 500m (per Art.10(1), Decree 320/2025/ND-CP)",
    "reference": "Article X(Y), Decree 320/2025/ND-CP — cite specific article and document name. NEVER write 'See uploaded regulations'.",
    "syllabusCode": "C2d, C2n — exact codes from the provided syllabus document",
    "sampleRef": "Sample_MCQ_CIT_2024.pdf — name of sample file whose style was followed",
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
