import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { readFile } from 'fs/promises'
import { join } from 'path'

// Inline AI call helper (uses same providers as lib/ai/index.ts)
async function callAIForParsing(messages: { role: string; content: string }[], modelId?: string): Promise<string> {
  // Resolve provider/model
  let provider: string
  let model: string

  if (modelId) {
    const idx = modelId.indexOf(':')
    if (idx === -1) {
      provider = 'deepseek'
      model = modelId
    } else {
      provider = modelId.slice(0, idx)
      model = modelId.slice(idx + 1)
    }
  } else {
    // Read system settings or fall back to env
    try {
      const settings = await (db as any).systemSetting.findMany({
        where: { key: { in: ['ai_provider', 'ai_model_generation'] } },
      })
      const map: Record<string, string> = {}
      settings.forEach((s: any) => { map[s.key] = s.value })
      provider = map.ai_provider || process.env.AI_PROVIDER || 'deepseek'
      model = map.ai_model_generation || process.env.AI_MODEL_GENERATION || 'deepseek-reasoner'
    } catch {
      provider = process.env.AI_PROVIDER || 'deepseek'
      model = process.env.AI_MODEL_GENERATION || 'deepseek-reasoner'
    }
  }

  if (provider === 'anthropic') {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' })
    const response = await client.messages.create({
      model,
      max_tokens: 8000,
      messages: messages as any,
    })
    const block = response.content[0]
    return block.type === 'text' ? block.text : ''
  }

  // OpenAI-compatible (deepseek, openrouter, openai)
  const OpenAI = (await import('openai')).default
  let client: InstanceType<typeof OpenAI>
  if (provider === 'openrouter') {
    client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY || '',
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': process.env.NEXTAUTH_URL || 'https://testsgen.gpt4vn.com',
        'X-Title': 'TestsGen',
      },
    })
  } else if (provider === 'deepseek') {
    client = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY || '',
      baseURL: 'https://api.deepseek.com/v1',
    })
  } else {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' })
  }

  const response = await client.chat.completions.create({
    model,
    messages: messages as any,
    temperature: 0.3,
  })
  return response.choices[0]?.message?.content || ''
}

// Extract text from document file
async function extractText(filePath: string, isManualInput: boolean, content: string | null): Promise<string> {
  if (isManualInput) return content || ''
  try {
    const fullPath = join(process.cwd(), 'public', filePath)
    const buffer = await readFile(fullPath)
    if (filePath.endsWith('.txt')) return buffer.toString('utf-8')
    if (filePath.endsWith('.pdf')) {
      const pdfParse = require('pdf-parse')
      const data = await pdfParse(buffer)
      return data.text
    }
    return buffer.toString('utf-8')
  } catch { return '' }
}

// Parse text into individual questions using AI
async function parseQuestionsWithAI(text: string, modelId?: string): Promise<any[]> {
  const prompt = `You are parsing an exam sample questions document. Extract ALL individual questions from the text below.

For each question, extract:
- title: short title or question number (e.g. "Example 1", "Question 3", "Q5(a)")  
- content: the FULL question text including any scenario/data (do NOT truncate)
- answer: the answer and/or explanation provided (if any)
- questionType: one of MCQ_SINGLE, MCQ_MULTIPLE, FILL_BLANK, SHORT_ANSWER, ESSAY, SCENARIO, CASE_STUDY, OTHER
- difficulty: EASY, MEDIUM, or HARD (estimate from question complexity)

Return a JSON array. Include ALL questions found, even if partial. If no questions found, return [].

OUTPUT: JSON array only, no markdown, no extra text.

Example format:
[
  {
    "title": "Example 1",
    "content": "Company ABC Ltd had the following transactions in the tax year...\\nA. 100,000\\nB. 200,000\\nC. 300,000\\nD. 400,000",
    "answer": "The correct answer is B. 200,000 because...",
    "questionType": "MCQ_SINGLE",
    "difficulty": "MEDIUM"
  }
]

DOCUMENT TEXT:
${text.slice(0, 60000)}`

  try {
    const response = await callAIForParsing([{ role: 'user', content: prompt }], modelId)
    // Extract JSON from response
    const jsonMatch = response.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []
    return JSON.parse(jsonMatch[0])
  } catch { return [] }
}

