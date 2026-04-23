import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const DEFAULT_VARS = [
  { varKey: 'exchange_rate_usd_vnd', varLabel: 'USD/VND Exchange Rate', varValue: '25450', varUnit: 'VND', description: 'Used in foreign currency calculations' },
  { varKey: 'min_salary_si', varLabel: 'Min Salary (Social Insurance)', varValue: '4960000', varUnit: 'VND/month', description: 'Minimum salary for SI/HI calculation base' },
  { varKey: 'base_year', varLabel: 'Base Year', varValue: new Date().getFullYear().toString(), varUnit: '', description: 'All exam dates fall within this calendar year (1 Jan to 31 Dec)' },
]

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  let vars = await (db as any).sessionVariable.findMany({ where: { sessionId: params.id }, orderBy: { createdAt: 'asc' } })
  // Seed defaults if empty
  if (vars.length === 0) {
    for (const v of DEFAULT_VARS) {
      const created = await (db as any).sessionVariable.create({ data: { ...v, sessionId: params.id } })
      vars.push(created)
    }
  }
  return NextResponse.json(vars)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const v = await (db as any).sessionVariable.create({
    data: { sessionId: params.id, varKey: body.varKey, varLabel: body.varLabel, varValue: body.varValue, varUnit: body.varUnit ?? null, description: body.description ?? null }
  })
  return NextResponse.json(v, { status: 201 })
}
