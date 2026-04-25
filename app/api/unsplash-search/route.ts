import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('query')
  const page = req.nextUrl.searchParams.get('page') || '1'
  if (!query) return NextResponse.json({ error: 'Missing query' }, { status: 400 })

  const accessKey = process.env.UNSPLASH_ACCESS_KEY
  if (!accessKey) return NextResponse.json({ error: 'Unsplash not configured' }, { status: 503 })

  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&page=${page}&per_page=12&orientation=landscape`
    const res = await fetch(url, { headers: { Authorization: `Client-ID ${accessKey}` } })
    if (!res.ok) throw new Error(`Unsplash error ${res.status}`)
    const data = await res.json()
    const photos = (data.results || []).map((p: any) => ({
      id: p.id,
      thumb: p.urls.small,
      full: p.urls.regular,
      alt: p.alt_description || p.description || query,
      author: p.user.name,
      authorLink: p.user.links.html,
    }))
    return NextResponse.json({ photos, total: data.total })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Search failed' }, { status: 500 })
  }
}
