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
      try {
        const mammoth = require('mammoth')
        const result = await mammoth.extractRawText({ buffer })
        return result.value ?? ''
      } catch {
        return buffer.toString('utf-8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      }
    }
    return buffer.toString('utf-8')
  } catch (e) {
    console.error('[parse] extractText error', e)
    return ''
  }
}

// Helper: extract paragraphs from OOXML string
function extractParagraphsFromXml(xmlContent: string): { style: string; text: string }[] {
  const paragraphs: { style: string; text: string }[] = []
  const paraRegex = /<w:p[ >][\s\S]*?<\/w:p>/g
  let pm: RegExpExecArray | null
  while ((pm = paraRegex.exec(xmlContent)) !== null) {
    const paraXml = pm[0]
    const pStyleMatch = paraXml.match(/<w:pStyle\s+w:val="([^"]+)"/)
    const style = pStyleMatch ? pStyleMatch[1] : ''
    const textMatches = Array.from(paraXml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g))
    const text = textMatches.map((m: RegExpMatchArray) => m[1]).join('').trim()
    if (text) paragraphs.push({ style, text })
  }
  console.log(`[parseDocx] extractParagraphsFromXml: found ${paragraphs.length} paragraphs`)
  return paragraphs
}

// Parse DOCX XML to get paragraphs with styles — multiple fallback strategies
function parseDocxParagraphs(buffer: Buffer): { style: string; text: string }[] {
  // Strategy 1: adm-zip proper ZIP extraction
  try {
    const AdmZip = require('adm-zip')
    const zip = new AdmZip(buffer)

    let xmlContent: string | null = null
    const entry = zip.getEntry('word/document.xml')
    if (entry) {
      xmlContent = entry.getData().toString('utf-8')
    } else {
      const entries = zip.getEntries()
      const docEntry = entries.find((e: any) =>
        e.entryName.toLowerCase() === 'word/document.xml' ||
        e.entryName.toLowerCase().endsWith('document.xml')
      )
      if (docEntry) xmlContent = docEntry.getData().toString('utf-8')
    }

    if (xmlContent && xmlContent.includes('<w:p')) {
      return extractParagraphsFromXml(xmlContent)
    }
    console.warn('[parseDocx] adm-zip got entry but XML looks invalid, trying buffer strategy')
  } catch (e) {
    console.warn('[parseDocx] adm-zip failed:', String(e))
  }

  // Strategy 2: scan buffer for XML content by finding 'word/document.xml' marker
  try {
    const raw = buffer.toString('latin1')
    const marker = 'word/document.xml'
    const markerIdx = raw.indexOf(marker)
    if (markerIdx > 0) {
      const searchFrom = markerIdx + marker.length
      const xmlStart = raw.indexOf('<?xml', searchFrom)
      const wbodyStart = raw.indexOf('<w:body', searchFrom)
      const startIdx = xmlStart > 0 && xmlStart < searchFrom + 200 ? xmlStart
        : wbodyStart > 0 && wbodyStart < searchFrom + 500 ? wbodyStart : -1
      if (startIdx > 0) {
        const xmlSlice = buffer.slice(startIdx).toString('utf-8')
        if (xmlSlice.includes('<w:p')) {
          console.log('[parseDocx] Strategy 2 (buffer scan) succeeded')
          return extractParagraphsFromXml(xmlSlice)
        }
      }
    }
  } catch (e) {
    console.warn('[parseDocx] Strategy 2 failed:', String(e))
  }

  // Strategy 3: mammoth structural — get styled text via style map
  try {
    const mammoth = require('mammoth')
    const result = mammoth.convertToHtmlSync({ buffer }, {
      styleMap: [
        "p[style-name='Heading 1'] => h1",
        "p[style-name='Heading 2'] => h2",
        "p[style-name='Heading 3'] => h3",
      ]
    })
    const html: string = result.value
    const paragraphs: { style: string; text: string }[] = []
    const tagPattern = /<(h1|h2|h3|p)[^>]*>([\s\S]*?)<\/\1>/g
    let m: RegExpExecArray | null
    while ((m = tagPattern.exec(html)) !== null) {
      const tag = m[1]
      const text = m[2].replace(/<[^>]+>/g, '').trim()
      const style = tag === 'h1' ? 'Heading1' : tag === 'h2' ? 'Heading2' : tag === 'h3' ? 'Heading3' : ''
      if (text) paragraphs.push({ style, text })
    }
    if (paragraphs.length > 0) {
      console.log(`[parseDocx] Strategy 3 (mammoth HTML) succeeded: ${paragraphs.length} paragraphs`)
      return paragraphs
    }
  } catch (e) {
    console.warn('[parseDocx] Strategy 3 (mammoth) failed:', String(e))
  }

  console.warn('[parseDocx] All strategies failed, returning empty')
  return []
}

