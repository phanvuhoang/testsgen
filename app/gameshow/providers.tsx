'use client'
import { SessionProvider } from 'next-auth/react'

export function GameshowProviders({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}
