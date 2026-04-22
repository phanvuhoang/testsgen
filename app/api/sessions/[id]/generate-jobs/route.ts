import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const active = req.nextUrl.searchParams.get('active')
  const where: any = { sessionId: params.id }
  if (active) where.status = { in: ['PENDING', 'RUNNING'] }
  const jobs = await (db as any).generateJob.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: active ? 1 : 10,
  })
  return NextResponse.json(jobs)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const { sectionConfigs, extraInstructions, modelId } = body
  const total = sectionConfigs.reduce((s: number, c: any) => s + (c.count || 20), 0)
  const job = await (db as any).generateJob.create({
    data: {
      sessionId: params.id,
      status: 'PENDING',
      config: JSON.stringify({ sectionConfigs, extraInstructions, modelId }),
      progress: 0,
      total,
    },
  })
  return NextResponse.json(job)
}
