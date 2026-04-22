'use client'

import { useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Settings2 } from 'lucide-react'

const PARSE_PATTERNS = [
  { value: 'HEADING2_EXAMPLE', label: 'Heading 2 "Example N:" (default)' },
  { value: 'NUMBERED_LIST', label: 'Numbered list (1., 2., 3.)' },
  { value: 'AI_ONLY', label: 'AI auto-detect (slower, more accurate)' },
]

export function ParsePatternSetting({ projectId, initial }: { projectId: string; initial: string }) {
  const { toast } = useToast()
  const [value, setValue] = useState(initial || 'HEADING2_EXAMPLE')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parsePattern: value }),
      })
      if (!res.ok) throw new Error()
      toast({ title: 'Parse pattern saved' })
    } catch {
      toast({ title: 'Failed to save', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Settings2 className="h-4 w-4 text-gray-400 shrink-0" />
      <Label className="text-sm shrink-0">Document parse pattern:</Label>
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger className="h-8 text-sm w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PARSE_PATTERNS.map(p => (
            <SelectItem key={p.value} value={p.value} className="text-sm">{p.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" variant="outline" onClick={handleSave} disabled={saving} className="h-8 text-xs">
        Save
      </Button>
    </div>
  )
}
