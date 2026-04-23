import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateExamQuestions } from '@/lib/ai'
import { readFile } from 'fs/promises'
import { join } from 'path'

// ── Context budget constants ──────────────────────────────────────────────────
const MAX_PER_FILE_CHARS = 150_000

const JOIN_CAPS: Record<string, number> = {
  TAX_REGULATIONS:  100_000,
  SAMPLE_QUESTIONS:  40_000,
  SYLLABUS:          30_000,
  RATES_TARIFF:      15_000,
  STUDY_MATERIAL:    15_000,
  OTHER:             10_000,
}

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

// Helper: filter docs relevant to a section config (topic/section-aware)
function getRelevantDocs(allDocs: any[], sectionConfig: any, sec: any): any[] {
  const selectedTopicIds: string[] = sectionConfig.selectedTopicIds || []
  const selectedSectionId: string = sectionConfig.sectionId

  const parseDocSectionIds = (d: any): string[] => {
    if (d.sectionIds) {
      try { return JSON.parse(d.sectionIds) } catch {}
    }
    return d.sectionId ? [d.sectionId] : []
  }

  const matchesSection = (d: any): boolean => {
    const docSectionIds = parseDocSectionIds(d)
    if (docSectionIds.length === 0) return true
    return docSectionIds.includes(selectedSectionId)
  }

  if (selectedTopicIds.length === 0) {
    return allDocs.filter((d: any) => {
      const hasTopicTag = d.topicId || (d.topicIds && d.topicIds !== '[]')
      return !hasTopicTag || matchesSection(d)
    })
  }

  return allDocs.filter((d: any) => {
    const docTopicIds: string[] = d.topicIds
      ? (() => { try { return JSON.parse(d.topicIds) } catch { return d.topicId ? [d.topicId] : [] } })()
      : (d.topicId ? [d.topicId] : [])

    if (docTopicIds.length === 0) return true

    if (!docTopicIds.some((id: string) => selectedTopicIds.includes(id))) return false

    return matchesSection(d)
  })
}

export async function POST(_req: NextRequest, { params }: { params: { id: string; jobId: string } }) {
  let job = null
  for (let attempt = 0; attempt < 5; attempt++) {
    job = await (db as any).generateJob.findUnique({ where: { id: params.jobId } })
    if (job) break
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  if (!job || (job.status !== 'PENDING' && job.status !== 'RUNNING')) {
    return NextResponse.json({ error: 'Job not found or already processed' }, { status: 400 })
  }

  // Update to RUNNING immediately
  await (db as any).generateJob.update({ where: { id: params.jobId }, data: { status: 'RUNNING' } })

  // Parse config
  const config = JSON.parse(job.config)
  const { sectionConfigs, extraInstructions, modelId, language, assumedDate } = config

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
      const minMarkPerPoint: number = (sessionData as any)?.minMarkPerPoint ?? 0.5

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
        const joinScopedContent = (key: string) => {
          const cap = JOIN_CAPS[key] ?? 10_000
          return (relevantDocsByType[key] || []).join('\n\n---\n\n').slice(0, cap)
        }

        const sourceDocuments = {
          regulations: relevantDocs.filter((d: any) => d.fileType === 'TAX_REGULATIONS').map((d: any) => d.fileName),
          syllabus:    relevantDocs.filter((d: any) => d.fileType === 'SYLLABUS').map((d: any) => d.fileName),
          samples:     relevantDocs.filter((d: any) => d.fileType === 'SAMPLE_QUESTIONS').map((d: any) => d.fileName),
          rates:       relevantDocs.filter((d: any) => d.fileType === 'RATES_TARIFF').map((d: any) => d.fileName),
        }

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
          sourceDocuments,
          minMarkPerPoint,
          assumedDate: assumedDate || undefined,
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
                markingScheme: String(q.markingScheme || ''),
                modelAnswer: [
                  q.modelAnswer,
                  q.reference && `<p class="text-xs text-gray-500 mt-2"><strong>Ref:</strong> ${q.reference}</p>`,
                ].filter(Boolean).join('\n'),
                topic: String(q.topic || ''),
                difficulty: (String(q.difficulty || 'MEDIUM')).toUpperCase() as any,
                status: 'NEEDS_REVIEW',
                questionType: sec.questionType,
                marks: sec.marksPerQuestion,
                // New fields from examsgen-style output
                optionExplanations: q.optionExplanations ? q.optionExplanations as any : undefined,
                syllabusCode: q.syllabusCode ? String(q.syllabusCode) : undefined,
                regulationRefs: (() => {
                  const refParts: string[] = []
                  if (q.reference) refParts.push(String(q.reference))
                  else if (q.regulationRefs) refParts.push(String(q.regulationRefs))
                  if (q.sampleRef) refParts.push(`Sample ref: ${String(q.sampleRef)}`)
                  return refParts.length > 0 ? refParts.join(' | ') : undefined
                })(),
                generatedBy: modelId || 'deepseek:deepseek-reasoner',
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
