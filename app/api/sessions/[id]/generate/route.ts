import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { generateExamQuestions } from '@/lib/ai'
import { readFile } from 'fs/promises'
import { join } from 'path'

// Extract text from uploaded document
async function extractDocumentText(filePath: string): Promise<string> {
  try {
    const fullPath = join(process.cwd(), 'public', filePath)
    const buffer = await readFile(fullPath)
    
    if (filePath.endsWith('.txt')) {
      return buffer.toString('utf-8').slice(0, 50000)
    }
    
    // For PDF: use pdf-parse
    if (filePath.endsWith('.pdf')) {
      const pdfParse = require('pdf-parse')
      const data = await pdfParse(buffer)
      return data.text.slice(0, 50000)
    }
    
    // For other files, return raw text
    return buffer.toString('utf-8').slice(0, 50000)
  } catch {
    return ''
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { sections: sectionConfigs, extraInstructions } = body

  if (!sectionConfigs || sectionConfigs.length === 0) {
    return NextResponse.json({ error: 'No sections selected' }, { status: 400 })
  }

  // Get session documents for context
  const docs = await db.document.findMany({ where: { sessionId: params.id } })
  let documentContent = ''
  for (const doc of docs.slice(0, 3)) {
    const text = await extractDocumentText(doc.filePath)
    documentContent += `\n--- ${doc.fileName} ---\n${text}\n`
  }

  // Get section details
  const sectionIds = sectionConfigs.map((s: { sectionId: string }) => s.sectionId)
  const sections = await db.examSection.findMany({ where: { id: { in: sectionIds } } })

  const encoder = new TextEncoder()
  const stream = new TransformStream()
  const writer = stream.writable.getWriter()

  ;(async () => {
    try {
      for (const sectionConfig of sectionConfigs) {
        const sec = sections.find((s) => s.id === sectionConfig.sectionId)
        if (!sec) continue

        const generatorConfig = {
          sectionName: sec.name,
          questionType: sec.questionType,
          marksPerQuestion: sec.marksPerQuestion,
          count: sectionConfig.count || sec.questionsInBank,
          topics: sec.topics || undefined,
          sectionInstructions: sec.instructions || undefined,
          aiInstructions: sec.aiInstructions || undefined,
          extraInstructions: extraInstructions || undefined,
          documentContent: documentContent.slice(0, 30000),
        }

        for await (const q of generateExamQuestions(generatorConfig)) {
          // Save to DB
          try {
            const saved = await db.question.create({
              data: {
                sessionId: params.id,
                sectionId: sectionConfig.sectionId,
                stem: String(q.stem || ''),
                options: q.options as any,
                correctAnswer: String(q.correctAnswer || ''),
                markingScheme: String(q.markingScheme || ''),
                modelAnswer: String(q.modelAnswer || ''),
                topic: String(q.topic || ''),
                difficulty: (String(q.difficulty || 'MEDIUM')).toUpperCase() as 'EASY' | 'MEDIUM' | 'HARD',
                status: 'NEEDS_REVIEW',
                questionType: sec.questionType,
                marks: sec.marksPerQuestion,
              },
            })
            await writer.write(encoder.encode(`data: ${JSON.stringify({ ...q, id: saved.id })}\n\n`))
          } catch {
            await writer.write(encoder.encode(`data: ${JSON.stringify(q)}\n\n`))
          }
        }
      }
      await writer.write(encoder.encode('data: [DONE]\n\n'))
    } catch (e) {
      await writer.write(encoder.encode(`data: ${JSON.stringify({ error: String(e) })}\n\n`))
    } finally {
      await writer.close()
    }
  })()

  return new NextResponse(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
