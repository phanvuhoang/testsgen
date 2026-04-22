import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const jobs = await (db as any).generateJob.findMany({
    where: { sessionId: params.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })
  return NextResponse.json(jobs)
}