// Rule-based parser (fast, no AI)
function parseQuestionsRuleBased(text: string): any[] {
  const questions: any[] = []

  // Try splitting on common patterns: "Example N:", "Question N:", "Q.N", numbered sections
  const patterns = [
    /(?:^|\n)(?:Example|Question|Q\.?)\s*(\d+[a-z]?)\s*[:\.)]/gim,
    /(?:^|\n)(\d+)\.\s+/gm,
  ]

  let matches: RegExpExecArray[] = []
  for (const pattern of patterns) {
    const found: RegExpExecArray[] = []
    let m: RegExpExecArray | null
    const re = new RegExp(pattern.source, pattern.flags)
    while ((m = re.exec(text)) !== null) found.push(m)
    if (found.length > matches.length) matches = found
  }

  if (matches.length === 0) {
    // Fallback: treat whole thing as one question
    if (text.trim().length > 50) {
      questions.push({ title: 'Full Document', content: text.trim(), answer: null, questionType: 'OTHER', difficulty: 'MEDIUM' })
    }
    return questions
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length
    const content = text.slice(start, end).trim()
    if (content.length < 20) continue

    // Detect if answer section is present
    const answerMatch = content.match(/(?:Answer|Ans|Solution|Marking Scheme)[:\s]*\n([\s\S]+)/i)
    const questionContent = answerMatch ? content.slice(0, answerMatch.index).trim() : content
    const answer = answerMatch ? answerMatch[1].trim() : null

    // Detect question type
    const hasOptions = /[A-D]\.\s|[A-D]\)\s|options:/i.test(questionContent)
    const isScenario = questionContent.length > 500

    questions.push({
      title: `Question ${i + 1}`,
      content: questionContent,
      answer,
      questionType: hasOptions ? 'MCQ_SINGLE' : isScenario ? 'SCENARIO' : 'SHORT_ANSWER',
      difficulty: 'MEDIUM',
    })
  }

  return questions
}

export async function POST(req: NextRequest, { params }: { params: { id: string; docId: string } }) {
  try {
    const body = await req.json().catch(() => ({}))
    const useAI = body.useAI ?? true
    const modelId = body.modelId

    // Get document
    const doc = await (db as any).document.findUnique({ where: { id: params.docId } })
    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

    // Extract text
    const text = await extractText(doc.filePath, doc.isManualInput, doc.content)
    if (!text || text.trim().length < 10) {
      return NextResponse.json({ error: 'No text content found in document' }, { status: 400 })
    }

    // Parse questions
    const rawQuestions = useAI
      ? await parseQuestionsWithAI(text, modelId)
      : parseQuestionsRuleBased(text)

    if (rawQuestions.length === 0) {
      return NextResponse.json({ error: 'No questions could be extracted from document', parsed: [], count: 0 }, { status: 200 })
    }

    // Delete existing parsed questions for this document
    await (db as any).parsedQuestion.deleteMany({ where: { documentId: params.docId } })

    // Save parsed questions
    const saved: any[] = []
    for (let i = 0; i < rawQuestions.length; i++) {
      const q = rawQuestions[i]
      const pq = await (db as any).parsedQuestion.create({
        data: {
          sessionId: params.id,
          documentId: params.docId,
          title: String(q.title || `Question ${i + 1}`),
          content: String(q.content || ''),
          answer: q.answer ? String(q.answer) : null,
          questionType: String(q.questionType || 'OTHER'),
          topicId: doc.topicId ?? null,
          topicName: doc.topicName ?? null,
          sectionId: doc.sectionId ?? null,
          sectionName: doc.sectionName ?? null,
          difficulty: String(q.difficulty || 'MEDIUM'),
          sortOrder: i,
          isManual: false,
        },
      })
      saved.push(pq)
    }

    return NextResponse.json({ parsed: saved, count: saved.length })
  } catch (e) {
    console.error('[parse questions]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
