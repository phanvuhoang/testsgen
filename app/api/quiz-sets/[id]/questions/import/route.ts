import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import * as XLSX from 'xlsx'

// POST /api/quiz-sets/[id]/questions/import
// Accepts multipart/form-data with file field = .xlsx (TestMoz format) or .csv
//
// TestMoz Excel MCQ format (per sheet row):
//   Row with question text in col A  → new question starts
//     col B = points (number) or "~N" for partial credit
//     col C = options like "shuffle"
//     col D = explanation/hint text
//   Answer rows following the question:
//     col A = "*" if correct answer, otherwise empty
//     col B = answer text
// Questions separated by blank rows.

type QuestionRow = {
  stem: string
  questionType: 'MCQ' | 'TRUE_FALSE' | 'SHORT_ANSWER'
  options: string[]
  correctAnswer: string
  explanation: string | null
  difficulty: 'EASY' | 'MEDIUM' | 'HARD'
  points: number
}

function parseTestMozExcel(buffer: Buffer): QuestionRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: false,
  }) as (string | number | null)[][]

  const questions: QuestionRow[] = []
  let i = 0

  while (i < rows.length) {
    const row = rows[i]

    // Skip blank rows
    if (!row || !row[0]) {
      i++
      continue
    }

    const colA = String(row[0] ?? '').trim()
    const colB = row[1]
    const colC = String(row[2] ?? '').trim().toLowerCase()
    const colD = String(row[3] ?? '').trim()

    // Skip special markers: POOL, END, text blocks without answer rows
    if (colA === 'END' || colA === 'POOL') {
      i++
      continue
    }

    // Detect if this is a question row: col A is non-empty AND not "*"
    if (colA && colA !== '*') {
      // Parse points
      let points = 1
      if (colB !== null && colB !== undefined) {
        const bStr = String(colB).trim()
        if (bStr.startsWith('~')) {
          points = parseFloat(bStr.slice(1)) || 1
        } else {
          const n = parseFloat(bStr)
          if (!isNaN(n)) points = n
        }
      }

      // Explanation from col D
      const explanation = colD || null

      // Collect answer rows (following rows where col A is empty or "*")
      const options: string[] = []
      const correctAnswers: string[] = []
      i++

      while (i < rows.length) {
        const aRow = rows[i]
        const aColA = String(aRow?.[0] ?? '').trim()
        const aColB = String(aRow?.[1] ?? '').trim()

        // Blank row = end of this question
        if (!aRow || (!aColA && !aColB)) break

        // If col A is non-empty and not "*", it's the next question
        if (aColA && aColA !== '*') break

        if (aColB) {
          options.push(aColB)
          if (aColA === '*') {
            correctAnswers.push(aColB)
          }
        }
        i++
      }

      if (options.length === 0) {
        // No answer rows — skip (text block, essay, etc.)
        continue
      }

      // Determine question type
      let questionType: 'MCQ' | 'TRUE_FALSE' | 'SHORT_ANSWER' = 'MCQ'
      if (
        options.length === 2 &&
        options.every((o) => ['true', 'false', 'đúng', 'sai'].includes(o.toLowerCase()))
      ) {
        questionType = 'TRUE_FALSE'
      } else if (colC === 'short' || colC === 'long') {
        questionType = 'SHORT_ANSWER'
      }

      const correctAnswer = correctAnswers[0] ?? options[0]

      questions.push({
        stem: colA,
        questionType,
        options,
        correctAnswer,
        explanation,
        difficulty: 'MEDIUM',
        points,
      })
    } else {
      i++
    }
  }

  return questions
}

function parseCsvImport(csvText: string): QuestionRow[] {
  const lines = csvText.trim().split('\n')
  const startIdx =
    lines[0].toLowerCase().includes('stem') || lines[0].toLowerCase().includes('question') ? 1 : 0

  const questions: QuestionRow[] = []

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const cols = parseCSVLine(line)
    const [
      stemText,
      typeRaw,
      optA,
      optB,
      optC,
      optD,
      correctAnswer,
      explanation,
      difficultyRaw,
      pointsStr,
    ] = cols

    if (!stemText || !correctAnswer) continue

    const typeMap: Record<string, 'MCQ' | 'TRUE_FALSE' | 'SHORT_ANSWER'> = {
      mcq: 'MCQ',
      true_false: 'TRUE_FALSE',
      short_answer: 'SHORT_ANSWER',
      short: 'SHORT_ANSWER',
    }
    const questionType = typeMap[(typeRaw ?? 'mcq').toLowerCase().trim()] ?? 'MCQ'

    const difficultyMap: Record<string, 'EASY' | 'MEDIUM' | 'HARD'> = {
      easy: 'EASY',
      medium: 'MEDIUM',
      hard: 'HARD',
    }
    const difficulty = difficultyMap[(difficultyRaw ?? 'medium').toLowerCase().trim()] ?? 'MEDIUM'

    const options: string[] = []
    if (optA) options.push(optA.trim())
    if (optB) options.push(optB.trim())
    if (optC) options.push(optC.trim())
    if (optD) options.push(optD.trim())

    questions.push({
      stem: stemText.trim(),
      questionType,
      options,
      correctAnswer: correctAnswer.trim(),
      explanation: explanation?.trim() || null,
      difficulty,
      points: parseFloat(pointsStr ?? '1') || 1,
    })
  }

  return questions
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)
  return result
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const where =
    session.user.role === 'ADMIN'
      ? { id: params.id }
      : { id: params.id, createdById: session.user.id }

  const quizSet = await db.quizSet.findFirst({ where })
  if (!quizSet) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const contentType = req.headers.get('content-type') ?? ''
  let questions: QuestionRow[] = []

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    const fileName = file.name.toLowerCase()
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      questions = parseTestMozExcel(buffer)
    } else {
      // CSV fallback
      const csvText = buffer.toString('utf-8')
      questions = parseCsvImport(csvText)
    }
  } else {
    const body = await req.json()
    const csvText = body.csv ?? ''
    if (!csvText.trim()) {
      return NextResponse.json({ error: 'Empty data' }, { status: 400 })
    }
    questions = parseCsvImport(csvText)
  }

  if (questions.length === 0) {
    return NextResponse.json({ error: 'No valid questions found in file' }, { status: 400 })
  }

  const created: { id: string }[] = []
  const errors: { row: number; error: string }[] = []

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    try {
      const saved = await db.quizQuestion.create({
        data: {
          quizSetId: params.id,
          stem: q.stem,
          questionType: q.questionType,
          options: q.options as any,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
          difficulty: q.difficulty,
          points: q.points,
        },
      })
      created.push({ id: saved.id })
    } catch (err) {
      errors.push({ row: i + 1, error: String(err) })
    }
  }

  return NextResponse.json({
    imported: created.length,
    errors,
    total: questions.length,
  })
}
