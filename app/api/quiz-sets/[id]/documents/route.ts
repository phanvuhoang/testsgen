import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

// GET /api/quiz-sets/[id]/documents — list uploaded documents for a quiz set
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const docs = await db.quizDocument.findMany({
    where: { quizSetId: params.id },
    orderBy: { uploadedAt: 'desc' },
  })
  return NextResponse.json(docs)
}

// POST /api/quiz-sets/[id]/documents — upload a document
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify quiz set ownership
  const where =
    session.user.role === 'ADMIN'
      ? { id: params.id }
      : { id: params.id, createdById: session.user.id }

  const quizSet = await db.quizSet.findFirst({ where })
  if (!quizSet) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

    const uploadDir = join(process.cwd(), 'public', 'uploads', 'quiz-docs')
    if (!existsSync(uploadDir)) await mkdir(uploadDir, { recursive: true })

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const filePath = join(uploadDir, safeName)
    await writeFile(filePath, buffer)

    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    const fileType =
      ext === 'pdf' ? 'pdf' : ext === 'docx' || ext === 'doc' ? 'docx' : ext === 'txt' ? 'txt' : 'other'

    const doc = await db.quizDocument.create({
      data: {
        quizSetId: params.id,
        fileName: file.name,
        fileType,
        fileSize: file.size,
        filePath: `/uploads/quiz-docs/${safeName}`,
      },
    })

    return NextResponse.json(doc, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
