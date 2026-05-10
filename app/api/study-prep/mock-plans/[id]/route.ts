import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authorizeAsset } from '@/app/api/study-prep/_helpers'
import { z } from 'zod'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await authorizeAsset('mockExamPlan', params.id)
  if ('error' in guard) return guard.error
  return NextResponse.json(guard.asset)
}

const patch = z.object({
  title: z.string().min(1).optional(),
  content: z.string().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
  structured: z.any().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await authorizeAsset('mockExamPlan', params.id)
  if ('error' in guard) return guard.error
  let body: z.infer<typeof patch>
  try { body = patch.parse(await req.json()) } catch (e) { return NextResponse.json({ error: String(e) }, { status: 400 }) }
  const updated = await db.mockExamPlan.update({
    where: { id: params.id },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.content !== undefined ? { content: body.content } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.structured !== undefined ? { structured: body.structured } : {}),
    },
  })
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await authorizeAsset('mockExamPlan', params.id)
  if ('error' in guard) return guard.error
  await db.mockExamPlan.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
