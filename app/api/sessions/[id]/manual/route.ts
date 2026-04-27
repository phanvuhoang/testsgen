import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { parseModelId, callAI, parseJSONFromResponse } from '@/lib/ai'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const { action, caseText, sampleContents, sectionId, modelId, topicName, regenNumbers, updateYear, updateRegulations, mix } = body

  if (!action) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Require either caseText or at least one sampleContent
  const hasCaseText = typeof caseText === 'string' && caseText.trim()
  const hasSamples = Array.isArray(sampleContents) && sampleContents.length > 0
  if (!hasCaseText && !hasSamples) {
    return NextResponse.json({ error: 'Missing case text or sample contents' }, { status: 400 })
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
      ? `\nAPPLY THESE TRANSFORMATIONS:\n${optionLines.join('\n')}\n`
      : ''

    let prompt: string

    if (hasSamples && mix && (sampleContents as string[]).length >= 2) {
      // MIX MODE: combine multiple sample cases into one new scenario
      const samplesBlock = (sampleContents as string[])
        .map((c, i) => `--- SAMPLE ${i + 1} ---\n${c.trim()}`)
        .join('\n\n')

      prompt = `You are an expert tax exam question writer.
You are given ${(sampleContents as string[]).length} sample case scenarios. Your task is to CREATIVELY MIX and COMBINE the factual data, entity types, transaction types, and tax issues from these samples into ONE new, coherent case scenario. Then write a question and full model answer based on the new mixed case.

Do NOT simply concatenate the samples — weave their elements together into a single realistic narrative that tests the combined tax concepts.
${optionsSection}
Return ONLY valid JSON (no markdown):
{
  "questionPrompt": "Question: ...",
  "modelAnswer": "<p>...</p> or HTML table with step-by-step working"
}

SECTION TYPE: ${section?.questionType || 'SCENARIO'}
TOPIC: ${topicName || 'Tax'}

${samplesBlock}
${hasCaseText ? `\nADDITIONAL CONTEXT / INSTRUCTIONS FROM USER:\n${caseText}` : ''}
`
    } else {
      // SINGLE or no-mix mode: use caseText (or first sample if no caseText)
      const effectiveCaseText = hasCaseText ? caseText : (sampleContents as string[])[0]

      prompt = `You are an expert tax exam question writer.
Given the following case scenario, write one question that tests understanding of the tax issues, and provide a full model answer.
${optionsSection}
Return ONLY valid JSON in this format (no markdown):
{
  "questionPrompt": "Question: ...",
  "modelAnswer": "<p>...</p> or HTML table with step-by-step working"
}

CASE SCENARIO:
${effectiveCaseText}

SECTION TYPE: ${section?.questionType || 'SCENARIO'}
TOPIC: ${topicName || 'Tax'}
`
    }

    const text = await callAI(provider, model, prompt)
    const parsed = parseJSONFromResponse(text)
    return NextResponse.json({ result: parsed[0] || { questionPrompt: text, modelAnswer: null } })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
