import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/sessions/{id}/copy
// Body: { targetSessionId: string }
// Copies all sections from source session into target session
// (documents are not copied — they are large files; topics are copied)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const { targetSessionId, copyDocuments = false, copySections = true, copyTopics = true } = body

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
        const sourceTopics = await (db as any).topic.findMany({ where: { sessionId: params.id }, orderBy: { sortOrder: 'asc' } })
        for (const t of sourceTopics) {
          await (db as any).topic.create({
            data: { sessionId: targetSessionId, name: t.name, description: t.description, sortOrder: t.sortOrder }
          })
          results.topics++
        }
      } catch {}
    }

    return NextResponse.json({ ok: true, copied: results })
  } catch (e) {
    console.error('[copy session]', e)
    return NextResponse.json({ error: 'Failed to copy session' }, { status: 500 })
  }
}
