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
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Upload, FileText, Trash2, Loader2, Save, Tag, Puzzle, ChevronDown, X } from 'lucide-react'
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
  // Legacy single fields (keep for compat)
  topicId?: string | null
  topicName?: string | null
  sectionId?: string | null
  sectionName?: string | null
  isManualInput?: boolean
  // NEW multi fields
  topicIds?: string | null   // JSON string e.g. '["id1","id2"]'
  topicNames?: string | null // JSON string
  sectionIds?: string | null
  sectionNames?: string | null
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

const parseJsonArr = (s: string | null | undefined): string[] => {
  if (!s) return []
  try { return JSON.parse(s) } catch { return [] }
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
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([])
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([])
  const [docDescription, setDocDescription] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Upload popover state
  const [topicPopoverOpen, setTopicPopoverOpen] = useState(false)
  const [sectionPopoverOpen, setSectionPopoverOpen] = useState(false)

  // Edit tag state
  const [editTagDocId, setEditTagDocId] = useState<string | null>(null)
  const [editTagTopics, setEditTagTopics] = useState<string[]>([])
  const [editTagSections, setEditTagSections] = useState<string[]>([])
  const [editTagDesc, setEditTagDesc] = useState<string>('')
  const [isSavingTag, setIsSavingTag] = useState(false)

  // Edit tag popover state
  const [editTopicPopoverOpen, setEditTopicPopoverOpen] = useState(false)
  const [editSectionPopoverOpen, setEditSectionPopoverOpen] = useState(false)

  // Parse state
  const [parsingDocId, setParsingDocId] = useState<string | null>(null)
  const [parsedResult, setParsedResult] = useState<{docId: string; count: number} | null>(null)

  // Filter state
  const [filterType, setFilterType] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState('')

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
      const topicObjects = topics.filter(t => selectedTopicIds.includes(t.id))
      const sectionObjects = sections.filter(s => selectedSectionIds.includes(s.id))
      const formData = new FormData()
      formData.append('file', file)
      formData.append('fileType', selectedType)
      formData.append('sessionId', params.sessionId as string)
      // Legacy single fields (first item)
      formData.append('topicId', selectedTopicIds[0] ?? '')
      formData.append('topicName', topicObjects[0]?.name ?? '')
      formData.append('sectionId', selectedSectionIds[0] ?? '')
      formData.append('sectionName', sectionObjects[0]?.name ?? '')
      // New multi fields
      formData.append('topicIds', JSON.stringify(selectedTopicIds))
      formData.append('topicNames', JSON.stringify(topicObjects.map(t => t.name)))
      formData.append('sectionIds', JSON.stringify(selectedSectionIds))
      formData.append('sectionNames', JSON.stringify(sectionObjects.map(s => s.name)))
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

  const handleSaveTag = async (docId: string) => {
    setIsSavingTag(true)
    try {
      const topicObjs = topics.filter(t => editTagTopics.includes(t.id))
      const sectionObjs = sections.filter(s => editTagSections.includes(s.id))
      const res = await fetch(`/api/sessions/${params.sessionId}/documents/${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId: editTagTopics[0] ?? null,
          topicName: topicObjs[0]?.name ?? null,
          sectionId: editTagSections[0] ?? null,
          sectionName: sectionObjs[0]?.name ?? null,
          topicIds: JSON.stringify(editTagTopics),
          topicNames: JSON.stringify(topicObjs.map(t => t.name)),
          sectionIds: JSON.stringify(editTagSections),
          sectionNames: JSON.stringify(sectionObjs.map(s => s.name)),
          description: editTagDesc || null,
        }),
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      setDocs(prev => prev.map(d => d.id === docId ? { ...d, ...updated } : d))
      setEditTagDocId(null)
      toast({ title: 'Tags updated' })
    } catch { toast({ title: 'Failed to save tags', variant: 'destructive' }) }
    finally { setIsSavingTag(false) }
  }

  const handleParseDocument = async (docId: string) => {
    setParsingDocId(docId)
    try {
      const res = await fetch(`/api/sessions/${params.sessionId}/documents/${docId}/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useAI: true }),
      })
      const data = await res.json()
      if (data.error && !data.parsed) throw new Error(data.error)
      setParsedResult({ docId, count: data.count ?? 0 })
      toast({ title: `Parsed ${data.count} questions`, description: 'View them in the Samples tab' })
    } catch (e) {
      toast({ title: 'Parse failed', description: String(e), variant: 'destructive' })
    } finally {
      setParsingDocId(null)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Documents</h2>
        <div className="flex gap-2 flex-wrap items-center">
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

          {/* Topic multi-select */}
          <Popover open={topicPopoverOpen} onOpenChange={setTopicPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 text-xs gap-1">
                {selectedTopicIds.length === 0
                  ? 'Topics (optional)'
                  : `${selectedTopicIds.length} topic${selectedTopicIds.length > 1 ? 's' : ''}`}
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
              <p className="text-xs font-semibold mb-1 text-gray-500">Select topics</p>
              {topics.filter(t => !t.isOverall).length === 0 ? (
                <p className="text-xs text-gray-400 py-1">No topics available</p>
              ) : (
                topics.filter(t => !t.isOverall).map(t => (
                  <div
                    key={t.id}
                    className="flex items-center gap-2 py-1 cursor-pointer hover:bg-gray-50 rounded px-1"
                    onClick={() => setSelectedTopicIds(prev =>
                      prev.includes(t.id) ? prev.filter(x => x !== t.id) : [...prev, t.id]
                    )}
                  >
                    <Checkbox checked={selectedTopicIds.includes(t.id)} onCheckedChange={() => {}} />
                    <span className="text-xs">{t.parentId ? `↳ ${t.name}` : t.name}</span>
                  </div>
                ))
              )}
            </PopoverContent>
          </Popover>

          {/* Section multi-select */}
          <Popover open={sectionPopoverOpen} onOpenChange={setSectionPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 text-xs gap-1">
                {selectedSectionIds.length === 0
                  ? 'Sections (optional)'
                  : `${selectedSectionIds.length} section${selectedSectionIds.length > 1 ? 's' : ''}`}
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
              <p className="text-xs font-semibold mb-1 text-gray-500">Select sections</p>
              {sections.length === 0 ? (
                <p className="text-xs text-gray-400 py-1">No sections available</p>
              ) : (
                sections.map(s => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 py-1 cursor-pointer hover:bg-gray-50 rounded px-1"
                    onClick={() => setSelectedSectionIds(prev =>
                      prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id]
                    )}
                  >
                    <Checkbox checked={selectedSectionIds.includes(s.id)} onCheckedChange={() => {}} />
                    <span className="text-xs">{s.name}</span>
                  </div>
                ))
              )}
            </PopoverContent>
          </Popover>

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

      {docs.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Input
            placeholder="Search by filename…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="h-8 w-48 text-xs"
          />
          {['ALL', ...Array.from(new Set(docs.map(d => d.fileType)))].map(type => {
            const count = type === 'ALL' ? docs.length : docs.filter(d => d.fileType === type).length
            return (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  filterType === type
                    ? 'bg-[#028a39] text-white border-[#028a39]'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-[#028a39] hover:text-[#028a39]'
                }`}
              >
                {type === 'ALL' ? 'All' : (fileTypeLabels[type] ?? type.replace(/_/g, ' '))} ({count})
              </button>
            )
          })}
          {(filterType !== 'ALL' || searchQuery) && (
            <button
              onClick={() => { setFilterType('ALL'); setSearchQuery('') }}
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      )}

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
          {(() => {
            const filteredDocs = docs.filter(d => {
              const typeMatch = filterType === 'ALL' || d.fileType === filterType
              const searchMatch = !searchQuery || d.fileName.toLowerCase().includes(searchQuery.toLowerCase())
              return typeMatch && searchMatch
            })
            if (filteredDocs.length === 0) return (
              <div className="text-center py-8 text-gray-400 text-sm">No documents match the filter.</div>
            )
            return filteredDocs.map((doc: Document) => (
            <Card key={doc.id}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <FileText className="h-8 w-8 text-gray-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{doc.fileName}</p>
                    <div className="flex gap-2 mt-1 flex-wrap items-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${fileTypeColors[doc.fileType] ?? 'bg-gray-100 text-gray-800'}`}>
                        {fileTypeLabels[doc.fileType] ?? doc.fileType.replace(/_/g, ' ')}
                      </span>
                      {doc.isManualInput && <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">Manual</span>}
                      <span className="text-xs text-gray-500">{formatFileSize(doc.fileSize)}</span>
                      <span className="text-xs text-gray-500">{formatDate(doc.uploadedAt)}</span>
                      {/* Show all topic badges */}
                      {parseJsonArr(doc.topicNames).length > 0
                        ? parseJsonArr(doc.topicNames).map((name, i) => (
                            <span key={i} className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">{name}</span>
                          ))
                        : doc.topicName && <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">{doc.topicName}</span>
                      }
                      {/* Show all section badges */}
                      {parseJsonArr(doc.sectionNames).length > 0
                        ? parseJsonArr(doc.sectionNames).map((name, i) => (
                            <span key={i} className="text-xs px-1.5 py-0.5 bg-green-50 text-green-700 rounded">{name}</span>
                          ))
                        : doc.sectionName && <span className="text-xs px-1.5 py-0.5 bg-green-50 text-green-700 rounded">{doc.sectionName}</span>
                      }
                      {doc.fileType === 'OTHER' && doc.description && <span className="text-xs text-gray-400 italic">{doc.description}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {doc.fileType === 'SAMPLE_QUESTIONS' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-purple-500 hover:text-purple-700"
                        title="Parse into individual questions"
                        onClick={() => handleParseDocument(doc.id)}
                      >
                        {parsingDocId === doc.id
                          ? <Loader2 className="h-4 w-4 animate-spin text-purple-500" />
                          : <Puzzle className="h-4 w-4" />
                        }
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-gray-400 hover:text-blue-600"
                      title="Edit tags"
                      onClick={() => {
                        setEditTagDocId(doc.id)
                        setEditTagTopics(parseJsonArr(doc.topicIds).length > 0
                          ? parseJsonArr(doc.topicIds)
                          : (doc.topicId ? [doc.topicId] : []))
                        setEditTagSections(parseJsonArr(doc.sectionIds).length > 0
                          ? parseJsonArr(doc.sectionIds)
                          : (doc.sectionId ? [doc.sectionId] : []))
                        setEditTagDesc(doc.description ?? '')
                        setEditTopicPopoverOpen(false)
                        setEditSectionPopoverOpen(false)
                      }}
                    >
                      <Tag className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-700"
                      onClick={() => handleDelete(doc.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {/* Inline tag editor */}
                {editTagDocId === doc.id && (
                  <div className="mt-3 pt-3 border-t space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Topics</Label>
                        <Popover open={editTopicPopoverOpen} onOpenChange={setEditTopicPopoverOpen}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 text-xs w-full justify-between gap-1">
                              {editTagTopics.length === 0
                                ? 'No topics'
                                : `${editTagTopics.length} topic${editTagTopics.length > 1 ? 's' : ''}`}
                              <ChevronDown className="h-3 w-3 opacity-60" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-52 p-2" align="start">
                            <p className="text-xs font-semibold mb-1 text-gray-500">Select topics</p>
                            {topics.filter(t => !t.isOverall).length === 0 ? (
                              <p className="text-xs text-gray-400 py-1">No topics available</p>
                            ) : (
                              topics.filter(t => !t.isOverall).map(t => (
                                <div
                                  key={t.id}
                                  className="flex items-center gap-2 py-1 cursor-pointer hover:bg-gray-50 rounded px-1"
                                  onClick={() => setEditTagTopics(prev =>
                                    prev.includes(t.id) ? prev.filter(x => x !== t.id) : [...prev, t.id]
                                  )}
                                >
                                  <Checkbox checked={editTagTopics.includes(t.id)} onCheckedChange={() => {}} />
                                  <span className="text-xs">{t.parentId ? `↳ ${t.name}` : t.name}</span>
                                </div>
                              ))
                            )}
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Sections</Label>
                        <Popover open={editSectionPopoverOpen} onOpenChange={setEditSectionPopoverOpen}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 text-xs w-full justify-between gap-1">
                              {editTagSections.length === 0
                                ? 'No sections'
                                : `${editTagSections.length} section${editTagSections.length > 1 ? 's' : ''}`}
                              <ChevronDown className="h-3 w-3 opacity-60" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-52 p-2" align="start">
                            <p className="text-xs font-semibold mb-1 text-gray-500">Select sections</p>
                            {sections.length === 0 ? (
                              <p className="text-xs text-gray-400 py-1">No sections available</p>
                            ) : (
                              sections.map(s => (
                                <div
                                  key={s.id}
                                  className="flex items-center gap-2 py-1 cursor-pointer hover:bg-gray-50 rounded px-1"
                                  onClick={() => setEditTagSections(prev =>
                                    prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id]
                                  )}
                                >
                                  <Checkbox checked={editTagSections.includes(s.id)} onCheckedChange={() => {}} />
                                  <span className="text-xs">{s.name}</span>
                                </div>
                              ))
                            )}
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                    {doc.fileType === 'OTHER' && (
                      <div className="space-y-1">
                        <Label className="text-xs">Description</Label>
                        <Input
                          value={editTagDesc}
                          onChange={e => setEditTagDesc(e.target.value)}
                          className="h-8 text-xs"
                          placeholder="Describe this document..."
                        />
                      </div>
                    )}
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => setEditTagDocId(null)}>Cancel</Button>
                      <Button size="sm" disabled={isSavingTag} onClick={() => handleSaveTag(doc.id)}>
                        {isSavingTag ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}Save Tags
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
          })()
          }
        </div>
      )}
    </div>
  )
}
