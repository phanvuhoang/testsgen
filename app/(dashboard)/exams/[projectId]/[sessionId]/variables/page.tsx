'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/use-toast'
import { Plus, Pencil, Trash2, Save, X, Variable } from 'lucide-react'

type SessionVar = { id: string; varKey: string; varLabel: string; varValue: string; varUnit: string | null; description: string | null }

export default function VariablesPage() {
  const params = useParams()
  const { toast } = useToast()
  const [vars, setVars] = useState<SessionVar[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<SessionVar>>({})
  const [isAdding, setIsAdding] = useState(false)
  const [addForm, setAddForm] = useState({ varKey: '', varLabel: '', varValue: '', varUnit: '', description: '' })

  useEffect(() => { fetchVars() }, [])

  const fetchVars = async () => {
    setIsLoading(true)
    const res = await fetch(`/api/sessions/${params.sessionId}/variables`)
    if (res.ok) setVars(await res.json())
    setIsLoading(false)
  }

  const handleSaveEdit = async (id: string) => {
    const res = await fetch(`/api/sessions/${params.sessionId}/variables/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm),
    })
    if (res.ok) {
      const updated = await res.json()
      setVars(prev => prev.map(v => v.id === id ? updated : v))
      setEditingId(null)
      toast({ title: 'Variable updated' })
    }
  }

  const handleAdd = async () => {
    if (!addForm.varKey || !addForm.varValue) return
    const res = await fetch(`/api/sessions/${params.sessionId}/variables`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(addForm),
    })
    if (res.ok) {
      const v = await res.json()
      setVars(prev => [...prev, v])
      setIsAdding(false)
      setAddForm({ varKey: '', varLabel: '', varValue: '', varUnit: '', description: '' })
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this variable?')) return
    await fetch(`/api/sessions/${params.sessionId}/variables/${id}`, { method: 'DELETE' })
    setVars(prev => prev.filter(v => v.id !== id))
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Session Variables</h2>
          <p className="text-sm text-gray-500">Named values (exchange rates, thresholds) injected into AI prompts for accurate calculations</p>
        </div>
        <Button size="sm" onClick={() => setIsAdding(true)}><Plus className="h-4 w-4 mr-2" />Add Variable</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({length: 3}).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : (
        <div className="space-y-2">
          {isAdding && (
            <Card className="border-primary">
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label className="text-xs">Key (no spaces)</Label><Input value={addForm.varKey} onChange={e => setAddForm(p => ({...p, varKey: e.target.value.replace(/\s/g,'_')}))} placeholder="e.g. exchange_rate_usd" className="h-8" /></div>
                  <div className="space-y-1"><Label className="text-xs">Label</Label><Input value={addForm.varLabel} onChange={e => setAddForm(p => ({...p, varLabel: e.target.value}))} placeholder="e.g. USD/VND Rate" className="h-8" /></div>
                  <div className="space-y-1"><Label className="text-xs">Value *</Label><Input value={addForm.varValue} onChange={e => setAddForm(p => ({...p, varValue: e.target.value}))} placeholder="25450" className="h-8" /></div>
                  <div className="space-y-1"><Label className="text-xs">Unit</Label><Input value={addForm.varUnit} onChange={e => setAddForm(p => ({...p, varUnit: e.target.value}))} placeholder="VND" className="h-8" /></div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => setIsAdding(false)}>Cancel</Button>
                  <Button size="sm" onClick={handleAdd}>Add</Button>
                </div>
              </CardContent>
            </Card>
          )}
          {vars.map(v => (
            <Card key={v.id}>
              <CardContent className="p-3">
                {editingId === v.id ? (
                  <div className="grid grid-cols-4 gap-2 items-center">
                    <Input value={editForm.varLabel ?? ''} onChange={e => setEditForm(p => ({...p, varLabel: e.target.value}))} className="h-7 text-xs" placeholder="Label" />
                    <Input value={editForm.varValue ?? ''} onChange={e => setEditForm(p => ({...p, varValue: e.target.value}))} className="h-7 text-xs" placeholder="Value" />
                    <Input value={editForm.varUnit ?? ''} onChange={e => setEditForm(p => ({...p, varUnit: e.target.value}))} className="h-7 text-xs" placeholder="Unit" />
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleSaveEdit(v.id)}><Save className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(null)}><X className="h-3 w-3" /></Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Variable className="h-4 w-4 text-gray-400 shrink-0" />
                    <div className="flex-1">
                      <span className="font-mono text-xs text-gray-400">{v.varKey}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{v.varLabel}</span>
                        <span className="font-mono text-sm text-primary">{v.varValue}{v.varUnit ? ` ${v.varUnit}` : ''}</span>
                      </div>
                      {v.description && <p className="text-xs text-gray-400">{v.description}</p>}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingId(v.id); setEditForm({ varLabel: v.varLabel, varValue: v.varValue, varUnit: v.varUnit ?? '' }) }}><Pencil className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(v.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
