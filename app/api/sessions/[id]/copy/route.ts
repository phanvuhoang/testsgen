import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/sessions/{id}/copy
// Body: { targetSessionId: string }
// Copies all sections from source session into target session
// (documents are not copied — they are large files; topics are copied)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const { targetSessionId, copyDocTypes, copySections = true, copyTopics = true } = body

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

    const results: { sections: number; documents: number; topics: number } = { sections: 0, documents: 0, topics: 0 }

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

    return NextResponse.json({ ok: true, copied: results })
  } catch (e) {
    console.error('[copy session]', e)
    return NextResponse.json({ error: 'Failed to copy session' }, { status: 500 })
  }
}
