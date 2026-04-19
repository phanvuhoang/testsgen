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
  "points": number
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
  const typeInstructions: Record<string, string> = {
    MCQ_SINGLE: `Generate Multiple Choice questions with:
- A clear question stem (can include a short scenario)
- Exactly 4 answer options (A, B, C, D) with only one correct
- The correct answer indicated
- A marking scheme explaining why the answer is correct and why distractors are wrong`,
    
    MCQ_MULTIPLE: `Generate Multiple Choice questions (multiple correct answers) with:
- A clear question stem
- Exactly 4-5 answer options with potentially multiple correct answers
- All correct answers indicated
- A marking scheme`,
    
    SCENARIO: `Generate Scenario-Based questions with:
- A realistic business scenario with specific details and financial data
- Required tasks broken into sub-parts: (a), (b), (c) etc. with marks per sub-part
- A comprehensive model answer with all workings shown
- A detailed marking scheme listing every mark-worthy point`,
    
    ESSAY: `Generate Long Form Essay questions with:
- A complex scenario requiring analysis and professional judgment
- Required tasks with clear mark allocation
- A model answer hitting all key points
- A marking scheme with specific marks for each point`,
    
    SHORT_ANSWER: `Generate Short Answer questions with:
- A concise, specific question
- A model answer (3-5 sentences)
- A marking scheme indicating key points worth marks`,
  }

  return `You are an expert professional exam question writer specializing in ${config.sectionName}.

SECTION DETAILS:
- Section: ${config.sectionName}
- Question Type: ${config.questionType}
- Marks per Question: ${config.marksPerQuestion}
- Topics: ${config.topics || 'As covered in the documents'}

DOCUMENT CONTENT:
${config.documentContent || 'No document provided — use your expert knowledge.'}

${config.sectionInstructions ? `SECTION INSTRUCTIONS:\n${config.sectionInstructions}` : ''}
${config.aiInstructions ? `AI GENERATION INSTRUCTIONS:\n${config.aiInstructions}` : ''}
${config.extraInstructions ? `EXTRA INSTRUCTIONS:\n${config.extraInstructions}` : ''}

QUESTION FORMAT:
${typeInstructions[config.questionType] || typeInstructions.MCQ_SINGLE}

Generate exactly ${config.count} questions.

OUTPUT FORMAT:
Return a JSON array where each question has:
{
  "stem": "Full question text",
  "options": ["A. ...", "B. ...", "C. ...", "D. ..."] or null for written questions,
  "correctAnswer": "Correct answer or option text",
  "markingScheme": "Detailed marking scheme",
  "modelAnswer": "Complete model answer with workings",
  "topic": "Specific topic this question covers",
  "difficulty": "EASY" | "MEDIUM" | "HARD",
  "marks": ${config.marksPerQuestion}
}

CRITICAL RULES:
1. Questions MUST reference specific content from the uploaded documents
2. Use realistic details (specific numbers, percentages, company names)
3. For professional exams: use industry-standard terminology
4. Marking schemes must clearly specify which points earn marks
5. Return ONLY the JSON array, no other text.`
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
