import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { unlink } from 'fs/promises'
import { join } from 'path'

export async function PATCH(req: NextRequest, { params }: { params: { id: string; docId: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const doc = await (db as any).document.update({
      where: { id: params.docId },
      data: {
        topicId: body.topicId !== undefined ? body.topicId : undefined,
        topicName: body.topicName !== undefined ? body.topicName : undefined,
        sectionId: body.sectionId !== undefined ? body.sectionId : undefined,
        sectionName: body.sectionName !== undefined ? body.sectionName : undefined,
        description: body.description !== undefined ? body.description : undefined,
        topicIds: body.topicIds !== undefined ? body.topicIds : undefined,
        topicNames: body.topicNames !== undefined ? body.topicNames : undefined,
        sectionIds: body.sectionIds !== undefined ? body.sectionIds : undefined,
        sectionNames: body.sectionNames !== undefined ? body.sectionNames : undefined,
        parseKeyword: body.parseKeyword !== undefined ? body.parseKeyword : undefined,
        parseStyle: body.parseStyle !== undefined ? body.parseStyle : undefined,
        parseNumber: body.parseNumber !== undefined ? body.parseNumber : undefined,
      },
    })
    return NextResponse.json(doc)
  } catch (e) {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; docId: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const doc = await db.document.findUnique({ where: { id: params.docId } })
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    await unlink(join(process.cwd(), 'public', doc.filePath))
  } catch {}

  await db.document.delete({ where: { id: params.docId } })
  return NextResponse.json({ success: true })
}
