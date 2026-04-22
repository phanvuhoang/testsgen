import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const docs = await db.document.findMany({
    where: { sessionId: params.id },
    orderBy: { uploadedAt: 'desc' },
  })
  return NextResponse.json(docs)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const contentType = req.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    // Manual input (no file upload)
    const body = await req.json()
    try {
      const doc = await (db as any).document.create({
        data: {
          sessionId: params.id,
          fileName: body.fileName || 'Manual Input',
          fileType: body.fileType as any || 'OTHER',
          fileSize: (body.content || '').length,
          filePath: '',
          isManualInput: true,
          content: body.content || '',
          description: body.description || null,
          topicId: body.topicId || null,
          topicName: body.topicName || null,
          sectionId: body.sectionId || null,
          sectionName: body.sectionName || null,
        }
      })
      return NextResponse.json(doc)
    } catch (e) {
      console.error('[manual doc]', e)
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
    }
  }

  // Original FormData handling
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const fileType = formData.get('fileType') as string || 'OTHER'

    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

    const uploadDir = join(process.cwd(), 'public', 'uploads')
    if (!existsSync(uploadDir)) await mkdir(uploadDir, { recursive: true })

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const filePath = join(uploadDir, fileName)
    await writeFile(filePath, buffer)

    const doc = await db.document.create({
      data: {
        sessionId: params.id,
        fileName: file.name,
        fileType: fileType as 'SYLLABUS' | 'TAX_REGULATIONS' | 'SAMPLE_QUESTIONS' | 'STUDY_MATERIAL' | 'RATES_TARIFF' | 'OTHER',
        fileSize: file.size,
        filePath: `/uploads/${fileName}`,
        description: formData.get('description') as string || null,
        topicId: formData.get('topicId') as string || null,
        topicName: formData.get('topicName') as string || null,
        sectionId: formData.get('sectionId') as string || null,
        sectionName: formData.get('sectionName') as string || null,
      } as any,
    })
    return NextResponse.json(doc, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
