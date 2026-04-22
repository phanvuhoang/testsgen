import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: { id: string; varId: string } }) {
  const body = await req.json()
  const v = await (db as any).sessionVariable.update({
    where: { id: params.varId },
    data: { varLabel: body.varLabel, varValue: body.varValue, varUnit: body.varUnit, description: body.description }
  })
  return NextResponse.json(v)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; varId: string } }) {
  await (db as any).sessionVariable.delete({ where: { id: params.varId } })
  return NextResponse.json({ ok: true })
}
