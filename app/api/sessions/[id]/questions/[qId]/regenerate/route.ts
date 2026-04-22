import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { generateExamQuestions } from '@/lib/ai'
import { readFile } from 'fs/promises'
import { join } from 'path'

async function extractDocumentText(filePath: string): Promise<string> {
  try {
    const fullPath = join(process.cwd(), 'public', filePath)
    const buffer = await readFile(fullPath)

    if (filePath.endsWith('.txt')) {
      return buffer.toString('utf-8').slice(0, 50000)
    }

    if (filePath.endsWith('.pdf')) {
      const pdfParse = require('pdf-parse')
      const data = await pdfParse(buffer)
      return data.text.slice(0, 50000)
    }

    return buffer.toString('utf-8').slice(0, 50000)
  } catch {
    return ''
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string; qId: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { modelId } = body

  const existingQ = await db.question.findUnique({
    where: { id: params.qId },
    include: { section: { select: { id: true, name: true } } },
  })
  if (!existingQ) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const sec = existingQ.sectionId
    ? await db.examSection.findUnique({ where: { id: existingQ.sectionId } })
    : null

  // Build document context same as generate route
  const docs = await (db as any).document.findMany({
    where: { sessionId: params.id },
    orderBy: { uploadedAt: 'asc' },
  }) as any[]

  const docsByType: Record<string, string[]> = {}
  for (const doc of docs) {
    const text = doc.isManualInput ? (doc.content || '') : await extractDocumentText(doc.filePath)
    if (!text) continue
    const key = doc.fileType as string
    if (!docsByType[key]) docsByType[key] = []
    docsByType[key].push(`[${doc.fileName}]\n${text}`)
  }
  const joinContent = (key: string) => (docsByType[key] || []).join('\n\n---\n\n').slice(0, 20000)

  const sessionData = await (db as any).session.findUnique({
    where: { id: params.id },
    include: { topics: { where: { isOverall: true } } },
  })
  const overallTopic = sessionData?.topics?.[0]?.name || undefined

  // Get session variables
  let sessionVarsText = ''
  try {
    const svars = await (db as any).sessionVariable.findMany({ where: { sessionId: params.id } }) as any[]
    if (svars.length > 0) {
      sessionVarsText =
        '\n\nSESSION VARIABLES (use these for calculations):\n' +
        svars.map((v: any) => `${v.varLabel}: ${v.varValue}${v.varUnit ? ' ' + v.varUnit : ''}`).join('\n')
    }
  } catch {}

  const generatorConfig = {
    sectionName: sec?.name || 'General',
    questionType: (existingQ as any).questionType || sec?.questionType || 'MCQ_SINGLE',
    marksPerQuestion: existingQ.marks || sec?.marksPerQuestion || 1,
    count: 1,
    topics: existingQ.topic || (sec as any)?.topics || undefined,
    sectionInstructions: (sec as any)?.instructions || undefined,
    aiInstructions: (sec as any)?.aiInstructions || undefined,
    overallTopic,
    syllabus: joinContent('SYLLABUS'),
    regulations: joinContent('TAX_REGULATIONS'),
    studyMaterial: joinContent('STUDY_MATERIAL'),
    sampleQuestions: joinContent('SAMPLE_QUESTIONS'),
    ratesTariff: joinContent('RATES_TARIFF'),
    otherContext: joinContent('OTHER') + sessionVarsText,
    questionTypes: sec ? (sec as any).questionTypes : undefined,
    topicBreakdown: sec ? (sec as any).topicBreakdown : undefined,
  }

  const results: any[] = []
  for await (const q of generateExamQuestions(generatorConfig, modelId || 'deepseek:deepseek-reasoner')) {
    results.push(q)
    break // only generate 1
  }

  if (results.length === 0) {
    return NextResponse.json({ error: 'Generation produced no results' }, { status: 500 })
  }

  const q = results[0]
  const updated = await db.question.update({
    where: { id: params.qId },
    data: {
      stem: String(q.stem || ''),
      options: q.options as any,
      correctAnswer: String(q.correctAnswer || ''),
      markingScheme: [
        q.markingScheme,
        q.explanation && `\nExplanation: ${q.explanation}`,
        q.reference && `\nReference: ${q.reference}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
      modelAnswer: String(q.modelAnswer || ''),
      topic: String(q.topic || ''),
      difficulty: (String(q.difficulty || 'MEDIUM')).toUpperCase() as any,
      status: 'NEEDS_REVIEW',
    },
    include: { section: { select: { id: true, name: true } } },
  })

  return NextResponse.json(updated)
}
