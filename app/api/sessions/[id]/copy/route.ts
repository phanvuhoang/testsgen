import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/sessions/{id}/copy
// Body: { targetSessionId: string }
// Copies all sections from source session into target session
// (documents are not copied — they are large files; topics are copied)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const { targetSessionId, copyDocTypes, copySections = true, copyTopics = true, copySamples = false, copyVariables = false, copyQuestionBank = false } = body

    if (!targetSessionId) {
      return NextResponse.json({ error: 'targetSessionId required' }, { status: 400 })
    }

    // Verify source session exists
    const sourceSession = await db.session.findUnique({
      where: { id: params.id },
      include: {
        sections: { orderBy: { sortOrder: 'asc' } },
        documents: true,
      },
    })
    if (!sourceSession) return NextResponse.json({ error: 'Source session not found' }, { status: 404 })

    // Verify target session exists
    const targetSession = await db.session.findUnique({ where: { id: targetSessionId } })
    if (!targetSession) return NextResponse.json({ error: 'Target session not found' }, { status: 404 })

    const results: { sections: number; documents: number; topics: number; samples: number; variables: number; questions: number } = { sections: 0, documents: 0, topics: 0, samples: 0, variables: 0, questions: 0 }

    // Copy sections
    if (copySections && sourceSession.sections.length > 0) {
      for (const sec of sourceSession.sections) {
        await (db as any).examSection.create({
          data: {
            sessionId: targetSessionId,
            name: sec.name,
            instructions: sec.instructions,
            questionType: sec.questionType,
            marksPerQuestion: sec.marksPerQuestion,
            questionsInExam: sec.questionsInExam,
            questionsInBank: sec.questionsInBank,
            topics: sec.topics,
            aiInstructions: sec.aiInstructions,
            sortOrder: sec.sortOrder,
            questionTypes: (sec as any).questionTypes ?? null,
            topicBreakdown: (sec as any).topicBreakdown ?? null,
          },
        })
        results.sections++
      }
    }

    // Copy topics (if model exists — try/catch in case model not yet available)
    if (copyTopics) {
      try {
        const sourceTopics = await (db as any).topic.findMany({
          where: { sessionId: params.id },
          orderBy: [{ isOverall: 'desc' }, { parentId: 'asc' }, { sortOrder: 'asc' }],
        })
        // First pass: create root topics and overall topic (no parentId)
        const idMap: Record<string, string> = {}
        for (const t of sourceTopics.filter((t: any) => !t.parentId)) {
          const created = await (db as any).topic.create({
            data: {
              sessionId: targetSessionId,
              name: t.name,
              description: t.description,
              sortOrder: t.sortOrder,
              isOverall: t.isOverall ?? false,
              parentId: null,
            }
          })
          idMap[t.id] = created.id
          results.topics++
        }
        // Second pass: create child topics
        for (const t of sourceTopics.filter((t: any) => !!t.parentId)) {
          const newParentId = idMap[t.parentId] ?? null
          const created = await (db as any).topic.create({
            data: {
              sessionId: targetSessionId,
              name: t.name,
              description: t.description,
              sortOrder: t.sortOrder,
              isOverall: false,
              parentId: newParentId,
            }
          })
          idMap[t.id] = created.id
          results.topics++
        }
      } catch {}
    }

    // Copy documents by type
    if (copyDocTypes && copyDocTypes.length > 0) {
      try {
        const sourceDocs = await db.document.findMany({
          where: { sessionId: params.id, fileType: { in: copyDocTypes as any[] } }
        })
        for (const doc of sourceDocs) {
          await (db as any).document.create({
            data: {
              sessionId: targetSessionId,
              fileName: doc.fileName,
              fileType: doc.fileType,
              fileSize: doc.fileSize,
              filePath: doc.filePath, // shared file path (no re-upload)
              description: (doc as any).description ?? null,
              topicId: null, // topics in target may differ
              topicName: (doc as any).topicName ?? null,
              sectionId: null,
              sectionName: (doc as any).sectionName ?? null,
              isManualInput: (doc as any).isManualInput ?? false,
              content: (doc as any).content ?? null,
            }
          })
          results.documents++
        }
      } catch {}
    }

    // Copy processed samples (ParsedQuestion)
    if (copySamples) {
      try {
        const sourceSamples = await (db as any).parsedQuestion.findMany({ where: { sessionId: params.id } })
        for (const s of sourceSamples) {
          await (db as any).parsedQuestion.create({
            data: {
              sessionId: targetSessionId,
              documentId: null,
              title: s.title,
              content: s.content,
              answer: s.answer,
              questionType: s.questionType,
              topicId: null,
              topicName: s.topicName,
              sectionId: null,
              sectionName: s.sectionName,
              syllabusCode: s.syllabusCode,
              difficulty: s.difficulty,
              sortOrder: s.sortOrder,
              isManual: s.isManual,
            },
          })
          results.samples++
        }
      } catch {}
    }

    // Copy session variables
    if (copyVariables) {
      try {
        const sourceVars = await (db as any).sessionVariable.findMany({ where: { sessionId: params.id } })
        for (const v of sourceVars) {
          await (db as any).sessionVariable.create({
            data: {
              sessionId: targetSessionId,
              varKey: v.varKey,
              varLabel: v.varLabel,
              varValue: v.varValue,
              varUnit: v.varUnit,
              description: v.description,
            },
          })
          results.variables++
        }
      } catch {}
    }

    // Copy question bank (sections must be copied first for sectionId mapping)
    if (copyQuestionBank) {
      try {
        const sourceQuestions = await db.question.findMany({ where: { sessionId: params.id } })
        // Build section name map to find matching target sections
        const targetSections = await (db as any).examSection.findMany({ where: { sessionId: targetSessionId } })
        const secNameMap: Record<string, string> = {}
        for (const ts of targetSections) secNameMap[ts.name] = ts.id

        for (const q of sourceQuestions) {
          const srcSec = sourceSession.sections.find((s: any) => s.id === q.sectionId)
          const targetSecId = srcSec ? (secNameMap[srcSec.name] || null) : null
          if (!targetSecId) continue
          await db.question.create({
            data: {
              sessionId: targetSessionId,
              sectionId: targetSecId,
              stem: q.stem,
              options: q.options as any,
              correctAnswer: q.correctAnswer,
              markingScheme: q.markingScheme,
              modelAnswer: q.modelAnswer,
              topic: q.topic,
              difficulty: q.difficulty,
              status: q.status,
              questionType: q.questionType,
              marks: q.marks,
              syllabusCode: q.syllabusCode,
              regulationRefs: q.regulationRefs,
            },
          })
          results.questions++
        }
      } catch {}
    }

    return NextResponse.json({ ok: true, copied: results })
  } catch (e) {
    console.error('[copy session]', e)
    return NextResponse.json({ error: 'Failed to copy session' }, { status: 500 })
  }
}
