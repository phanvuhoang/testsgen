import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export default auth((req) => {
  const { nextUrl } = req
  const isLoggedIn = !!req.auth
  const userRole = req.auth?.user?.role

  // Public routes — no auth needed
  const publicRoutes = ['/login', '/quiz/', '/api/quiz/', '/api/auth/']
  const isPublicRoute = publicRoutes.some((route) => nextUrl.pathname.startsWith(route))

  if (isPublicRoute) {
    return NextResponse.next()
  }

  // Redirect to login if not authenticated
  if (!isLoggedIn) {
    const loginUrl = new URL('/login', nextUrl)
    loginUrl.searchParams.set('callbackUrl', nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Admin-only routes
  const adminRoutes = ['/admin', '/users', '/settings']
  const isAdminRoute = adminRoutes.some((route) => nextUrl.pathname.startsWith(route))

  if (isAdminRoute && userRole !== 'ADMIN' && userRole !== 'TEACHER') {
    return NextResponse.redirect(new URL('/dashboard', nextUrl))
  }

  if (nextUrl.pathname.startsWith('/settings') && userRole !== 'ADMIN') {
    return NextResponse.redirect(new URL('/dashboard', nextUrl))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
}
