import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const dbAny = db as any

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const topics = await dbAny.topic.findMany({
    where: { sessionId: params.id },
    orderBy: { sortOrder: 'asc' },
  })
  return NextResponse.json(topics)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const topic = await dbAny.topic.create({
    data: {
      sessionId: params.id,
      name: body.name,
      description: body.description ?? null,
      sortOrder: body.sortOrder ?? 0,
    },
  })
  return NextResponse.json(topic)
}
