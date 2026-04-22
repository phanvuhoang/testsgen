'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/use-toast'
import { Upload, FileText, Trash2, Loader2 } from 'lucide-react'
import { formatDate, formatFileSize } from '@/lib/utils'

type Document = {
  id: string
  fileName: string
  fileType: string
  fileSize: number
  filePath: string
  uploadedAt: string
}

const fileTypes = ['SYLLABUS', 'TAX_REGULATIONS', 'SAMPLE_QUESTIONS', 'STUDY_MATERIAL', 'OTHER']
const fileTypeLabels: Record<string, string> = {
  SYLLABUS: 'Syllabus',
  TAX_REGULATIONS: 'Regulations',
  SAMPLE_QUESTIONS: 'Sample Questions',
  STUDY_MATERIAL: 'Study Material',
  OTHER: 'Other',
}
const fileTypeColors: Record<string, string> = {
  SYLLABUS: 'bg-blue-100 text-blue-800',
  TAX_REGULATIONS: 'bg-purple-100 text-purple-800',
  SAMPLE_QUESTIONS: 'bg-green-100 text-green-800',
  STUDY_MATERIAL: 'bg-yellow-100 text-yellow-800',
  OTHER: 'bg-gray-100 text-gray-800',
}

export default function DocumentsPage() {
  const params = useParams()
  const { toast } = useToast()
  const [docs, setDocs] = useState<Document[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [selectedType, setSelectedType] = useState('SYLLABUS')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchDocs()
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
        <div className="flex gap-2">
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
                  <div className="flex gap-2 mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${fileTypeColors[doc.fileType]}`}>
                      {fileTypeLabels[doc.fileType] ?? doc.fileType.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs text-gray-500">{formatFileSize(doc.fileSize)}</span>
                    <span className="text-xs text-gray-500">{formatDate(doc.uploadedAt)}</span>
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
