import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { generateExamQuestions } from '@/lib/ai'
import { readFile } from 'fs/promises'
import { join } from 'path'

// ── Context budget constants ──────────────────────────────────────────────────
const MAX_PER_FILE_CHARS = 150_000

const JOIN_CAPS_SYNC: Record<string, number> = {
  TAX_REGULATIONS:  100_000,
  SAMPLE_QUESTIONS:  40_000,
  SYLLABUS:          30_000,
  RATES_TARIFF:      15_000,
  STUDY_MATERIAL:    15_000,
  OTHER:             10_000,
}

// Extract text from uploaded document
async function extractDocumentText(filePath: string): Promise<string> {
  try {
    const fullPath = join(process.cwd(), 'public', filePath)
    const buffer = await readFile(fullPath)

    if (filePath.endsWith('.txt')) {
      return buffer.toString('utf-8').slice(0, MAX_PER_FILE_CHARS)
    }

    if (filePath.endsWith('.pdf')) {
      const pdfParse = require('pdf-parse')
      const data = await pdfParse(buffer)
      return data.text.slice(0, MAX_PER_FILE_CHARS)
    }

    return buffer.toString('utf-8').slice(0, MAX_PER_FILE_CHARS)
  } catch {
    return ''
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { sections: sectionConfigs, extraInstructions, modelId } = body

  if (!sectionConfigs || sectionConfigs.length === 0) {
    return NextResponse.json({ error: 'No sections selected' }, { status: 400 })
  }

  // Get session info and documents
  const sessionData = await (db as any).session.findUnique({
    where: { id: params.id },
    include: { topics: { where: { isOverall: true } } }
  })
  const overallTopic = sessionData?.topics?.[0]?.name || undefined

  // Get session variables
  let sessionVarsText = ''
  try {
    const svars = await (db as any).sessionVariable.findMany({ where: { sessionId: params.id } }) as any[]
    if (svars.length > 0) {
      sessionVarsText = '\n\nSESSION VARIABLES (use these for calculations):\n' + 
        svars.map((v: any) => `${v.varLabel}: ${v.varValue}${v.varUnit ? ' ' + v.varUnit : ''}`).join('\n')
    }
  } catch {}

  // Get documents by type
  const docs = await (db as any).document.findMany({ where: { sessionId: params.id }, orderBy: { uploadedAt: 'asc' } }) as any[]

  const docsByType: Record<string, string[]> = {}
  for (const doc of docs) {
    const text = doc.isManualInput ? (doc.content || '') : await extractDocumentText(doc.filePath)
    if (!text) continue
    const key = doc.fileType as string
    if (!docsByType[key]) docsByType[key] = []
    docsByType[key].push(`[${doc.fileName}]\n${text}`)
  }

  const joinContent = (key: string) => {
    const cap = JOIN_CAPS_SYNC[key] ?? 10_000
    return (docsByType[key] || []).join('\n\n---\n\n').slice(0, cap)
  }

  // Get section details
  const sectionIds = sectionConfigs.map((s: { sectionId: string }) => s.sectionId)
  const sections = await db.examSection.findMany({ where: { id: { in: sectionIds } } })

  const encoder = new TextEncoder()
  const stream = new TransformStream()
  const writer = stream.writable.getWriter()

  ;(async () => {
    try {
      for (const sectionConfig of sectionConfigs) {
        const sec = sections.find((s) => s.id === sectionConfig.sectionId)
        if (!sec) continue

        const generatorConfig = {
          sectionName: sec.name,
          questionType: sec.questionType,
          marksPerQuestion: sec.marksPerQuestion,
          count: sectionConfig.count || sec.questionsInBank,
          topics: sec.topics || undefined,
          sectionInstructions: sec.instructions || undefined,
          aiInstructions: sec.aiInstructions || undefined,
          extraInstructions: extraInstructions || undefined,
          overallTopic,
          // Document contexts by type:
          syllabus: joinContent('SYLLABUS'),
          regulations: joinContent('TAX_REGULATIONS'),
          studyMaterial: joinContent('STUDY_MATERIAL'),
          sampleQuestions: joinContent('SAMPLE_QUESTIONS'),
          ratesTariff: joinContent('RATES_TARIFF'),
          otherContext: joinContent('OTHER') + sessionVarsText,
          // Legacy fallback:
          documentContent: undefined,
          // Flexible question types from section:
          questionTypes: (sec as any).questionTypes || undefined,
          topicBreakdown: (sec as any).topicBreakdown || undefined,
        }

        for await (const q of generateExamQuestions(generatorConfig, modelId)) {
          // Save to DB
          try {
            const saved = await db.question.create({
              data: {
                sessionId: params.id,
                sectionId: sectionConfig.sectionId,
                stem: String(q.stem || ''),
                options: q.options as any,
                correctAnswer: String(q.correctAnswer || ''),
                markingScheme: [
                  q.markingScheme,
                  q.explanation && `\nExplanation: ${q.explanation}`,
                  q.reference && `\nReference: ${q.reference}`
                ].filter(Boolean).join('\n\n'),
                modelAnswer: String(q.modelAnswer || ''),
                topic: String(q.topic || ''),
                difficulty: (String(q.difficulty || 'MEDIUM')).toUpperCase() as 'EASY' | 'MEDIUM' | 'HARD',
                status: 'NEEDS_REVIEW',
                questionType: sec.questionType,
                marks: sec.marksPerQuestion,
              },
            })
            await writer.write(encoder.encode(`data: ${JSON.stringify({ ...q, id: saved.id })}\n\n`))
          } catch {
            await writer.write(encoder.encode(`data: ${JSON.stringify(q)}\n\n`))
          }
        }
      }
      await writer.write(encoder.encode('data: [DONE]\n\n'))
    } catch (e) {
      await writer.write(encoder.encode(`data: ${JSON.stringify({ error: String(e) })}\n\n`))
    } finally {
      await writer.close()
    }
  })()

  return new NextResponse(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
