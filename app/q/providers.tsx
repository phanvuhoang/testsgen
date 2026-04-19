'use client'
import { SessionProvider } from 'next-auth/react'

export function QuizPublicProviders({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}
