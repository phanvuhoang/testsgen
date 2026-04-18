import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import * as XLSX from 'xlsx'

// GET /api/quiz-sets/[id]/questions/export?format=testmoz|csv
// Exports quiz questions in TestMoz Excel format (default) or CSV
//
// TestMoz MCQ Excel format:
//   Question row: col A = question text, col B = points, col C = "shuffle", col D = explanation
//   Answer rows:  col A = "*" if correct else empty, col B = answer text
//   Questions separated by blank row

function buildTestMozWorkbook(
  questions: {
    stem: string
    questionType: string
    options: string[] | null
    correctAnswer: string | null
    explanation: string | null
    points: number
  }[],
  title: string
): XLSX.WorkBook {
  const rows: (string | number | null)[][] = []

  for (const q of questions) {
    const opts = (q.options ?? []) as string[]
    const correct = q.correctAnswer ?? ''
    const explanation = q.explanation ?? null

    if (q.questionType === 'SHORT_ANSWER') {
      // TestMoz short answer: col C = "short"
      rows.push([q.stem, q.points, 'short', explanation])
      rows.push(['*', correct, null, null])
    } else if (q.questionType === 'TRUE_FALSE') {
      rows.push([q.stem, q.points, 'shuffle', explanation])
      const trueAnswer = ['true', 'đúng'].includes((correct ?? '').toLowerCase())
      rows.push([trueAnswer ? '*' : null, 'True', null, null])
      rows.push([!trueAnswer ? '*' : null, 'False', null, null])
    } else {
      // MCQ
      rows.push([q.stem, q.points, 'shuffle', explanation])
      for (const opt of opts) {
        const isCorrect = opt.toLowerCase().trim() === correct.toLowerCase().trim()
        rows.push([isCorrect ? '*' : null, opt, null, null])
      }
    }

    // Blank separator row
    rows.push([null, null, null, null])
  }

  // Add END marker
  rows.push(['END', null, null, null])

  const ws = XLSX.utils.aoa_to_sheet(rows)

  // Set column widths
  ws['!cols'] = [
    { wch: 80 }, // A: question/answer text
    { wch: 12 }, // B: points / answer
    { wch: 12 }, // C: options
    { wch: 60 }, // D: explanation
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Testmoz Output')
  return wb
}

function buildCsv(
  questions: {
    stem: string
    questionType: string
    options: string[] | null
    correctAnswer: string | null
    explanation: string | null
    difficulty: string
    points: number
  }[]
): string {
  const header =
    'stem,questionType,option_a,option_b,option_c,option_d,correctAnswer,explanation,difficulty,points'

  const rows = questions.map((q) => {
    const opts = (q.options ?? []) as string[]
    const cols = [
      csvEscape(q.stem),
      csvEscape(q.questionType),
      csvEscape(opts[0] ?? ''),
      csvEscape(opts[1] ?? ''),
      csvEscape(opts[2] ?? ''),
      csvEscape(opts[3] ?? ''),
      csvEscape(q.correctAnswer ?? ''),
      csvEscape(q.explanation ?? ''),
      csvEscape(q.difficulty),
      String(q.points),
    ]
    return cols.join(',')
  })

  return [header, ...rows].join('\n')
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const where =
    session.user.role === 'ADMIN'
      ? { id: params.id }
      : { id: params.id, createdById: session.user.id }

  const quizSet = await db.quizSet.findFirst({
    where,
    include: { questions: { orderBy: { createdAt: 'asc' } } },
  })

  if (!quizSet) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const format = req.nextUrl.searchParams.get('format') ?? 'testmoz'
  const safeName = quizSet.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()

  if (format === 'csv') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const csv = buildCsv(quizSet.questions as any)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safeName}_questions.csv"`,
      },
    })
  }

  // Default: TestMoz Excel
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wb = buildTestMozWorkbook(quizSet.questions as any, quizSet.title)
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${safeName}_testmoz.xlsx"`,
    },
  })
}
