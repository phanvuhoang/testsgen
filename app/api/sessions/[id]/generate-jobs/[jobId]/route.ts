import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: { id: string; jobId: string } }) {
  const job = await (db as any).generateJob.findUnique({ where: { id: params.jobId } })
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(job)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string; jobId: string } }) {
  const body = await req.json()
  try {
    const job = await (db as any).generateJob.update({
      where: { id: params.jobId },
      data: { status: body.status || 'FAILED' },
    })
    return NextResponse.json(job)
  } catch {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }
}
