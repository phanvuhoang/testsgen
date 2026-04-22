import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const dbAny = db as any

export async function PATCH(req: NextRequest, { params }: { params: { id: string; topicId: string } }) {
  const body = await req.json()
  if (body.isOverall) {
    await dbAny.topic.updateMany({
      where: { sessionId: params.id, isOverall: true, id: { not: params.topicId } },
      data: { isOverall: false }
    })
  }
  const topic = await dbAny.topic.update({
    where: { id: params.topicId },
    data: {
      name: body.name !== undefined ? body.name : undefined,
      description: body.description !== undefined ? body.description : undefined,
      sortOrder: body.sortOrder !== undefined ? body.sortOrder : undefined,
      isOverall: body.isOverall !== undefined ? body.isOverall : undefined,
      parentId: body.parentId !== undefined ? body.parentId : undefined,
    },
    include: { children: true }
  })
  return NextResponse.json(topic)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; topicId: string } }) {
  await dbAny.topic.delete({ where: { id: params.topicId } })
  return NextResponse.json({ ok: true })
}
