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

// Helper: filter docs relevant to a section config (topic/section-aware)
function getRelevantDocs(allDocs: any[], sectionConfig: any, sec: any): any[] {
  const selectedTopicIds: string[] = sectionConfig.selectedTopicIds || []
  const selectedSectionId: string = sectionConfig.sectionId

  if (selectedTopicIds.length === 0) {
    return allDocs.filter((d: any) => {
      const hasTopicTag = d.topicId || (d.topicIds && d.topicIds !== '[]')
      const hasSectionTag = d.sectionId === selectedSectionId ||
        (d.sectionIds && (() => { try { return JSON.parse(d.sectionIds || '[]').includes(selectedSectionId) } catch { return false } })())
      return !hasTopicTag || hasSectionTag
    })
  }

  return allDocs.filter((d: any) => {
    const docTopicIds: string[] = d.topicIds
      ? (() => { try { return JSON.parse(d.topicIds) } catch { return d.topicId ? [d.topicId] : [] } })()
      : (d.topicId ? [d.topicId] : [])

    // Untagged docs (no topic) are always included as general context
    if (docTopicIds.length === 0) return true

    // Include if at least one selected topic matches
    return docTopicIds.some((id: string) => selectedTopicIds.includes(id))
  })
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
  const { sectionConfigs, extraInstructions, modelId, language } = config

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

      // Fetch ALL docs (context scoping happens per-section)
      const allDocs = await (db as any).document.findMany({
        where: { sessionId },
        orderBy: { uploadedAt: 'asc' },
      }) as any[]

      // Get section details
      const sectionIds = sectionConfigs.map((s: any) => s.sectionId)
      const sections = await (db as any).examSection.findMany({ where: { id: { in: sectionIds } } })

      // Load all parsed sample questions for this session once
      const allParsedQuestions = await (db as any).parsedQuestion.findMany({
        where: { sessionId },
        orderBy: { sortOrder: 'asc' },
      }) as any[]

      let progress = 0

      for (const sectionConfig of sectionConfigs) {
        // Check if job was cancelled between sections
        const currentJob = await (db as any).generateJob.findUnique({ where: { id: jobId } })
        if (!currentJob || currentJob.status === 'FAILED') break

        const sec = sections.find((s: any) => s.id === sectionConfig.sectionId)
        if (!sec) continue

        // Build sample questions context filtered by selected topics
        const selectedTopics: string[] = sectionConfig.selectedTopicIds && sectionConfig.selectedTopicIds.length > 0
          ? sectionConfig.selectedTopicIds
          : []
        const selectedTopicNames: string[] = sectionConfig.selectedTopicNames || []

        // Filter sample questions: if specific samples were selected use those;
        // otherwise filter by selected topics matching topicId or topicName
        let filteredSamples: any[] = []
        if (sectionConfig.selectedSampleIds && sectionConfig.selectedSampleIds.length > 0) {
          filteredSamples = allParsedQuestions.filter((q: any) =>
            sectionConfig.selectedSampleIds.includes(q.id)
          )
        } else if (selectedTopics.length > 0 || selectedTopicNames.length > 0) {
          filteredSamples = allParsedQuestions.filter((q: any) => {
            const byId = selectedTopics.length > 0 && q.topicId && selectedTopics.includes(q.topicId)
            const byName = selectedTopicNames.length > 0 && q.topicName &&
              selectedTopicNames.some((n: string) => n.toLowerCase() === q.topicName.toLowerCase())
            return byId || byName
          })
        } else {
          filteredSamples = allParsedQuestions
        }

        const sampleQuestionsFiltered = filteredSamples.length > 0
          ? filteredSamples.slice(0, 20).map((q: any) =>
              `Q: ${q.content}\n${q.answer ? `A: ${q.answer}` : ''}`.trim()
            ).join('\n\n---\n\n')
          : undefined

        // Build per-section scoped docs
        const relevantDocs = getRelevantDocs(allDocs, sectionConfig, sec)
        const relevantDocsByType: Record<string, string[]> = {}
        for (const doc of relevantDocs) {
          const text = doc.isManualInput ? (doc.content || '') : await extractDocumentText(doc.filePath)
          if (!text) continue
          const key = doc.fileType as string
          if (!relevantDocsByType[key]) relevantDocsByType[key] = []
          relevantDocsByType[key].push(`[${doc.fileName}]\n${text}`)
        }
        const joinScopedContent = (key: string) => (relevantDocsByType[key] || []).join('\n\n---\n\n').slice(0, 20000)

        const generatorConfig = {
          sectionName: sec.name,
          questionType: sec.questionType,
          marksPerQuestion: sec.marksPerQuestion,
          count: sectionConfig.count || sec.questionsInBank || 2,
          topics: sec.topics || undefined,
          sectionInstructions: sec.instructions || undefined,
          aiInstructions: sec.aiInstructions || undefined,
          extraInstructions: extraInstructions || undefined,
          customInstructions: sectionConfig.customInstructions || undefined,
          overallTopic,
          syllabus: joinScopedContent('SYLLABUS'),
          regulations: joinScopedContent('TAX_REGULATIONS'),
          studyMaterial: joinScopedContent('STUDY_MATERIAL'),
          sampleQuestions: joinScopedContent('SAMPLE_QUESTIONS'),
          sampleQuestionsFiltered,
          ratesTariff: joinScopedContent('RATES_TARIFF'),
          otherContext: joinScopedContent('OTHER') + sessionVarsText,
          // New per-generation fields
          selectedTopics: selectedTopicNames.length > 0 ? selectedTopicNames : undefined,
          selectedQuestionTypes: sectionConfig.selectedQuestionTypes || undefined,
          syllabusCode: sectionConfig.syllabusCode || undefined,
          issues: sectionConfig.issues || undefined,
          difficultyLevel: sectionConfig.difficultyLevel || 'STANDARD',
          language: language || 'ENG',
          calculationMarks: sectionConfig.calculationMarks || 0,
          // Legacy fallback
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
