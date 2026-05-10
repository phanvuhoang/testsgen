// Module 3 — Source aggregation
// Reads documents + questions from existing Module 1 (Session) and Module 2 (QuizSet)
// records and returns a normalized StudyPrepContext for the prompt builders.

import { db } from '@/lib/db'
import { readFile } from 'fs/promises'
import { join } from 'path'
import type { SourceDoc, SourceQuestion, StudyPrepContext } from './study-prep-prompts'

const MAX_PER_FILE_CHARS = 60_000

// Reuse the same extraction approach as Module 1/2 (pdf-parse, mammoth, raw text).
async function extractDocumentText(filePath: string): Promise<string> {
  try {
    const fullPath = join(process.cwd(), 'public', filePath)
    const buffer = await readFile(fullPath)

    const lower = filePath.toLowerCase()
    if (lower.endsWith('.txt') || lower.endsWith('.md')) {
      return buffer.toString('utf-8').slice(0, MAX_PER_FILE_CHARS)
    }
    if (lower.endsWith('.pdf')) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse')
      const data = await pdfParse(buffer)
      return (data.text ?? '').slice(0, MAX_PER_FILE_CHARS)
    }
    if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require('mammoth')
      const result = await mammoth.extractRawText({ buffer })
      return (result.value ?? '').slice(0, MAX_PER_FILE_CHARS)
    }
    return buffer.toString('utf-8').slice(0, MAX_PER_FILE_CHARS)
  } catch {
    return ''
  }
}

export type BuildContextInput = {
  prepSetId: string
  // optional include filters from the request
  includeDocumentIds?: string[]      // Module 1 Document ids
  includeQuizDocumentIds?: string[]  // Module 2 QuizDocument ids
  includeQuestionIds?: string[]      // Module 1 Question ids
  includeQuizQuestionIds?: string[]  // Module 2 QuizQuestion ids
  includeParsedQuestions?: boolean   // Module 1 ParsedQuestion (defaults true)
  notes?: string
}

export async function buildStudyPrepContext(
  input: BuildContextInput
): Promise<StudyPrepContext | null> {
  const prep = await db.studyPrepSet.findUnique({
    where: { id: input.prepSetId },
    include: {
      session: {
        include: {
          topics: true,
        },
      },
      quizSet: true,
    },
  })
  if (!prep) return null

  const docs: SourceDoc[] = []
  const questions: SourceQuestion[] = []
  const topicSet = new Set<string>()

  // ── Module 1 documents (if linked) ────────────────────────────────────────
  if (prep.sessionId) {
    const sessionDocs = await db.document.findMany({
      where: {
        sessionId: prep.sessionId,
        ...(input.includeDocumentIds?.length
          ? { id: { in: input.includeDocumentIds } }
          : {}),
      },
      orderBy: { uploadedAt: 'asc' },
    })
    for (const d of sessionDocs) {
      const text = d.isManualInput
        ? (d.content || '')
        : await extractDocumentText(d.filePath)
      if (!text) continue
      docs.push({
        id: d.id,
        fileName: d.fileName,
        fileType: d.fileType,
        text,
      })
    }

    // Topic names registered for the session
    for (const t of prep.session?.topics ?? []) {
      topicSet.add(t.name)
    }

    // Approved + needs-review questions
    const sessQuestions = await db.question.findMany({
      where: {
        sessionId: prep.sessionId,
        ...(input.includeQuestionIds?.length
          ? { id: { in: input.includeQuestionIds } }
          : {}),
      },
      take: 200,
      orderBy: { createdAt: 'desc' },
    })
    for (const q of sessQuestions) {
      questions.push({
        id: q.id,
        source: 'question',
        topic: q.topic,
        difficulty: q.difficulty,
        stem: q.stem,
        correctAnswer: q.correctAnswer,
        questionType: q.questionType,
      })
      if (q.topic) topicSet.add(q.topic)
    }

    // Parsed past questions
    if (input.includeParsedQuestions !== false) {
      const parsed = await db.parsedQuestion.findMany({
        where: { sessionId: prep.sessionId },
        take: 80,
        orderBy: { sortOrder: 'asc' },
      })
      for (const p of parsed) {
        questions.push({
          id: p.id,
          source: 'parsedQuestion',
          topic: p.topicName,
          difficulty: p.difficulty,
          stem: (p.title ? p.title + ' — ' : '') + p.content,
          correctAnswer: p.answer,
          questionType: p.questionType,
        })
        if (p.topicName) topicSet.add(p.topicName)
      }
    }
  }

  // ── Module 2 quiz set (if linked) ─────────────────────────────────────────
  if (prep.quizSetId) {
    const quizDocs = await db.quizDocument.findMany({
      where: {
        quizSetId: prep.quizSetId,
        ...(input.includeQuizDocumentIds?.length
          ? { id: { in: input.includeQuizDocumentIds } }
          : {}),
      },
    })
    for (const d of quizDocs) {
      const text = await extractDocumentText(d.filePath)
      if (!text) continue
      docs.push({
        id: d.id,
        fileName: d.fileName,
        fileType: d.fileType,
        text,
      })
    }

    const qq = await db.quizQuestion.findMany({
      where: {
        quizSetId: prep.quizSetId,
        ...(input.includeQuizQuestionIds?.length
          ? { id: { in: input.includeQuizQuestionIds } }
          : {}),
      },
      take: 200,
      orderBy: { sortOrder: 'asc' },
    })
    for (const q of qq) {
      questions.push({
        id: q.id,
        source: 'quizQuestion',
        topic: q.topic,
        difficulty: q.difficulty,
        stem: q.stem,
        correctAnswer: q.correctAnswer,
        questionType: q.questionType,
      })
      if (q.topic) topicSet.add(q.topic)
    }
  }

  const daysUntilExam = prep.examDate
    ? Math.max(
        0,
        Math.ceil(
          (new Date(prep.examDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        )
      )
    : null

  const language: 'en' | 'vi' =
    (prep.language === 'vi' || prep.language === 'VI' || prep.language === 'vie')
      ? 'vi'
      : 'en'

  return {
    prepSetName: prep.name,
    targetExam: prep.targetExam,
    examDate: prep.examDate ? prep.examDate.toISOString().slice(0, 10) : null,
    daysUntilExam,
    targetScore: prep.targetScore,
    weeklyHours: prep.weeklyHours ?? null,
    language,
    documents: docs,
    questions,
    topicNames: Array.from(topicSet),
    notes: input.notes,
  }
}

// Convenience: returns true if there's at least one usable source
export function hasUsableSources(ctx: StudyPrepContext): boolean {
  return ctx.documents.length > 0 || ctx.questions.length > 0
}
