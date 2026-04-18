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
  const typesList = config.questionTypes.join(', ') || 'MCQ'
  
  return `You are an expert exam question creator. Generate exactly ${config.totalQuestions} quiz questions based on the provided content.

CONTENT:
${config.documentContent || 'No specific document provided — generate general knowledge questions about the topic.'}

QUESTION SPECIFICATIONS:
- Easy questions: ${config.easyCount} (worth ${config.easyPoints} point each)
- Medium questions: ${config.mediumCount} (worth ${config.mediumPoints} points each)  
- Hard questions: ${config.hardCount} (worth ${config.hardPoints} points each)
- Question types to include: ${typesList}

${config.aiInstructions ? `ADDITIONAL INSTRUCTIONS:\n${config.aiInstructions}` : ''}

OUTPUT FORMAT:
Return a JSON array where each question object has:
{
  "stem": "The question text",
  "questionType": "MCQ" | "TRUE_FALSE" | "SHORT_ANSWER",
  "options": ["A. option1", "B. option2", "C. option3", "D. option4"] (for MCQ only, omit for others),
  "correctAnswer": "The correct option text or answer",
  "explanation": "Why this is correct and the educational context",
  "difficulty": "EASY" | "MEDIUM" | "HARD",
  "points": number
}

RULES:
1. For MCQ: provide exactly 4 options labeled A, B, C, D. correctAnswer should be the full option text.
2. For TRUE_FALSE: options are ["True", "False"]. correctAnswer is "True" or "False".
3. For SHORT_ANSWER: no options. correctAnswer is a brief model answer.
4. Questions must be based on the provided content — no hallucination.
5. Distribute difficulties as specified.
6. Make distractors plausible but clearly wrong upon careful reading.
7. Return ONLY the JSON array, no other text.`
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
