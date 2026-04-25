import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { parseModelId, callAI, parseJSONFromResponse } from '@/lib/ai'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const { ids, modelId } = body as { ids: string[]; modelId: string }
  if (!ids?.length) return NextResponse.json({ error: 'No IDs provided' }, { status: 400 })

  const { provider, model } = parseModelId(modelId || 'claudible:1')

  const questions = await (db as any).parsedQuestion.findMany({
    where: { id: { in: ids }, sessionId: params.id },
  })

  const results: any[] = []

  for (const q of questions) {
    const prompt = `You are an expert tax exam question analyst. Analyze this sample exam question and:
1. Identify the syllabus codes referenced (e.g. C2d, C2n, A1, B3 – short alpha-numeric codes from tax syllabus). List them comma-separated.
2. Identify the tax issues tested (e.g. "late filing penalty", "PIT progressive rates", "VAT deductibility"). List them comma-separated.
3. Determine the correct questionType from: MCQ_SINGLE, MCQ_MULTIPLE, FILL_BLANK, SHORT_ANSWER, ESSAY, SCENARIO, CASE_STUDY, OTHER
4. Reformat the content as clean HTML. Preserve tables using <table><tr><th>/<td> tags. Use <p> for paragraphs, <strong> for bold, <ol>/<ul> for lists. Do NOT wrap in <html> or <body> tags.
5. Reformat the answer/marking scheme as clean HTML with working tables. Use <table> for mark allocation tables.

Return ONLY valid JSON (no markdown code blocks):
{
  "syllabusCode": "C2d, C2n",
  "issues": "late filing penalty, PIT progressive rates",
  "questionType": "SCENARIO",
  "content": "<p>HTML formatted question...</p>",
  "answer": "<p>HTML formatted answer...</p><table>...</table>"
}

QUESTION CONTENT:
${q.content}

CURRENT ANSWER:
${q.answer || '(none)'}

CURRENT TYPE: ${q.questionType}`

    try {
      const text = await callAI(provider, model, prompt)
      const parsed = parseJSONFromResponse(text)
      const result = parsed[0] as Record<string, string> | undefined
      if (!result) continue

      const syllabusField = [
        result['syllabusCode'] || '',
        result['issues'] ? `Issues: ${result['issues']}` : '',
      ].filter(Boolean).join(' | ')

      const updated = await (db as any).parsedQuestion.update({
        where: { id: q.id },
        data: {
          syllabusCode: syllabusField || q.syllabusCode,
          questionType: result['questionType'] || q.questionType,
          content: result['content'] || q.content,
          answer: result['answer'] || q.answer,
        },
      })
      results.push(updated)
    } catch {
      // Skip failed questions silently
    }
  }

  return NextResponse.json(results)
}
