'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2, XCircle } from 'lucide-react'

export default function GameshowRouterPage() {
  const params = useParams()
  const router = useRouter()
  const shareCode = params.shareCode as string
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const currentSearch = window.location.search
    fetch(`/api/gameshow/${shareCode}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setError(data.error)
          return
        }
        // Route to correct game type, preserving ?room= and other query params
        switch (data.type) {
          case 'WWTBAM':
            router.replace(`/gameshow/${shareCode}/wwtbam${currentSearch}`)
            break
          case 'KAHOOT':
            router.replace(`/gameshow/${shareCode}/kahoot${currentSearch}`)
            break
          case 'JEOPARDY':
            router.replace(`/gameshow/${shareCode}/jeopardy${currentSearch}`)
            break
          default:
            setError(`Unknown game type: ${data.type}`)
        }
      })
      .catch(() => setError('Failed to load gameshow'))
  }, [shareCode, router])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
        <div className="text-center">
          <XCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <p className="text-lg font-semibold">{error}</p>
          <p className="text-sm text-gray-400 mt-2">Check the gameshow link and try again.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="text-center">
        <Loader2 className="h-10 w-10 animate-spin text-[#028a39] mx-auto mb-4" />
        <p className="text-white text-sm">Loading gameshow...</p>
      </div>
    </div>
  )
}
