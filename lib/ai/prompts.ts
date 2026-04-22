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
  questionType: string
  marksPerQuestion: number
  count: number
  topics?: string
  sectionInstructions?: string
  aiInstructions?: string
  extraInstructions?: string
  documentContent?: string
  // New fields:
  overallTopic?: string          // Session overall topic name
  syllabus?: string              // Syllabus document content
  regulations?: string           // Regulations/Tax law content
  studyMaterial?: string         // Study material content
  sampleQuestions?: string       // Sample questions & answers for style reference
  ratesTariff?: string           // Rates & tariff tables
  otherContext?: string          // Other supporting documents
  questionTypes?: string         // JSON: [{type, count, marksEach}] - flexible question type breakdown
  topicBreakdown?: string        // JSON: [{topicId?, topicName, count}] - per-topic question breakdown
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
  // Parse flexible question types if available
  let qtRows: {type: string; count: number; marksEach: number}[] = []
  try { if (config.questionTypes) qtRows = JSON.parse(config.questionTypes) } catch {}

  // Parse topic breakdown if available
  let topicBreakdown: {topicId?: string; topicName: string; count: number}[] = []
  try { if (config.topicBreakdown) topicBreakdown = JSON.parse(config.topicBreakdown) } catch {}

  const typeInstructions: Record<string, string> = {
    MCQ_SINGLE: 'Multiple Choice (one correct answer): 4 options, 1 correct.',
    MCQ_MULTIPLE: 'Multiple Choice (multiple correct): 4-5 options, ≥2 correct.',
    FILL_BLANK: 'Fill in the blank: stem contains "___", provide correct answer.',
    SHORT_ANSWER: 'Short Answer: concise question, 2-5 sentence model answer.',
    ESSAY: 'Long Form Essay: complex scenario, sub-parts (a)(b)(c), full model answer.',
    SCENARIO: 'Scenario-Based: realistic scenario with data, required calculations/analysis, full workings.',
    CASE_STUDY: 'Case Study: detailed case with multiple parts, marking scheme per part.',
    OTHER: 'As appropriate for the context.',
  }

  // Build the document context section
  const contextParts: string[] = []

  if (config.syllabus) {
    contextParts.push(`=== SYLLABUS ===
IMPORTANT: Only generate questions on topics LISTED in the syllabus.
If the syllabus marks any section as [EXCLUDE] or "excluded", do NOT generate questions on those topics.
${config.syllabus.slice(0, 15000)}`)
  }

  if (config.regulations) {
    contextParts.push(`=== REGULATIONS / STUDY MATERIAL ===
Base questions on the following regulations. Use specific article numbers, percentages, thresholds, and rules where applicable.
DO NOT hallucinate figures — only use numbers explicitly stated in the text below.
${config.regulations.slice(0, 20000)}`)
  }

  if (config.studyMaterial && config.studyMaterial !== config.regulations) {
    contextParts.push(`=== STUDY MATERIAL ===
${config.studyMaterial.slice(0, 10000)}`)
  }

  if (config.ratesTariff) {
    contextParts.push(`=== RATES & TARIFF TABLES ===
When generating calculation questions (e.g. tax computation), use ONLY the rates and thresholds in this table.
${config.ratesTariff.slice(0, 8000)}`)
  }

  if (config.sampleQuestions) {
    contextParts.push(`=== SAMPLE QUESTIONS & ANSWERS (STYLE REFERENCE) ===
Use the following as style reference for question format, difficulty level, and answer depth.
DO NOT copy questions verbatim — generate NEW questions in the same style.
${config.sampleQuestions.slice(0, 12000)}`)
  }

  if (config.otherContext) {
    contextParts.push(`=== ADDITIONAL CONTEXT ===
${config.otherContext.slice(0, 8000)}`)
  }

  if (config.documentContent && contextParts.length === 0) {
    contextParts.push(`=== DOCUMENT CONTENT ===
${config.documentContent.slice(0, 30000)}`)
  }

  const hasDocuments = contextParts.length > 0

  // Build question specification
  let questionSpec = ''
  if (qtRows.length > 0) {
    questionSpec = `QUESTION TYPE BREAKDOWN:\n${qtRows.map(r => `- ${r.count} × ${typeInstructions[r.type] || r.type} (${r.marksEach} marks each)`).join('\n')}`
  } else {
    questionSpec = `QUESTION TYPE: ${typeInstructions[config.questionType] || config.questionType}\nMARKS PER QUESTION: ${config.marksPerQuestion}`
  }

  let topicSpec = ''
  if (topicBreakdown.length > 0) {
    topicSpec = `\nTOPIC DISTRIBUTION:\n${topicBreakdown.map(t => `- ${t.count} questions on: ${t.topicName}`).join('\n')}`
  } else if (config.topics) {
    topicSpec = `\nTOPICS TO COVER: ${config.topics}`
  }

  return `You are an expert professional exam question writer${config.overallTopic ? ` specializing in ${config.overallTopic}` : ''}.

SECTION: ${config.sectionName}
TOTAL QUESTIONS TO GENERATE: ${config.count}
${questionSpec}${topicSpec}

${contextParts.length > 0 ? contextParts.join('\n\n') : (config.overallTopic ? `No specific documents provided. Generate questions based on your expert knowledge of: ${config.overallTopic}` : 'No documents provided.')}

${config.sectionInstructions ? `\nSECTION INSTRUCTIONS:\n${config.sectionInstructions}` : ''}
${config.aiInstructions ? `\nAI GENERATION INSTRUCTIONS:\n${config.aiInstructions}` : ''}
${config.extraInstructions ? `\nEXTRA INSTRUCTIONS:\n${config.extraInstructions}` : ''}

GENERATION RULES:
1. ${hasDocuments ? 'Base ALL questions on the provided documents. DO NOT hallucinate facts, figures, or rules.' : 'Generate questions based on your expert knowledge.'}
2. For syllabus-constrained generation: ONLY test content explicitly listed in the Syllabus section. Skip [EXCLUDE] topics.
3. For calculations: use ONLY rates/thresholds from the Rates & Tariff section.
4. Style questions similarly to the Sample Questions (if provided) — same format, depth, and language.
5. Distribute questions across topics as specified in the Topic Distribution.
6. Each question MUST include a detailed explanation showing:
   - The correct answer and WHY it is correct
   - The calculation method or reasoning used
   - Why the distractors (wrong answers) are incorrect
   - A short reference to the relevant regulation/syllabus section/study material

OUTPUT FORMAT (JSON array, no markdown fences, no other text):
[
  {
    "stem": "Full question text. For scenarios: include all relevant data.",
    "options": ["Option A text", "Option B text", "Option C text", "Option D text"] or null for written questions,
    "correctAnswer": "Exact correct answer text (for MCQ: exact option text; for MULTIPLE: options joined by '||')",
    "markingScheme": "Detailed marking scheme — list each mark-worthy point explicitly",
    "modelAnswer": "Complete model answer with full workings (calculations, reasoning, conclusions)",
    "explanation": "Why this is correct, why distractors are wrong, calculation method used",
    "reference": "Brief reference: e.g. 'Article 3, Circular 78/2014; PIT Law 2007 s.22'",
    "topic": "Specific topic this question tests",
    "difficulty": "EASY" | "MEDIUM" | "HARD",
    "marks": ${config.marksPerQuestion}
  }
]

IMPORTANT: Return ONLY the JSON array. No preamble, no explanation, no markdown fences.`
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
