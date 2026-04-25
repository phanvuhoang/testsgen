import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { parseModelId, callAI, parseJSONFromResponse } from '@/lib/ai'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const { action, caseText, sectionId, modelId, topicName, regenNumbers, updateYear, updateRegulations } = body

  if (!action || !caseText) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { provider, model } = parseModelId(modelId || 'claudible:1')

  if (action === 'generateQA') {
    const [section, sessionVars, regulationDocs] = await Promise.all([
      sectionId ? (db as any).examSection.findUnique({ where: { id: sectionId } }) : null,
      updateYear ? (db as any).sessionVariable.findMany({ where: { sessionId: params.id } }).catch(() => []) : Promise.resolve([]),
      updateRegulations
        ? db.document.findMany({
            where: { sessionId: params.id, fileType: { in: ['TAX_REGULATIONS', 'SYLLABUS', 'STUDY_MATERIAL'] as any[] } },
            select: { fileName: true, description: true } as any,
          }).catch(() => [])
        : Promise.resolve([]),
    ])

    const baseYear = (sessionVars as any[]).find((v: any) => v.varKey === 'base_year' || v.varKey === 'baseYear')?.varValue

    const optionLines: string[] = []
    if (regenNumbers) optionLines.push('- REGENERATE all numerical values (amounts, rates, percentages) with different but realistic values while keeping the same type of scenario and tax issues.')
    if (updateYear && baseYear) optionLines.push(`- UPDATE all years/dates to be consistent with base year ${baseYear} (the tax period should reference ${baseYear}).`)
    if (updateRegulations && (regulationDocs as any[]).length > 0) {
      const docList = (regulationDocs as any[]).map((d: any) => d.fileName).join(', ')
      optionLines.push(`- ENSURE the question and answer reference the current regulations and rules as per uploaded documents: ${docList}.`)
    }

    const optionsSection = optionLines.length > 0
      ? `\nAPPLY THESE TRANSFORMATIONS TO THE CASE AND QUESTION:\n${optionLines.join('\n')}\n`
      : ''

    const prompt = `You are an expert tax exam question writer.
Given the following case scenario, write one question that tests understanding of the tax issues, and provide a full model answer.
${optionsSection}
Return ONLY valid JSON in this format (no markdown):
{
  "questionPrompt": "Question: ...",
  "modelAnswer": "<p>...</p> or HTML table with step-by-step working"
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
