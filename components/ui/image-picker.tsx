'use client'

import { useState, useRef } from 'react'
import { Button } from './button'
import { Input } from './input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs'
import { Loader2, Upload, Wand2, Search, X, ImageIcon } from 'lucide-react'

interface ImagePickerProps {
  value?: string
  onChange: (url: string | null) => void
  className?: string
}

export function ImagePicker({ value, onChange, className }: ImagePickerProps) {
  const [tab, setTab] = useState<'upload' | 'ai' | 'unsplash'>('upload')
  const [aiPrompt, setAiPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [aiError, setAiError] = useState('')
  const [unsplashQuery, setUnsplashQuery] = useState('')
  const [unsplashPhotos, setUnsplashPhotos] = useState<{ id: string; thumb: string; full: string; alt: string; author: string; authorLink: string }[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [unsplashError, setUnsplashError] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (file: File) => {
    setIsUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/upload-image', { method: 'POST', body: form })
      if (!res.ok) throw new Error('Upload failed')
      const data = await res.json()
      onChange(data.url)
    } catch {
      // silent — keep current value
    } finally {
      setIsUploading(false)
    }
  }

  const handleGenerateAI = async () => {
    if (!aiPrompt.trim()) return
    setIsGenerating(true)
    setAiError('')
    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Generation failed')
      onChange(data.url)
    } catch (e: any) {
      setAiError(e.message || 'Image generation failed')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleUnsplashSearch = async () => {
    if (!unsplashQuery.trim()) return
    setIsSearching(true)
    setUnsplashError('')
    try {
      const res = await fetch(`/api/unsplash-search?query=${encodeURIComponent(unsplashQuery)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Search failed')
      setUnsplashPhotos(data.photos || [])
    } catch (e: any) {
      setUnsplashError(e.message || 'Search failed')
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <div className={className}>
      {value ? (
        <div className="relative mb-3 inline-block">
          <img src={value} alt="Selected" className="h-36 w-auto rounded-lg object-cover border" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute -top-2 -right-2 rounded-full bg-destructive text-destructive-foreground w-6 h-6 flex items-center justify-center shadow-sm"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
          <ImageIcon className="h-4 w-4" />
          <span>No image selected</span>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="h-8">
          <TabsTrigger value="upload" className="text-xs px-3">Upload</TabsTrigger>
          <TabsTrigger value="ai" className="text-xs px-3">AI Generate</TabsTrigger>
          <TabsTrigger value="unsplash" className="text-xs px-3">Unsplash</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="mt-3">
          <div
            className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            {isUploading ? (
              <Loader2 className="h-5 w-5 animate-spin mx-auto" />
            ) : (
              <>
                <Upload className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Click to upload an image</p>
              </>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f) }}
          />
        </TabsContent>

        <TabsContent value="ai" className="mt-3 space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder="Describe the image to generate..."
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerateAI()}
              className="text-sm h-8"
            />
            <Button size="sm" onClick={handleGenerateAI} disabled={isGenerating || !aiPrompt.trim()} className="h-8 px-3">
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            </Button>
          </div>
          {aiError && <p className="text-xs text-destructive">{aiError}</p>}
        </TabsContent>

        <TabsContent value="unsplash" className="mt-3 space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder="Search Unsplash photos..."
              value={unsplashQuery}
              onChange={(e) => setUnsplashQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleUnsplashSearch()}
              className="text-sm h-8"
            />
            <Button size="sm" onClick={handleUnsplashSearch} disabled={isSearching || !unsplashQuery.trim()} className="h-8 px-3">
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          {unsplashError && <p className="text-xs text-destructive">{unsplashError}</p>}
          {unsplashPhotos.length > 0 && (
            <div className="grid grid-cols-3 gap-2 max-h-60 overflow-y-auto">
              {unsplashPhotos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onChange(p.full)}
                  className="relative aspect-video rounded overflow-hidden border hover:ring-2 ring-primary transition-all"
                  title={p.alt}
                >
                  <img src={p.thumb} alt={p.alt} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
