import { QuizPublicProviders } from './providers'

export default function QuizPublicLayout({ children }: { children: React.ReactNode }) {
  return <QuizPublicProviders>{children}</QuizPublicProviders>
}
