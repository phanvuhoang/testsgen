'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Puzzle } from 'lucide-react'

export default function TakeQuizPage() {
  const router = useRouter()
  const [code, setCode] = useState('')

  const handleGo = () => {
    const trimmed = code.trim()
    if (trimmed) router.push(`/quiz/${trimmed}`)
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Take a Quiz</h1>
        <p className="text-gray-500">Enter a quiz share code to start</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="bg-purple-50 p-3 rounded-lg">
              <Puzzle className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <CardTitle className="text-base">Enter Quiz Code</CardTitle>
              <CardDescription>Get the code from your instructor</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="e.g. ABC123"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleGo()}
              className="font-mono text-lg"
            />
            <Button onClick={handleGo} disabled={!code.trim()}>
              Go
            </Button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            The share code can be found in the Share tab of any quiz set.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
