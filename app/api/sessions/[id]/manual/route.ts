import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { parseModelId, callAI, parseJSONFromResponse } from '@/lib/ai'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const { action, caseText, sectionId, modelId, topicName } = body

  if (!action || !caseText) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { provider, model } = parseModelId(modelId || 'claudible:1')

  if (action === 'regenNumbers') {
    const prompt = `You are given a tax exam case scenario. Keep ALL structure, facts, and context IDENTICAL.
Only replace the numerical values (amounts, rates, percentages, years, dates) with different but realistic values.
Return ONLY the modified case text. Do not explain, do not add headers.

ORIGINAL CASE:
${caseText}`

    const text = await callAI(provider, model, prompt)
    return NextResponse.json({ result: text.trim() })
  }

  if (action === 'generateQA') {
    const section = sectionId
      ? await (db as any).examSection.findUnique({ where: { id: sectionId } })
      : null

    const prompt = `You are an expert tax exam question writer.
Given the following case scenario, generate:
1. A clear question prompt (starting with "Question:")
2. A full model answer with working

The question should test understanding of the tax issues in the case.
Format the response as JSON:
{
  "questionPrompt": "Question: ...",
  "modelAnswer": "HTML with working tables and step-by-step solution"
}

CASE SCENARIO:
${caseText}

SECTION TYPE: ${section?.questionType || 'SCENARIO'}
TOPIC: ${topicName || 'Tax'}
`
    const text = await callAI(provider, model, prompt)
    const parsed = parseJSONFromResponse(text)
    return NextResponse.json({ result: parsed[0] || { questionPrompt: text, modelAnswer: null } })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
