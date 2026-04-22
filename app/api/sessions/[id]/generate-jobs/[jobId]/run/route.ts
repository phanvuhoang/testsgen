import { NextRequest, NextResponse } from 'next/server'
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

export async function POST(_req: NextRequest, { params }: { params: { id: string; jobId: string } }) {
  const job = await (db as any).generateJob.findUnique({ where: { id: params.jobId } })
  if (!job || (job.status !== 'PENDING' && job.status !== 'RUNNING')) {
    return NextResponse.json({ error: 'Job not found or already processed' }, { status: 400 })
  }

  // Update to RUNNING immediately
  await (db as any).generateJob.update({ where: { id: params.jobId }, data: { status: 'RUNNING' } })

  // Parse config
  const config = JSON.parse(job.config)
  const { sectionConfigs, extraInstructions, modelId } = config

  const sessionId = params.id
  const jobId = params.jobId

  // Run generation asynchronously — respond immediately so the HTTP request doesn't block
  ;(async () => {
    try {
      // Get session data
      const sessionData = await (db as any).session.findUnique({
        where: { id: sessionId },
        include: { topics: { where: { isOverall: true } } },
      })
      const overallTopic = sessionData?.topics?.[0]?.name || undefined

      // Get session variables
      let sessionVarsText = ''
      try {
        const svars = await (db as any).sessionVariable.findMany({ where: { sessionId } }) as any[]
        if (svars.length > 0) {
          sessionVarsText =
            '\n\nSESSION VARIABLES (use these for calculations):\n' +
            svars.map((v: any) => `${v.varLabel}: ${v.varValue}${v.varUnit ? ' ' + v.varUnit : ''}`).join('\n')
        }
      } catch {}

      // Get documents by type
      const docs = await (db as any).document.findMany({
        where: { sessionId },
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

      // Get section details
      const sectionIds = sectionConfigs.map((s: any) => s.sectionId)
      const sections = await (db as any).examSection.findMany({ where: { id: { in: sectionIds } } })

      let progress = 0

      for (const sectionConfig of sectionConfigs) {
        // Check if job was cancelled between sections
        const currentJob = await (db as any).generateJob.findUnique({ where: { id: jobId } })
        if (!currentJob || currentJob.status === 'FAILED') break

        const sec = sections.find((s: any) => s.id === sectionConfig.sectionId)
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
          syllabus: joinContent('SYLLABUS'),
          regulations: joinContent('TAX_REGULATIONS'),
          studyMaterial: joinContent('STUDY_MATERIAL'),
          sampleQuestions: joinContent('SAMPLE_QUESTIONS'),
          ratesTariff: joinContent('RATES_TARIFF'),
          otherContext: joinContent('OTHER') + sessionVarsText,
          questionTypes: sec.questionTypes || undefined,
          topicBreakdown: sec.topicBreakdown || undefined,
          referenceQuestionId: sectionConfig.referenceQuestionId,
        }

        for await (const q of generateExamQuestions(generatorConfig, modelId)) {
          // Check cancellation mid-section
          const checkJob = await (db as any).generateJob.findUnique({ where: { id: jobId } })
          if (!checkJob || checkJob.status === 'FAILED') break

          try {
            await (db as any).question.create({
              data: {
                sessionId,
                sectionId: sectionConfig.sectionId,
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
                questionType: sec.questionType,
                marks: sec.marksPerQuestion,
              },
            })
            progress++
            await (db as any).generateJob.update({ where: { id: jobId }, data: { progress } })
          } catch {}
        }
      }

      // Only mark as DONE if not cancelled
      const finalJob = await (db as any).generateJob.findUnique({ where: { id: jobId } })
      if (finalJob && finalJob.status === 'RUNNING') {
        await (db as any).generateJob.update({ where: { id: jobId }, data: { status: 'DONE', progress } })
      }
    } catch (e) {
      await (db as any).generateJob
        .update({ where: { id: jobId }, data: { status: 'FAILED', error: String(e) } })
        .catch(() => {})
    }
  })()

  return NextResponse.json({ ok: true, jobId: params.jobId })
}
