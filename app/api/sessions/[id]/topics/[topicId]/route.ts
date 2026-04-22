import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const dbAny = db as any

export async function PATCH(req: NextRequest, { params }: { params: { id: string; topicId: string } }) {
  const body = await req.json()
  const topic = await dbAny.topic.update({
    where: { id: params.topicId },
    data: {
      name: body.name,
      description: body.description ?? null,
      sortOrder: body.sortOrder,
    },
  })
  return NextResponse.json(topic)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; topicId: string } }) {
  await dbAny.topic.delete({ where: { id: params.topicId } })
  return NextResponse.json({ ok: true })
}
