import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authorizePrepSet } from '@/app/api/study-prep/_helpers'
import { buildStudyPrepContext, hasUsableSources } from '@/lib/ai/study-prep-sources'
import { runStudyPrepGeneration } from '@/lib/ai/study-prep-runner'

export const maxDuration = 300

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await authorizePrepSet(params.id)
  if ('error' in guard) return guard.error

  const body = await req.json().catch(() => ({} as any))
  const ctx = await buildStudyPrepContext({
    prepSetId: params.id,
    includeDocumentIds: body.documentIds,
    includeQuizDocumentIds: body.quizDocumentIds,
    includeQuestionIds: body.questionIds,
    includeQuizQuestionIds: body.quizQuestionIds,
    includeParsedQuestions: body.includeParsedQuestions !== false,
    notes: body.notes,
  })
  if (!ctx) return NextResponse.json({ error: 'Could not load prep set context' }, { status: 500 })

  if (!hasUsableSources(ctx)) {
    return NextResponse.json(
      { error: 'No documents or questions available. Upload sources in Module 1 / Module 2 first.' },
      { status: 400 }
    )
  }

  try {
    const result = await runStudyPrepGeneration('materials', ctx, body.modelId)
    const material = await db.studyMaterial.create({
      data: {
        prepSetId: params.id,
        title: result.title,
        content: result.markdown,
        structured: (result.structured as any) ?? undefined,
        mindmap: result.mindmap ?? null,
        sourceRefs: (result.citedSources as any) ?? undefined,
        generatedBy: result.generatedBy,
      },
    })
    await db.studyPrepSet.update({
      where: { id: params.id },
      data: { updatedAt: new Date() },
    })
    return NextResponse.json(material, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
