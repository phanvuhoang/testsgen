import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { readFile } from 'fs/promises'
import { join } from 'path'

// Extract raw text from file
async function extractText(filePath: string, isManualInput: boolean, content: string | null): Promise<string> {
  if (isManualInput) return content || ''
  try {
    const fullPath = join(process.cwd(), 'public', filePath)
    const buffer = await readFile(fullPath)
    const ext = filePath.toLowerCase()
    if (ext.endsWith('.txt')) return buffer.toString('utf-8')
    if (ext.endsWith('.pdf')) {
      try {
        const pdfParse = require('pdf-parse')
        const data = await pdfParse(buffer)
        return data.text
      } catch {
        return buffer.toString('utf-8')
      }
    }
    if (ext.endsWith('.docx') || ext.endsWith('.doc')) {
      return extractDocxText(buffer)
    }
    return buffer.toString('utf-8')
  } catch (e) {
    console.error('[parse] extractText error', e)
    return ''
  }
}

// Extract text from DOCX by parsing XML directly (no mammoth needed)
function extractDocxText(buffer: Buffer): string {
  try {
    // DOCX is a zip — use a simple regex to strip XML tags
    const content = buffer.toString('utf-8')
    // Find word/document.xml content by regex
    const xmlMatch = content.match(/word\/document\.xml/)
    if (!xmlMatch) {
      // Fallback: strip all XML tags
      return content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    }
    return content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  } catch {
    return ''
  }
}

// Parse DOCX XML to get paragraphs with styles (for pattern-based parsing)
function parseDocxParagraphs(buffer: Buffer): { style: string; text: string }[] {
  try {
    // DOCX is ZIP — try to read word/document.xml via string search
    const raw = buffer.toString('binary')
    // Find start of word/document.xml content
    const xmlStart = raw.indexOf('<?xml')
    const xmlContent = xmlStart >= 0 ? raw.slice(xmlStart) : raw

    const paragraphs: { style: string; text: string }[] = []
    // Match <w:p ...>...</w:p> blocks
    const paraRegex = /<w:p[ >][\s\S]*?<\/w:p>/g
    let pm: RegExpExecArray | null
    while ((pm = paraRegex.exec(xmlContent)) !== null) {
      const paraXml = pm[0]
      // Better: search for pStyle specifically
      const pStyleMatch = paraXml.match(/<w:pStyle w:val="([^"]+)"/)
      const style = pStyleMatch ? pStyleMatch[1] : ''
      const textMatches = Array.from(paraXml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g))
      const text = textMatches.map(m => m[1]).join('').trim()
      if (text) paragraphs.push({ style, text })
    }
    return paragraphs
  } catch {
    return []
  }
}

// Pattern: split on Heading2 paragraphs matching "Example N:" (from examsgen)
function parseByHeading2Example(paragraphs: { style: string; text: string }[]): any[] {
  const heading2Styles = new Set(['Heading2', 'heading2', '2', 'Heading 2', 'heading 2'])
  const examplePattern = /^Example\s+\d+\s*:/i

  let splitIndices: number[] = paragraphs
    .map((p, i) => (heading2Styles.has(p.style) && examplePattern.test(p.text)) ? i : -1)
    .filter(i => i !== -1)

  // Fallback: match "Example N:" in plain text even without heading style
  if (splitIndices.length === 0) {
    splitIndices = paragraphs
      .map((p, i) => examplePattern.test(p.text) ? i : -1)
      .filter(i => i !== -1)
  }

  if (splitIndices.length === 0) return []

  return splitIndices.map((hi, idx) => {
    const headingText = paragraphs[hi].text
    const numMatch = headingText.match(/\d+/)
    const exNum = numMatch ? parseInt(numMatch[0]) : idx + 1
    const nextHi = idx + 1 < splitIndices.length ? splitIndices[idx + 1] : paragraphs.length
    const contentParts = paragraphs.slice(hi, nextHi).map(p => p.text)
    const content = contentParts.join('\n').trim()
    if (content.length < 30) return null

    // Try to split question from answer
    const answerSplit = content.match(/(?:^|\n)(Answer|Ans|Solution|Marking Scheme|ANSWER)[\s:]/im)
    const questionContent = answerSplit ? content.slice(0, content.indexOf(answerSplit[0])).trim() : content
    const answer = answerSplit ? content.slice(content.indexOf(answerSplit[0]) + answerSplit[0].length).trim() : null

    return {
      title: `Example ${exNum}`,
      content: questionContent,
      answer,
      questionType: detectQuestionType(questionContent),
      difficulty: 'MEDIUM',
    }
  }).filter(Boolean)
}

// Pattern: split on numbered list "1.", "2." etc.
function parseByNumberedList(paragraphs: { style: string; text: string }[]): any[] {
  const numbered = paragraphs
    .map((p, i) => ({ ...p, i }))
    .filter(p => /^\d+[\.\)]\s+/.test(p.text))

  if (numbered.length === 0) return []

  return numbered.map((p, idx) => {
    const nextIdx = idx + 1 < numbered.length ? numbered[idx + 1].i : paragraphs.length
    const contentParts = paragraphs.slice(p.i, nextIdx).map(pp => pp.text)
    const content = contentParts.join('\n').trim()
    if (content.length < 20) return null
    return {
      title: `Question ${idx + 1}`,
      content,
      answer: null,
      questionType: detectQuestionType(content),
      difficulty: 'MEDIUM',
    }
  }).filter(Boolean)
}