// Extract text from a buffer (avoid re-reading file for AI fallback)
async function extractTextFromBuffer(buffer: Buffer, filePath: string): Promise<string> {
  if (filePath?.endsWith('.docx') || filePath?.endsWith('.doc')) {
    try {
      const mammoth = require('mammoth')
      const result = await mammoth.extractRawText({ buffer })
      return result.value ?? ''
    } catch {}
  }
  return buffer.toString('utf-8')
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

// Generic heading-keyword parser (replaces parseByHeading2Example)
function parseByHeadingKeyword(
  paragraphs: { style: string; text: string }[],
  headingStyles: string[],
  keywordPattern: RegExp,
  parseKeyword: string
): any[] {
  const styleSet = new Set(headingStyles)

  let splitIndices: number[] = paragraphs
    .map((p, i) => (styleSet.size === 0 || styleSet.has(p.style)) && keywordPattern.test(p.text) ? i : -1)
    .filter(i => i !== -1)

  if (splitIndices.length === 0) {
    splitIndices = paragraphs
      .map((p, i) => keywordPattern.test(p.text) ? i : -1)
      .filter(i => i !== -1)
  }

  if (splitIndices.length === 0) return []

  return splitIndices.map((hi, idx) => {
    const headingText = paragraphs[hi].text
    const numMatch = headingText.match(/\d+/)
    const exNum = numMatch ? parseInt(numMatch[0]) : idx + 1
    const nextHi = idx + 1 < splitIndices.length ? splitIndices[idx + 1] : paragraphs.length
    const content = paragraphs.slice(hi, nextHi).map(p => p.text).join('\n').trim()
    if (content.length < 30) return null

    const answerSplit = content.match(/(?:^|\n)(Answer|Ans|Solution|Marking Scheme|ANSWER)[\s:]/im)
    const questionContent = answerSplit
      ? content.slice(0, content.indexOf(answerSplit[0])).trim()
      : content
    const answer = answerSplit
      ? content.slice(content.indexOf(answerSplit[0]) + answerSplit[0].length).trim()
      : null

    return {
      title: `${parseKeyword} ${exNum}`,
      content: questionContent,
      answer,
      questionType: detectQuestionType(questionContent),
      difficulty: 'MEDIUM',
    }
  }).filter(Boolean)
}

// Text-based split for PDF/TXT files
function parseByTextSplit(text: string, keywordPattern: RegExp): any[] {
  const lines = text.split('\n')
  const splitIndices = lines
    .map((l, i) => keywordPattern.test(l.trim()) ? i : -1)
    .filter(i => i !== -1)

  if (splitIndices.length === 0) return []

  return splitIndices.map((si, idx) => {
    const nextSi = idx + 1 < splitIndices.length ? splitIndices[idx + 1] : lines.length
    const content = lines.slice(si, nextSi).join('\n').trim()
    if (content.length < 30) return null
    const numMatch = lines[si].match(/\d+/)
    const exNum = numMatch ? parseInt(numMatch[0]) : idx + 1

    const answerSplit = content.match(/(?:^|\n)(Answer|Ans|Solution|Marking Scheme|ANSWER)[\s:]/im)
    const questionContent = answerSplit ? content.slice(0, content.indexOf(answerSplit[0])).trim() : content
    const answer = answerSplit ? content.slice(content.indexOf(answerSplit[0]) + answerSplit[0].length).trim() : null

    return {
      title: lines[si].trim(),
      content: questionContent,
      answer,
      questionType: detectQuestionType(questionContent),
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

// AI-based parse — always uses claudible for speed/reliability
async function parseWithAI(text: string, sessionId: string, parseKeyword: string = 'Example', parseNumber: boolean = true): Promise<any[]> {
  try {
    const patternNote = `Questions are separated by the pattern "${parseKeyword}${parseNumber ? ' <number>' : ''}:" e.g. "${parseKeyword} 1:", "${parseKeyword} 2:".`

    const provider = 'claudible'
    const model = process.env.CLAUDIBLE_MODEL || 'claude-haiku-4.5'
    const apiKey = process.env.CLAUDIBLE_API_KEY || ''
    const baseURL = process.env.CLAUDIBLE_BASE_URL || 'https://claudible.io/v1'

    const prompt = `You are parsing a sample exam questions document.
${patternNote}
Extract ALL individual questions. For each return JSON:
- title: string (e.g. "Example 1")
- content: string (full question text, do NOT truncate)
- answer: string | null (answer/solution if present)
- questionType: "MCQ_SINGLE" | "MCQ_MULTIPLE" | "SHORT_ANSWER" | "SCENARIO" | "CASE_STUDY" | "OTHER"
- difficulty: "EASY" | "MEDIUM" | "HARD"

Return ONLY a JSON array. No markdown. No explanation.

DOCUMENT TEXT:
${text.slice(0, 60000)}`

    const OpenAI = (await import('openai')).default
    const client = new OpenAI({ apiKey, baseURL })
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 16000,
    })
    const raw = response.choices[0]?.message?.content || ''
    console.log('[parseWithAI] response length:', raw.length)
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      console.warn('[parseWithAI] no JSON array found in response')
      return []
    }
    return JSON.parse(jsonMatch[0])
  } catch (e) {
    console.error('[parse AI]', e)
    return []
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string; docId: string } }) {
  try {
    const body = await req.json().catch(() => ({}))
    const forceAI: boolean = body.forceAI === true || body.useAI === true

    const doc = await (db as any).document.findUnique({ where: { id: params.docId } })
    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

    const parseKeyword: string = body.parseKeyword || (doc as any).parseKeyword || 'Example'
    const parseStyle: string   = body.parseStyle   || (doc as any).parseStyle   || 'Heading2'
    const parseNumber: boolean = body.parseNumber  !== undefined ? body.parseNumber : ((doc as any).parseNumber !== false)
    const parseSuffix: string  = body.parseSuffix  !== undefined ? body.parseSuffix : ((doc as any).parseSuffix ?? ':')
    const escapedSuffix = parseSuffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    const keywordPattern = parseNumber
      ? new RegExp(`^${parseKeyword}\\s+\\d+\\s*${escapedSuffix}`, 'i')
      : new RegExp(`^${parseKeyword}\\s*${escapedSuffix}`, 'i')

    console.log(`[parse] doc=${params.docId} keyword="${parseKeyword}" number=${parseNumber} suffix="${parseSuffix}" style="${parseStyle}" pattern=${keywordPattern}`)

    const headingStyles = parseStyle === 'Heading1' ? ['Heading1', 'heading1', '1', 'Heading 1']
      : parseStyle === 'Heading2' ? ['Heading2', 'heading2', '2', 'Heading 2', 'heading 2']
      : parseStyle === 'Heading3' ? ['Heading3', 'heading3', '3', 'Heading 3']
      : []

    let docxBuffer: Buffer | null = null
    if (!doc.isManualInput && doc.filePath && (doc.filePath.endsWith('.docx') || doc.filePath.endsWith('.doc'))) {
      try {
        docxBuffer = await readFile(join(process.cwd(), 'public', doc.filePath))
        console.log(`[parse] loaded docx buffer: ${docxBuffer.length} bytes`)
      } catch (e) {
        console.warn('[parse] failed to read file:', String(e))
      }
    }

    let rawQuestions: any[] = []
    let strategy = 'none'

    // Structural parse (DOCX)
    if (docxBuffer && parseStyle !== 'ai') {
      const paragraphs = parseDocxParagraphs(docxBuffer)
      console.log(`[parse] paragraphs extracted: ${paragraphs.length}`)
      if (paragraphs.length > 0) {
        console.log('[parse] sample paragraphs:', JSON.stringify(paragraphs.slice(0, 5)))
      }
      if (parseStyle === 'numbered') {
        rawQuestions = parseByNumberedList(paragraphs)
        strategy = 'numbered'
      } else {
        rawQuestions = parseByHeadingKeyword(paragraphs, headingStyles, keywordPattern, parseKeyword)
        strategy = `heading(${parseStyle})+keyword(${keywordPattern})`
      }
      console.log(`[parse] structural result: ${rawQuestions.length} questions via ${strategy}`)
    }

    // Text-based fallback for PDF/TXT
    if (rawQuestions.length === 0 && !docxBuffer && parseStyle !== 'ai') {
      const text = await extractText(doc.filePath, doc.isManualInput, doc.content)
      if (text && text.trim().length >= 10) {
        rawQuestions = parseByTextSplit(text, keywordPattern)
        strategy = 'text-split'
        console.log(`[parse] text-split result: ${rawQuestions.length} questions`)
      }
    }

    // AI fallback — always if structural found 0, or forceAI/ai style
    if (rawQuestions.length === 0 || parseStyle === 'ai' || forceAI) {
      console.log('[parse] falling back to AI parse...')
      const text = docxBuffer
        ? await extractTextFromBuffer(docxBuffer, doc.filePath)
        : await extractText(doc.filePath, doc.isManualInput, doc.content)
      if (!text || text.trim().length < 10) {
        return NextResponse.json({
          error: 'Could not extract text from document. Is the file corrupted?',
          parsed: [], count: 0, debug: { strategy, paragraphs: 0 }
        })
      }
      console.log(`[parse] AI parse on ${text.length} chars`)
      rawQuestions = await parseWithAI(text, params.id, parseKeyword, parseNumber)
      strategy = 'AI'
      console.log(`[parse] AI result: ${rawQuestions.length} questions`)
    }

    if (rawQuestions.length === 0) {
      return NextResponse.json({
        error: `No questions found. Pattern tried: "${parseKeyword}${parseNumber ? ' <N>' : ''}${parseSuffix}". Try: (1) change keyword, (2) use style "None", (3) try AI parse mode.`,
        parsed: [], count: 0,
        debug: { strategy, keyword: parseKeyword, suffix: parseSuffix, number: parseNumber }
      })
    }

    // Delete existing + save new
    await (db as any).parsedQuestion.deleteMany({ where: { documentId: params.docId } })
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

    return NextResponse.json({ parsed: saved, count: saved.length, strategy })
  } catch (e) {
    console.error('[parse questions]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
