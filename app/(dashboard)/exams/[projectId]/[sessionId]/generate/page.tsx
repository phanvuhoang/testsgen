'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/components/ui/use-toast'
import { Sparkles, Loader2, CheckCircle2, XCircle } from 'lucide-react'

type Section = {
  id: string
  name: string
  questionType: string
  marksPerQuestion: number
  questionsInBank: number
  aiInstructions: string | null
}

type GeneratedQ = {
  id: string
  stem: string
  questionType: string
  options?: string[]
  correctAnswer?: string
  markingScheme?: string
  topic?: string
  difficulty: string
  marks: number
}

export default function GeneratePage() {
  const params = useParams()
  const { toast } = useToast()
  const [sections, setSections] = useState<Section[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [extraInstructions, setExtraInstructions] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generated, setGenerated] = useState<GeneratedQ[]>([])
  const [isDone, setIsDone] = useState(false)

  useEffect(() => {
    fetchSections()
  }, [])

  const fetchSections = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/sessions/${params.sessionId}/sections`)
      if (res.ok) {
        const data: Section[] = await res.json()
        setSections(data)
        const initCounts: Record<string, number> = {}
        const initSelected: Record<string, boolean> = {}
        data.forEach((s) => {
          initCounts[s.id] = s.questionsInBank
          initSelected[s.id] = false
        })
        setCounts(initCounts)
        setSelected(initSelected)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleGenerate = async () => {
    const selectedSections = sections.filter((s) => selected[s.id])
    if (selectedSections.length === 0) {
      toast({ title: 'Select at least one section', variant: 'destructive' })
      return
    }

    setIsGenerating(true)
    setGenerated([])
    setIsDone(false)

    try {
      const res = await fetch(`/api/sessions/${params.sessionId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sections: selectedSections.map((s) => ({
            sectionId: s.id,
            count: counts[s.id],
          })),
          extraInstructions,
        }),
      })

      if (!res.ok || !res.body) throw new Error('Generation failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') {
              setIsDone(true)
              break
            }
            try {
              const q = JSON.parse(data)
              setGenerated((prev) => [...prev, q])
            } catch {}
          }
        }
      }
    } catch (e) {
      toast({ title: 'Generation failed', description: String(e), variant: 'destructive' })
    } finally {
      setIsGenerating(false)
    }
  }

  const toggleAll = (value: boolean) => {
    setSelected((prev) => {
      const next = { ...prev }
      sections.forEach((s) => { next[s.id] = value })
      return next
    })
  }

  const selectedCount = Object.values(selected).filter(Boolean).length
  const totalToGenerate = sections
    .filter((s) => selected[s.id])
    .reduce((sum, s) => sum + (counts[s.id] || 0), 0)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Generate Questions</h2>
        <p className="text-sm text-gray-500">Select sections and generate AI questions from your uploaded documents</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Config Panel */}
        <div className="space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : sections.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No sections defined. Add sections first.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm">
                <button onClick={() => toggleAll(true)} className="text-primary hover:underline">Select all</button>
                <span className="text-gray-300">|</span>
                <button onClick={() => toggleAll(false)} className="text-gray-500 hover:underline">Deselect all</button>
              </div>

              {sections.map((sec) => (
                <Card key={sec.id} className={selected[sec.id] ? 'border-primary' : ''}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={selected[sec.id] || false}
                        onCheckedChange={(v) => setSelected((prev) => ({ ...prev, [sec.id]: !!v }))}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-medium text-sm">{sec.name}</span>
                          <Badge variant="outline" className="text-xs">{sec.questionType.replace(/_/g, ' ')}</Badge>
                        </div>
                        {selected[sec.id] && (
                          <div className="space-y-1">
                            <Label className="text-xs">Questions to generate</Label>
                            <Input
                              type="number"
                              value={counts[sec.id] || sec.questionsInBank}
                              onChange={(e) => setCounts((prev) => ({ ...prev, [sec.id]: Number(e.target.value) }))}
                              className="h-8 text-sm"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              <div className="space-y-2">
                <Label>Extra instructions (optional)</Label>
                <Textarea
                  placeholder="e.g. Only reference regulations effective from 2025..."
                  value={extraInstructions}
                  onChange={(e) => setExtraInstructions(e.target.value)}
                  className="min-h-[100px]"
                />
              </div>

              {selectedCount > 0 && (
                <p className="text-sm text-gray-600">
                  Will generate approximately <strong>{totalToGenerate}</strong> questions across{' '}
                  <strong>{selectedCount}</strong> section{selectedCount !== 1 ? 's' : ''}
                </p>
              )}

              <Button
                className="w-full"
                onClick={handleGenerate}
                disabled={isGenerating || selectedCount === 0}
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                {isGenerating ? 'Generating...' : 'Generate Questions'}
              </Button>
            </>
          )}
        </div>

        {/* Progress Panel */}
        <div>
          {(isGenerating || generated.length > 0) && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm">Generated Questions</h3>
                <div className="flex items-center gap-2">
                  {isGenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : isDone ? (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  ) : null}
                  <span className="text-sm text-gray-500">{generated.length} questions</span>
                </div>
              </div>

              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                {generated.map((q, i) => (
                  <Card key={q.id || i} className="animate-fade-in">
                    <CardContent className="p-3">
                      <div className="flex items-start gap-2">
                        <div className="flex-1">
                          <p className="text-xs font-medium line-clamp-3">{q.stem}</p>
                          <div className="flex gap-1 mt-1">
                            <Badge variant="outline" className="text-xs py-0">{q.questionType?.replace(/_/g, ' ')}</Badge>
                            <Badge variant="outline" className="text-xs py-0">{q.difficulty}</Badge>
                            <span className="text-xs text-gray-500">{q.marks}m</span>
                            {q.topic && <span className="text-xs text-gray-500">{q.topic}</span>}
                          </div>
                        </div>
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {isGenerating && (
                  <Card>
                    <CardContent className="p-3 space-y-2">
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-3/4" />
                    </CardContent>
                  </Card>
                )}
              </div>

              {isDone && (
                <p className="text-sm text-primary font-medium text-center">
                  ✓ All questions saved to question bank
                </p>
              )}
            </div>
          )}

          {!isGenerating && generated.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <Sparkles className="h-12 w-12 mb-3" />
              <p className="text-sm">Generated questions will appear here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
