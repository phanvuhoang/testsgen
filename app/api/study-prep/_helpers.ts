import { auth } from '@/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function authorizePrepSet(prepSetId: string) {
  const session = await auth()
  if (!session?.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const prep = await db.studyPrepSet.findUnique({ where: { id: prepSetId } })
  if (!prep) {
    return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  }
  if (session.user.role !== 'ADMIN' && prep.createdById !== session.user.id) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { session, prep }
}

export async function authorizeAsset<
  T extends 'studyPlan' | 'studyMaterial' | 'mockExamPlan',
>(model: T, id: string) {
  const session = await auth()
  if (!session?.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  let asset: any = null
  if (model === 'studyPlan') {
    asset = await db.studyPlan.findUnique({ where: { id }, include: { prepSet: true } })
  } else if (model === 'studyMaterial') {
    asset = await db.studyMaterial.findUnique({ where: { id }, include: { prepSet: true } })
  } else {
    asset = await db.mockExamPlan.findUnique({ where: { id }, include: { prepSet: true } })
  }
  if (!asset) {
    return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  }
  if (session.user.role !== 'ADMIN' && asset.prepSet.createdById !== session.user.id) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { session, asset }
}
