'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/use-toast'
import { Upload, FileText, Trash2, Loader2, Save } from 'lucide-react'
import { formatDate, formatFileSize } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type Document = {
  id: string
  fileName: string
  fileType: string
  fileSize: number
  filePath: string
  uploadedAt: string
  description?: string | null
  topicId?: string | null
  topicName?: string | null
  sectionId?: string | null
  sectionName?: string | null
  isManualInput?: boolean
}

const fileTypes = ['SYLLABUS', 'TAX_REGULATIONS', 'SAMPLE_QUESTIONS', 'STUDY_MATERIAL', 'RATES_TARIFF', 'OTHER']
const fileTypeLabels: Record<string, string> = {
  SYLLABUS: 'Syllabus',
  TAX_REGULATIONS: 'Regulations',
  SAMPLE_QUESTIONS: 'Sample Questions',
  STUDY_MATERIAL: 'Study Material',
  RATES_TARIFF: 'Rates / Tariff',
  OTHER: 'Other',
}
const fileTypeColors: Record<string, string> = {
  SYLLABUS: 'bg-blue-100 text-blue-800',
  TAX_REGULATIONS: 'bg-purple-100 text-purple-800',
  SAMPLE_QUESTIONS: 'bg-green-100 text-green-800',
  STUDY_MATERIAL: 'bg-yellow-100 text-yellow-800',
  RATES_TARIFF: 'bg-orange-100 text-orange-800',
  OTHER: 'bg-gray-100 text-gray-800',
}

export default function DocumentsPage() {
  const params = useParams()
  const { toast } = useToast()
  const [docs, setDocs] = useState<Document[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [selectedType, setSelectedType] = useState('SYLLABUS')
  const [topics, setTopics] = useState<{id: string; name: string; isOverall: boolean; parentId: string | null}[]>([])
  const [sections, setSections] = useState<{id: string; name: string}[]>([])
  const [selectedTopicId, setSelectedTopicId] = useState<string>('none')
  const [selectedSectionId, setSelectedSectionId] = useState<string>('none')
  const [docDescription, setDocDescription] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchDocs()
    fetch(`/api/sessions/${params.sessionId}/topics`).then(r => r.ok ? r.json() : []).then(setTopics).catch(() => {})
    fetch(`/api/sessions/${params.sessionId}/sections`).then(r => r.ok ? r.json() : []).then(setSections).catch(() => {})
  }, [])

  const fetchDocs = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/sessions/${params.sessionId}/documents`)
      if (res.ok) setDocs(await res.json())
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpload = async (file: File) => {
    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('fileType', selectedType)
      formData.append('sessionId', params.sessionId as string)
      formData.append('topicId', selectedTopicId !== 'none' ? selectedTopicId : '')
      formData.append('topicName', selectedTopicId !== 'none' ? (topics.find(t => t.id === selectedTopicId)?.name ?? '') : '')
      formData.append('sectionId', selectedSectionId !== 'none' ? selectedSectionId : '')
      formData.append('sectionName', selectedSectionId !== 'none' ? (sections.find(s => s.id === selectedSectionId)?.name ?? '') : '')
      formData.append('description', docDescription)
      const res = await fetch(`/api/sessions/${params.sessionId}/documents`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) throw new Error()
      const doc = await res.json()
      setDocs((prev) => [doc, ...prev])
      toast({ title: 'Document uploaded' })
    } catch {
      toast({ title: 'Upload failed', variant: 'destructive' })
    } finally {
      setIsUploading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this document?')) return
    const res = await fetch(`/api/sessions/${params.sessionId}/documents/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setDocs((prev) => prev.filter((d) => d.id !== id))
      toast({ title: 'Document deleted' })
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Documents</h2>
        <div className="flex gap-2 flex-wrap">
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fileTypes.map((t) => (
                <SelectItem key={t} value={t}>{fileTypeLabels[t] ?? t.replace(/_/g, ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Topic tagging */}
          <Select value={selectedTopicId} onValueChange={setSelectedTopicId}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Topic (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No topic</SelectItem>
              {topics.filter(t => !t.isOverall).map(t => (
                <SelectItem key={t.id} value={t.id}>{t.parentId ? `↳ ${t.name}` : t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Section tagging */}
          <Select value={selectedSectionId} onValueChange={setSelectedSectionId}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Section (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No section</SelectItem>
              {sections.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>

          {selectedType === 'OTHER' && (
            <Input
              value={docDescription}
              onChange={e => setDocDescription(e.target.value)}
              placeholder="Describe this document..."
              className="w-64"
            />
          )}

          <Button onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Upload Document
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleUpload(file)
            }}
          />
        </div>
      </div>

      {/* Drop zone */}
      <div
        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center mb-6 cursor-pointer hover:border-primary transition-colors"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const file = e.dataTransfer.files[0]
          if (file) handleUpload(file)
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
        <p className="text-gray-600 font-medium">Drop files here or click to upload</p>
        <p className="text-sm text-gray-400 mt-1">PDF, DOCX, TXT, XLSX — used as AI context for question generation</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : docs.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p>No documents uploaded yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="p-4 flex items-center gap-4">
                <FileText className="h-8 w-8 text-gray-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{doc.fileName}</p>
                  <div className="flex gap-2 mt-1 flex-wrap items-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${fileTypeColors[doc.fileType] ?? 'bg-gray-100 text-gray-800'}`}>
                      {fileTypeLabels[doc.fileType] ?? doc.fileType.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs text-gray-500">{formatFileSize(doc.fileSize)}</span>
                    <span className="text-xs text-gray-500">{formatDate(doc.uploadedAt)}</span>
                    {doc.topicName && <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">{doc.topicName}</span>}
                    {doc.sectionName && <span className="text-xs px-1.5 py-0.5 bg-green-50 text-green-700 rounded">{doc.sectionName}</span>}
                    {doc.description && <span className="text-xs text-gray-400 italic">{doc.description}</span>}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-red-500 hover:text-red-700 h-8 w-8"
                  onClick={() => handleDelete(doc.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