function detectQuestionType(text: string): string {
  if (/[A-D]\.\s|[A-D]\)\s/.test(text)) return 'MCQ_SINGLE'
  if (text.length > 500 || /scenario|calculate|required/i.test(text)) return 'SCENARIO'
  if (/\(a\)|\(b\)/i.test(text)) return 'CASE_STUDY'
  return 'SHORT_ANSWER'
}

// AI-based parse (fallback or explicit)
async function parseWithAI(text: string, sessionId: string): Promise<any[]> {
  // Get project parsePattern setting for context
  try {
    const session = await (db as any).session.findUnique({
      where: { id: sessionId },
      include: { project: { select: { parsePattern: true } } }
    })
    const patternHint = session?.project?.parsePattern || 'HEADING2_EXAMPLE'

    let patternNote = ''
    if (patternHint === 'HEADING2_EXAMPLE') {
      patternNote = 'Questions are separated by headings like "Example 1:", "Example 2:".'
    } else if (patternHint === 'NUMBERED_LIST') {
      patternNote = 'Questions are in a numbered list format (1., 2., 3. etc.).'
    }

    // Build provider/model from env
    let provider = process.env.AI_PROVIDER || 'deepseek'
    let model = process.env.AI_MODEL_GENERATION || 'deepseek-reasoner'

    try {
      const settings = await (db as any).systemSetting.findMany({
        where: { key: { in: ['ai_provider', 'ai_model_generation'] } }
      })
      const map: Record<string, string> = {}
      settings.forEach((s: any) => { map[s.key] = s.value })
      if (map.ai_provider) provider = map.ai_provider
      if (map.ai_model_generation) model = map.ai_model_generation
    } catch {}

    const prompt = `You are parsing a sample exam questions document. ${patternNote}
Extract ALL individual questions. For each, return:
- title: e.g. "Example 1", "Question 3"
- content: full question text (do NOT truncate)
- answer: answer/explanation if present, else null
- questionType: MCQ_SINGLE | MCQ_MULTIPLE | SHORT_ANSWER | SCENARIO | CASE_STUDY | OTHER
- difficulty: EASY | MEDIUM | HARD

Return ONLY a JSON array. No markdown.

DOCUMENT:
${text.slice(0, 50000)}`

    const OpenAI = (await import('openai')).default
    let client: InstanceType<typeof OpenAI>
    if (provider === 'deepseek') {
      client = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY || '', baseURL: 'https://api.deepseek.com/v1' })
    } else if (provider === 'openrouter') {
      client = new OpenAI({ apiKey: process.env.OPENROUTER_API_KEY || '', baseURL: 'https://openrouter.ai/api/v1' })
    } else if (provider === 'claudible') {
      client = new OpenAI({ apiKey: process.env.CLAUDIBLE_API_KEY || '', baseURL: process.env.CLAUDIBLE_BASE_URL || 'https://claudible.io/v1' })
      model = process.env.CLAUDIBLE_MODEL || 'claude-haiku-4.5'
    } else {
      client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' })
    }

    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 8000,
    })
    const raw = response.choices[0]?.message?.content || ''
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []
    return JSON.parse(jsonMatch[0])
  } catch (e) {
    console.error('[parse AI]', e)
    return []
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string; docId: string } }) {
  try {
    const body = await req.json().catch(() => ({}))
    const forceAI: boolean = body.forceAI === true

    // Get document
    const doc = await (db as any).document.findUnique({ where: { id: params.docId } })
    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

    // Get project parse pattern
    const session = await (db as any).session.findUnique({
      where: { id: params.id },
      include: { project: { select: { parsePattern: true } } }
    })
    const parsePattern: string = session?.project?.parsePattern || 'HEADING2_EXAMPLE'

    // Extract raw file bytes for DOCX paragraph parsing
    let docxBuffer: Buffer | null = null
    if (!doc.isManualInput && (doc.filePath?.endsWith('.docx') || doc.filePath?.endsWith('.doc'))) {
      try {
        docxBuffer = await readFile(join(process.cwd(), 'public', doc.filePath))
      } catch {}
    }

    let rawQuestions: any[] = []

    // Try structural (fast) parse first unless forceAI
    if (!forceAI && docxBuffer) {
      const paragraphs = parseDocxParagraphs(docxBuffer)
      if (parsePattern === 'HEADING2_EXAMPLE') {
        rawQuestions = parseByHeading2Example(paragraphs)
      } else if (parsePattern === 'NUMBERED_LIST') {
        rawQuestions = parseByNumberedList(paragraphs)
      }
    }

    // If structural parse found nothing (or AI_ONLY or forceAI), use AI
    if (rawQuestions.length === 0) {
      const text = await extractText(doc.filePath, doc.isManualInput, doc.content)
      if (!text || text.trim().length < 10) {
        return NextResponse.json({ error: 'No text content found in document', parsed: [], count: 0 })
      }
      rawQuestions = await parseWithAI(text, params.id)
    }

    if (rawQuestions.length === 0) {
      return NextResponse.json({
        error: 'No questions could be extracted. Try a different parse pattern in Project Settings.',
        parsed: [],
        count: 0,
      })
    }

    // Delete existing parsed questions for this document
    await (db as any).parsedQuestion.deleteMany({ where: { documentId: params.docId } })

    // Save
    const saved: any[] = []
    for (let i = 0; i < rawQuestions.length; i++) {
      const q = rawQuestions[i]
      try {
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
      } catch (e) {
        console.error('[parse] save error', e)
      }
    }

    return NextResponse.json({ parsed: saved, count: saved.length })
  } catch (e) {
    console.error('[parse questions]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
