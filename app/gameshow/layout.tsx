import { GameshowProviders } from './providers'

export default function GameshowLayout({ children }: { children: React.ReactNode }) {
  return <GameshowProviders>{children}</GameshowProviders>
}
