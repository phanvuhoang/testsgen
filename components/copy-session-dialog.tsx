'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Copy, Loader2 } from 'lucide-react'

type Session = { id: string; name: string }

export function CopySessionButton({ sourceSession, allSessions }: { sourceSession: Session; allSessions: Session[] }) {
  const [open, setOpen] = useState(false)
  const [targetId, setTargetId] = useState('')
  const [copySections, setCopySections] = useState(true)
  const [copyTopics, setCopyTopics] = useState(true)
  const [copyDocTypes, setCopyDocTypes] = useState<string[]>(['SYLLABUS', 'TAX_REGULATIONS', 'SAMPLE_QUESTIONS', 'STUDY_MATERIAL', 'RATES_TARIFF', 'OTHER'])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const otherSessions = allSessions.filter(s => s.id !== sourceSession.id)

  const handleCopy = async () => {
    if (!targetId) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(`/api/sessions/${sourceSession.id}/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetSessionId: targetId, copySections, copyTopics, copyDocTypes }),
      })
      const data = await res.json()
      if (data.ok) {
        setResult(`Copied: ${data.copied.sections} sections, ${data.copied.topics} topics, ${data.copied.documents} documents`)
      } else {
        setResult('Error: ' + (data.error ?? 'Unknown error'))
      }
    } catch {
      setResult('Network error')
    }
    setLoading(false)
  }

  return (
    <>
      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setOpen(true); setResult(null); setTargetId('') }}>
        <Copy className="h-3 w-3 mr-1" />Copy
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Copy Session Content</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-500 mb-1">From: <strong>{sourceSession.name}</strong></p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Copy to session</Label>
              {otherSessions.length === 0 ? (
                <p className="text-sm text-gray-400">No other sessions in this project.</p>
              ) : (
                <Select value={targetId} onValueChange={setTargetId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select target session..." /></SelectTrigger>
                  <SelectContent>
                    {otherSessions.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">What to copy</Label>
              
              <div className="flex items-center gap-2">
                <Checkbox id="copySections" checked={copySections} onCheckedChange={v => setCopySections(!!v)} />
                <Label htmlFor="copySections" className="text-sm">Exam Sections</Label>
              </div>
              
              <div className="flex items-center gap-2">
                <Checkbox id="copyTopics" checked={copyTopics} onCheckedChange={v => setCopyTopics(!!v)} />
                <Label htmlFor="copyTopics" className="text-sm">Topics (including sub-topics)</Label>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Checkbox id="copyDocs" checked={copyDocTypes.length > 0} onCheckedChange={v => {
                    if (v) setCopyDocTypes(['SYLLABUS', 'TAX_REGULATIONS', 'SAMPLE_QUESTIONS', 'STUDY_MATERIAL', 'RATES_TARIFF', 'OTHER'])
                    else setCopyDocTypes([])
                  }} />
                  <Label htmlFor="copyDocs" className="text-sm font-medium">Documents</Label>
                </div>
                <div className="ml-6 space-y-1">
                  {[
                    { value: 'SYLLABUS', label: 'Syllabus' },
                    { value: 'TAX_REGULATIONS', label: 'Regulations' },
                    { value: 'SAMPLE_QUESTIONS', label: 'Sample Questions' },
                    { value: 'STUDY_MATERIAL', label: 'Study Material' },
                    { value: 'RATES_TARIFF', label: 'Rates / Tariff' },
                    { value: 'OTHER', label: 'Other' },
                  ].map(dt => (
                    <div key={dt.value} className="flex items-center gap-2">
                      <Checkbox
                        id={`dt-${dt.value}`}
                        checked={copyDocTypes.includes(dt.value)}
                        onCheckedChange={v => {
                          if (v) setCopyDocTypes(prev => [...prev, dt.value])
                          else setCopyDocTypes(prev => prev.filter(x => x !== dt.value))
                        }}
                      />
                      <Label htmlFor={`dt-${dt.value}`} className="text-xs">{dt.label}</Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {result && <p className={`text-sm ${result.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>{result}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCopy} disabled={!targetId || loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                Copy
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
