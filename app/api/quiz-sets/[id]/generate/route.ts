import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { generateQuizQuestions } from '@/lib/ai'
import { readFile } from 'fs/promises'
import { join } from 'path'

// Extract plain text from a document file
async function extractDocumentText(filePath: string, fileType: string): Promise<string> {
  const fullPath = join(process.cwd(), 'public', filePath)
  const buffer = await readFile(fullPath)

  if (fileType === 'pdf') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse')
    const data = await pdfParse(buffer)
    return data.text ?? ''
  }

  if (fileType === 'docx' || fileType === 'doc') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return result.value ?? ''
  }

  // TXT or other text files
  return buffer.toString('utf-8')
}

// POST /api/quiz-sets/[id]/generate — AI question generation via SSE
// Body:
//   topic?: string              — free-text topic/content (from AI panel in questions page)
//   documentIds?: string[]      — IDs of QuizDocument records to use as context
//   pastedText?: string         — pasted content (from wizard step 1)
//   totalQuestions?: number
//   easyCount?: number
//   mediumCount?: number
//   hardCount?: number
//   easyPoints?: number
//   mediumPoints?: number
//   hardPoints?: number
//   questionTypes?: string[]
//   aiInstructions?: string
//   modelId?: string            — e.g. "openrouter:qwen/qwen3-plus"
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const where =
    session.user.role === 'ADMIN'
      ? { id: params.id }
      : { id: params.id, createdById: session.user.id }

  const quizSet = await db.quizSet.findFirst({ where })
  if (!quizSet) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json()
  const {
    topic,
    documentIds,
    pastedText,
    totalQuestions = 10,
    easyCount,
    mediumCount,
    hardCount,
    easyPoints = 1,
    mediumPoints = 1,
    hardPoints = 1,
    questionTypes = ['MCQ'],
    aiInstructions,
    modelId,
  } = body

  // ── Build document content ────────────────────────────────────────────────
  const contentParts: string[] = []

  // 1. Pasted text from wizard
  if (pastedText?.trim()) {
    contentParts.push(pastedText.trim())
  }

  // 2. Topic/free-text from AI panel
  if (topic?.trim()) {
    contentParts.push(topic.trim())
  }

  // 3. Uploaded documents by IDs
  if (Array.isArray(documentIds) && documentIds.length > 0) {
    const docs = await db.quizDocument.findMany({
      where: { id: { in: documentIds }, quizSetId: params.id },
    })
    for (const doc of docs) {
      try {
        const text = await extractDocumentText(doc.filePath, doc.fileType)
        if (text.trim()) {
          contentParts.push(`[Document: ${doc.fileName}]\n${text.trim()}`)
        }
      } catch (e) {
        console.error(`Failed to extract text from ${doc.fileName}:`, e)
      }
    }
  }

  // 4. If no explicit content — load ALL documents attached to this quiz set
  if (contentParts.length === 0) {
    const allDocs = await db.quizDocument.findMany({
      where: { quizSetId: params.id },
      orderBy: { uploadedAt: 'asc' },
    })
    for (const doc of allDocs) {
      try {
        const text = await extractDocumentText(doc.filePath, doc.fileType)
        if (text.trim()) {
          contentParts.push(`[Document: ${doc.fileName}]\n${text.trim()}`)
        }
      } catch {
        // skip unreadable docs
      }
    }
  }

  const documentContent = contentParts.join('\n\n---\n\n').slice(0, 60000) // max 60k chars

  if (!documentContent.trim()) {
    return NextResponse.json(
      { error: 'No content provided. Please enter a topic, paste text, or upload a document first.' },
      { status: 400 }
    )
  }

  // ── Calculate difficulty distribution ────────────────────────────────────
  const easy = easyCount ?? Math.round(totalQuestions * (quizSet.easyPercent / 100))
  const hard = hardCount ?? Math.round(totalQuestions * (quizSet.hardPercent / 100))
  const medium = mediumCount ?? totalQuestions - easy - hard

  // ── SSE stream ────────────────────────────────────────────────────────────
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()

  const send = async (data: object) => {
    await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
  }

  ;(async () => {
    try {
      await send({ type: 'start', message: 'Starting AI generation...' })

      let saved = 0

      const gen = generateQuizQuestions(
        {
          source: pastedText ? 'paste' : documentIds?.length ? 'upload' : 'manual',
          documentContent,
          title: quizSet.title,
          totalQuestions,
          easyCount: easy,
          mediumCount: medium,
          hardCount: hard,
          easyPoints,
          mediumPoints,
          hardPoints,
          questionTypes,
          aiInstructions,
        },
        modelId
      )

      for await (const q of gen) {
        const difficultyValue = ((q.difficulty as string) ?? 'MEDIUM')
          .toUpperCase() as 'EASY' | 'MEDIUM' | 'HARD'

        const rawType = ((q.questionType as string) ?? (q.type as string) ?? 'MCQ')
          .toUpperCase()
          .replace(/\s+/g, '_')

        const typeMap: Record<string, string> = {
          MCQ: 'MCQ',
          MULTIPLE_CHOICE: 'MCQ',
          MULTIPLE_RESPONSE: 'MULTIPLE_RESPONSE',
          MULTIPLE_SELECT: 'MULTIPLE_RESPONSE',
          TRUE_FALSE: 'TRUE_FALSE',
          TRUE_OR_FALSE: 'TRUE_FALSE',
          SHORT_ANSWER: 'SHORT_ANSWER',
          SHORT: 'SHORT_ANSWER',
          FILL_BLANK: 'FILL_BLANK',
          FILL_IN_THE_BLANK: 'FILL_BLANK',
          FILL_IN_BLANK: 'FILL_BLANK',
          ESSAY: 'ESSAY',
          LONG_ANSWER: 'LONG_ANSWER',
          MATCHING: 'MATCHING',
        }
        const questionType = typeMap[rawType] ?? 'MCQ'

        // Strip "A. ", "B. " etc. prefixes from AI-generated options to prevent double-labeling in UI
        const cleanOptions = (opts: unknown): string[] => {
          if (!Array.isArray(opts)) return []
          return (opts as string[]).map((o) => String(o).replace(/^[A-Za-z][.)]\s+/, '').trim())
        }

        // Get current max sortOrder for this quiz set to auto-increment
        const lastQ = await db.quizQuestion.findFirst({
          where: { quizSetId: params.id },
          orderBy: { sortOrder: 'desc' },
          select: { sortOrder: true },
        })
        const nextSortOrder = (lastQ?.sortOrder ?? 0) + 1

        const created = await db.quizQuestion.create({
          data: {
            quizSetId: params.id,
            stem: (q.stem as string) ?? (q.question as string) ?? '',
            questionType: questionType as import('@prisma/client').QuizQuestionType,
            options: cleanOptions(q.options),
            correctAnswer: (q.correctAnswer as string) ?? '',
            explanation: (q.explanation as string) ?? null,
            difficulty: difficultyValue,
            points: (q.points as number) ?? 1,
            sortOrder: nextSortOrder,
            topic: (q.topic as string) || null,
            tags: (q.tags as string) || null,
          },
        })

        saved++
        await send({ type: 'question', question: created, progress: saved, total: totalQuestions })
      }

      await send({ type: 'complete', message: `Generated ${saved} questions`, count: saved })
    } catch (error) {
      console.error('Quiz generation error:', error)
      await send({ type: 'error', message: String(error) })
    } finally {
      await writer.write(encoder.encode('data: [DONE]\n\n'))
      await writer.close()
    }
  })()

  return new NextResponse(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
