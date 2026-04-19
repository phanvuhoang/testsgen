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
    partialCredit?: boolean
  }[],
  title: string
): XLSX.WorkBook {
  const rows: (string | number | null)[][] = []

  for (const q of questions) {
    const opts = (q.options ?? []) as string[]
    const correct = q.correctAnswer ?? ''
    const explanation = q.explanation ?? null
    const pointsCell = q.partialCredit ? `~${q.points}` : q.points

    if (q.questionType === 'ESSAY' || q.questionType === 'LONG_ANSWER') {
      // Essay: question + points, no answer rows
      rows.push([q.stem, q.points, null, explanation])
    } else if (q.questionType === 'SHORT_ANSWER') {
      // Short answer: col C = "short", correct answers become fill-in-blank style (all marked *)
      rows.push([q.stem, pointsCell, 'short', explanation])
      // Each || variant is a separate accepted answer row
      const variants = correct.split('||').map(s => s.trim()).filter(Boolean)
      for (const v of variants) {
        rows.push(['*', v, null, null])
      }
    } else if (q.questionType === 'FILL_BLANK') {
      // Fill-in-blank: ALL answer rows have *, each variant is a separate accepted answer
      rows.push([q.stem, pointsCell, null, explanation])
      const variants = correct.split('||').map(s => s.trim()).filter(Boolean)
      if (variants.length === 0) variants.push(correct)
      for (const v of variants) {
        rows.push(['*', v, null, null])
      }
    } else if (q.questionType === 'TRUE_FALSE') {
      rows.push([q.stem, pointsCell, 'shuffle', explanation])
      const isTrue = ['true', 'đúng'].includes((correct ?? '').toLowerCase())
      rows.push([isTrue ? '*' : null, 'True', null, null])
      rows.push([!isTrue ? '*' : null, 'False', null, null])
    } else if (q.questionType === 'MULTIPLE_RESPONSE') {
      // Choose many: SOME answers have *
      rows.push([q.stem, pointsCell, 'shuffle', explanation])
      const correctSet = new Set(
        correct.split('||').map(s => s.trim().toLowerCase())
      )
      for (const opt of opts) {
        const isCorrect = correctSet.has(opt.trim().toLowerCase())
        rows.push([isCorrect ? '*' : null, opt, null, null])
      }
    } else if (q.questionType === 'MATCHING') {
      // Matching: clue in col B, answer in col C, both marked *
      rows.push([q.stem, pointsCell, null, explanation])
      // options are stored as "clue::answer" pairs or separate arrays
      // Try to parse options as pairs
      for (const opt of opts) {
        const parts = opt.split('::')
        if (parts.length >= 2) {
          rows.push(['*', parts[0].trim(), parts[1].trim(), null])
        } else {
          rows.push(['*', opt, null, null])
        }
      }
    } else {
      // MCQ (choose one): ONE answer has *
      rows.push([q.stem, pointsCell, 'shuffle', explanation])
      for (const opt of opts) {
        const isCorrect = opt.trim().toLowerCase() === correct.trim().toLowerCase()
        rows.push([isCorrect ? '*' : null, opt, null, null])
      }
    }

    // Blank separator row between questions
    rows.push([null, null, null, null])
  }

  // DO NOT add END row (per user requirement)

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [
    { wch: 80 }, { wch: 12 }, { wch: 20 }, { wch: 60 },
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
