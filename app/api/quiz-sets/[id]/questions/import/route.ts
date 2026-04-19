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
  questionType: 'MCQ' | 'TRUE_FALSE' | 'SHORT_ANSWER' | 'FILL_BLANK' | 'MULTIPLE_RESPONSE' | 'ESSAY' | 'LONG_ANSWER' | 'MATCHING' | 'TEXT_BLOCK'
  options: string[]
  correctAnswer: string
  explanation: string | null
  difficulty: 'EASY' | 'MEDIUM' | 'HARD'
  points: number
  partialCredit: boolean
  topic?: string
  tags?: string
}

function parseTestMozExcel(buffer: Buffer): QuestionRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1, defval: null, raw: false,
  }) as (string | number | null)[][]

  const questions: QuestionRow[] = []
  let i = 0
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let inPool = false

  // Check for HTML flag in row 1
  if (rows[0] && String(rows[0][0] ?? '').trim().toUpperCase() === 'HTML') {
    i = 1
  }

  while (i < rows.length) {
    const row = rows[i]
    const colA = String(row?.[0] ?? '').trim()
    const colB = row?.[1]
    const colC = String(row?.[2] ?? '').trim()
    const colD = String(row?.[3] ?? '').trim()

    // Skip blank rows
    if (!colA && !colB) { i++; continue }

    // POOL marker
    if (colA.toUpperCase() === 'POOL') { inPool = true; i++; continue }

    // END marker — ends pool, continue parsing
    if (colA.toUpperCase() === 'END') { inPool = false; i++; continue }

    // Skip asterisk rows at top level (shouldn't happen but guard)
    if (colA === '*') { i++; continue }

    // Parse points from col B
    let points = 1
    let partialCredit = false
    if (colB !== null && colB !== undefined) {
      const bStr = String(colB).trim()
      if (bStr.startsWith('~')) {
        partialCredit = true
        points = parseFloat(bStr.slice(1)) || 1
      } else {
        const n = parseFloat(bStr)
        if (!isNaN(n)) points = n
      }
    }

    const explanation = colD || null
    const flags = colC.toLowerCase().split(',').map(s => s.trim())
    const stem = colA

    i++ // move to first answer row

    // Collect answer rows
    const answerRows: { colA: string; colB: string; colC: string }[] = []
    while (i < rows.length) {
      const aRow = rows[i]
      const aA = String(aRow?.[0] ?? '').trim()
      const aB = String(aRow?.[1] ?? '').trim()
      const aC = String(aRow?.[2] ?? '').trim()

      // Blank row = end of question
      if (!aA && !aB && !aC) break
      // END or POOL = end of question
      if (aA.toUpperCase() === 'END' || aA.toUpperCase() === 'POOL') break
      // Non-empty col A that's not '*' = next question
      if (aA && aA !== '*') break

      answerRows.push({ colA: aA, colB: aB, colC: aC })
      i++
    }

    // Determine question type
    // Explicit flag overrides
    const hasExplicitOne = flags.includes('one')
    const hasExplicitMany = flags.includes('many')
    const hasShort = flags.includes('short')
    const hasLong = flags.includes('long')
    const isText = flags.includes('text')

    if (isText && answerRows.length === 0) {
      // Text block — import as TEXT_BLOCK
      questions.push({ stem, questionType: 'TEXT_BLOCK', options: [], correctAnswer: '', explanation, difficulty: 'MEDIUM', points, partialCredit })
      continue
    }

    if (hasShort) {
      // Short answer — collect all * rows as accepted variants
      const variants = answerRows.filter(r => r.colA === '*').map(r => r.colB).filter(Boolean)
      questions.push({ stem, questionType: 'SHORT_ANSWER', options: [], correctAnswer: variants.join('||') || '', explanation, difficulty: 'MEDIUM', points, partialCredit })
      continue
    }

    if (hasLong) {
      questions.push({ stem, questionType: 'LONG_ANSWER', options: [], correctAnswer: '', explanation, difficulty: 'MEDIUM', points, partialCredit })
      continue
    }

    // No answer rows + no short/long flag = essay
    if (answerRows.length === 0) {
      questions.push({ stem, questionType: 'ESSAY', options: [], correctAnswer: '', explanation, difficulty: 'MEDIUM', points, partialCredit })
      continue
    }

    // Check if matching: some rows have both colB and colC
    const isMatching = answerRows.some(r => r.colC && r.colB)
    if (isMatching) {
      const opts = answerRows.map(r => `${r.colB}::${r.colC}`)
      const correctOpts = answerRows.filter(r => r.colA === '*').map(r => `${r.colB}::${r.colC}`)
      questions.push({ stem, questionType: 'MATCHING', options: opts, correctAnswer: correctOpts.join('||'), explanation, difficulty: 'MEDIUM', points, partialCredit })
      continue
    }

    const options = answerRows.map(r => r.colB).filter(Boolean)
    const correctRows = answerRows.filter(r => r.colA === '*')
    const correctAnswers = correctRows.map(r => r.colB).filter(Boolean)
    const allCorrect = answerRows.length > 0 && correctRows.length === answerRows.length
    const noneCorrect = correctRows.length === 0
    const someCorrect = correctRows.length > 0 && correctRows.length < answerRows.length

    // True/False detection
    const isTrueFalse = options.length === 2 &&
      options.every(o => ['true', 'false', 'đúng', 'sai', 'yes', 'no'].includes(o.toLowerCase()))

    if (isTrueFalse && !hasExplicitMany) {
      const correct = correctAnswers[0] || options[0]
      questions.push({ stem, questionType: 'TRUE_FALSE', options, correctAnswer: correct, explanation, difficulty: 'MEDIUM', points, partialCredit })
      continue
    }

    // Fill-in-blank: ALL rows have *
    if (allCorrect && !hasExplicitOne && !hasExplicitMany) {
      questions.push({ stem, questionType: 'FILL_BLANK', options, correctAnswer: correctAnswers.join('||'), explanation, difficulty: 'MEDIUM', points, partialCredit })
      continue
    }

    // Choose many: SOME rows have *
    if ((someCorrect || hasExplicitMany) && !hasExplicitOne) {
      questions.push({ stem, questionType: 'MULTIPLE_RESPONSE', options, correctAnswer: correctAnswers.join('||'), explanation, difficulty: 'MEDIUM', points, partialCredit })
      continue
    }

    // Default: MCQ (choose one)
    const correctAnswer = correctAnswers[0] || (noneCorrect ? '' : options[0])
    questions.push({ stem, questionType: 'MCQ', options, correctAnswer, explanation, difficulty: 'MEDIUM', points, partialCredit })
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

    const typeMap: Record<string, QuestionRow['questionType']> = {
      mcq: 'MCQ',
      true_false: 'TRUE_FALSE',
      short_answer: 'SHORT_ANSWER',
      short: 'SHORT_ANSWER',
      fill_blank: 'FILL_BLANK',
      fill_in_blank: 'FILL_BLANK',
      multiple_response: 'MULTIPLE_RESPONSE',
      essay: 'ESSAY',
      long_answer: 'LONG_ANSWER',
      matching: 'MATCHING',
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
      partialCredit: false,
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
          topic: q.topic || null,
          tags: q.tags || null,
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
