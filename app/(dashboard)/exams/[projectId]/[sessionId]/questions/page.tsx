'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/components/ui/use-toast'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Search, Download, Pencil, Trash2, ChevronDown, ChevronUp,
  Check, ThumbsUp, AlertCircle, RefreshCw, BookOpen, Loader2,
  FileText, Eye, Code2, CheckCircle2, Library,
} from 'lucide-react'
import { RichTextEditor } from '@/components/ui/rich-text-editor'

// ─── Types ───────────────────────────────────────────────────────────────────

type OptionExplanations = Record<string, string>

type Question = {
  id: string
  stem: string
  questionType: string
  options: string[] | null
  correctAnswer: string | null
  markingScheme: string | null
  modelAnswer: string | null
  topic: string | null
  difficulty: string
  status: string
  marks: number
  section: { id: string; name: string }
  // New fields
  optionExplanations: OptionExplanations | null
  syllabusCode: string | null
  regulationRefs: string | null
  generatedBy: string | null
  createdAt: string
}

function resolveModelLabel(generatedBy: string | null): string {
  if (!generatedBy) return ''
  const labelMap: Record<string, string> = {
    'claudible:1': 'Claudible (default)',
    'claudible:2': 'Claudible (model2)',
    'anthropic:1': 'Anthropic (model1)',
    'anthropic:2': 'Anthropic (model2)',
    'deepseek:deepseek-reasoner': 'DeepSeek Reasoner',
  }
  if (labelMap[generatedBy]) return labelMap[generatedBy]
  return generatedBy.split(':').pop() || generatedBy
}

function formatQuestionTime(dateStr: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

const difficultyColor: Record<string, string> = {
  EASY: 'bg-green-100 text-green-800',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  HARD: 'bg-red-100 text-red-800',
}

const statusConfig: Record<string, { label: string; className: string }> = {
  APPROVED: { label: 'Approved', className: 'bg-green-50 text-green-700 border-green-200' },
  NEEDS_REVIEW: { label: 'Review', className: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  REJECTED: { label: 'Rejected', className: 'bg-red-50 text-red-700 border-red-200' },
}

// ─── HTML Preview Component ───────────────────────────────────────────────────
function HtmlContent({ html }: { html: string }) {
  if (!html) return null
  // If it looks like HTML (contains tags), render it; otherwise render as plain text
  const isHtml = /<[a-z][\s\S]*>/i.test(html)
  if (isHtml) {
    return (
      <div
        className="prose prose-sm max-w-none text-xs [&_table]:border-collapse [&_table]:w-full [&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-100 [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-gray-200 [&_td]:px-2 [&_td]:py-1 [&_strong]:font-semibold"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    )
  }
  return <p className="text-xs whitespace-pre-wrap">{html}</p>
}

// ─── HTML Editor (now uses RichTextEditor for WYSIWYG editing) ───────────────
function HtmlEditor({
  label,
  value,
  onChange,
  placeholder,
  editorKey,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  editorKey?: string
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-semibold">{label}</Label>
      <RichTextEditor
        key={editorKey}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={4}
      />
    </div>
  )
}

// ─── Smart answer renderer: markdown/plain → HTML ────────────────────────────
function renderAnswerContent(text: string): string {
  if (!text) return ''

  if (/<[a-z][\s\S]*>/i.test(text)) return text

  const lines = text.split('\n').map(l => l.trimEnd())

  const tableLines = lines.filter(l => l.startsWith('|'))
  if (tableLines.length >= 3) {
    let html = '<table class="calc-table w-full border-collapse text-xs my-2">'
    let isFirstRow = true
    for (const line of tableLines) {
      if (/^\|[-| :]+\|$/.test(line)) { isFirstRow = false; continue }
      const cells = line.replace(/^\||\|$/g, '').split('|').map(c => c.trim())
      if (isFirstRow) {
        html += '<thead><tr>' + cells.map(c => `<th class="border border-gray-300 bg-gray-100 px-2 py-1 text-left">${c}</th>`).join('') + '</tr></thead>'
        isFirstRow = false
      } else {
        html += '<tr>' + cells.map(c => `<td class="border border-gray-200 px-2 py-1">${c}</td>`).join('') + '</tr>'
      }
    }
    html += '</table>'
    const nonTableLines = lines.filter(l => !l.startsWith('|') && l.trim())
    if (nonTableLines.length > 0) {
      html += '<p class="text-xs mt-1">' + nonTableLines.join('<br>') + '</p>'
    }
    return html
  }

  const calcPattern = /^.{2,80}=.+\([\d.]+\s*(mk|mark|marks)\)/i
  const calcLines = lines.filter(l => calcPattern.test(l))
  if (calcLines.length >= 2) {
    let html = '<table class="calc-table w-full border-collapse text-xs my-2"><tbody>'
    for (const line of lines.filter(l => l.trim())) {
      const m3 = line.match(/^(.*?)\s*=\s*(.*?)\s*=\s*([^(=]+)\s*\(([\d.]+\s*(?:mk|marks?))\)/i)
      if (m3) {
        html += `<tr><td class="border border-gray-200 px-2 py-1">${m3[1]}</td><td class="border border-gray-200 px-2 py-1 font-mono">${m3[2]}</td><td class="border border-gray-200 px-2 py-1 font-semibold">${m3[3].trim()}</td><td class="border border-gray-200 px-2 py-1 text-right text-blue-700 font-medium">${m3[4]}</td></tr>`
        continue
      }
      const m2 = line.match(/^(.*?)\s*=\s*([^(]+)\s*\(([\d.]+\s*(?:mk|marks?))\)/i)
      if (m2) {
        html += `<tr><td class="border border-gray-200 px-2 py-1">${m2[1]}</td><td class="border border-gray-200 px-2 py-1"></td><td class="border border-gray-200 px-2 py-1 font-semibold">${m2[2].trim()}</td><td class="border border-gray-200 px-2 py-1 text-right text-blue-700 font-medium">${m2[3]}</td></tr>`
        continue
      }
      html += `<tr><td class="border border-gray-200 px-2 py-1" colspan="4">${line}</td></tr>`
    }
    html += '</tbody></table>'
    return html
  }

  const result = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>')

  return `<div class="text-xs">${result}</div>`
}

// ─── Option letter badge ──────────────────────────────────────────────────────
function OptionBadge({ letter, isCorrect }: { letter: string; isCorrect: boolean }) {
  return (
    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 ${isCorrect ? 'bg-[#028a39] text-white' : 'bg-gray-200 text-gray-600'}`}>
      {letter}
    </span>
  )
}

// ─── Export Word helper ───────────────────────────────────────────────────────
async function exportToWord(questions: Question[], filename = 'questions') {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle } = await import('docx')

  const children: any[] = []

  children.push(
    new Paragraph({
      text: 'Question Bank',
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 300 },
    })
  )

  questions.forEach((q, idx) => {
    // Question number + stem
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `Question ${idx + 1}`, bold: true, size: 24 }),
          new TextRun({ text: ` [${q.questionType.replace(/_/g, ' ')}] [${q.difficulty}] [${q.marks}mk]`, size: 20, color: '666666' }),
        ],
        spacing: { before: 300, after: 100 },
      })
    )

    // Strip basic HTML tags for stem
    const stripHtml = (h: string) => h.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()

    children.push(
      new Paragraph({
        children: [new TextRun({ text: stripHtml(q.stem), size: 22 })],
        spacing: { after: 150 },
      })
    )

    // Options (MCQ)
    if (q.options && q.options.length > 0) {
      q.options.forEach((opt, i) => {
        const letter = String.fromCharCode(65 + i)
        const isCorrect = opt === q.correctAnswer
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: `${letter}. `, bold: isCorrect, color: isCorrect ? '028a39' : '000000', size: 20 }),
              new TextRun({ text: opt, bold: isCorrect, color: isCorrect ? '028a39' : '000000', size: 20 }),
              ...(isCorrect ? [new TextRun({ text: ' ✓', bold: true, color: '028a39', size: 20 })] : []),
            ],
            spacing: { after: 60 },
            indent: { left: 400 },
          })
        )
      })
    }

    // Correct answer for non-MCQ
    if (!q.options && q.correctAnswer) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: 'Answer: ', bold: true, size: 20, color: '028a39' }),
            new TextRun({ text: q.correctAnswer, size: 20 }),
          ],
          spacing: { before: 100, after: 100 },
        })
      )
    }

    // Model answer
    if (q.modelAnswer) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: 'Model Answer:', bold: true, size: 20 })],
          spacing: { before: 150, after: 60 },
        })
      )
      children.push(
        new Paragraph({
          children: [new TextRun({ text: stripHtml(q.modelAnswer), size: 18 })],
          spacing: { after: 60 },
          indent: { left: 400 },
        })
      )
    }

    // Syllabus codes + refs
    const meta: string[] = []
    if (q.syllabusCode) meta.push(`Syllabus: ${q.syllabusCode}`)
    if (q.regulationRefs) meta.push(`Ref: ${q.regulationRefs}`)
    if (q.topic) meta.push(`Topic: ${q.topic}`)
    if (meta.length > 0) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: meta.join(' | '), size: 16, color: '888888', italics: true })],
          spacing: { before: 80, after: 200 },
        })
      )
    }

    // Divider
    children.push(
      new Paragraph({
        children: [new TextRun({ text: '─'.repeat(60), size: 14, color: 'cccccc' })],
        spacing: { after: 100 },
      })
    )
  })

  const doc = new Document({
    sections: [{ children }],
  })

  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.docx`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ExamQuestionsPage() {
  const params = useParams()
  const { toast } = useToast()
  const [questions, setQuestions] = useState<Question[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sectionFilter, setSectionFilter] = useState('all')
  const [difficultyFilter, setDifficultyFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showAnswerId, setShowAnswerId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<Question>>({})
  const [allTopics, setAllTopics] = useState<{id: string; name: string; parentId: string | null}[]>([])
  const [topicFilter, setTopicFilter] = useState('all')
  // Regenerate state
  const [regenId, setRegenId] = useState<string | null>(null)
  const [regenInstructions, setRegenInstructions] = useState('')
  const [isRegenerating, setIsRegenerating] = useState(false)
  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isExportingWord, setIsExportingWord] = useState(false)
  // Add to Sample
  const [addingToSampleId, setAddingToSampleId] = useState<string | null>(null)

  useEffect(() => {
    fetchQuestions()
  }, [])

  const fetchQuestions = async () => {
    setIsLoading(true)
    try {
      const [qRes, topicRes] = await Promise.all([
        fetch(`/api/sessions/${params.sessionId}/questions`),
        fetch(`/api/sessions/${params.sessionId}/topics`),
      ])
      if (qRes.ok) setQuestions(await qRes.json())
      if (topicRes.ok) {
        const data = await topicRes.json()
        setAllTopics(data.filter((t: any) => !t.isOverall).map((t: any) => ({ id: t.id, name: t.name, parentId: t.parentId ?? null })))
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async (id: string) => {
    try {
      const res = await fetch(`/api/sessions/${params.sessionId}/questions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...updated } : q)))
      setEditingId(null)
      toast({ title: 'Question updated' })
    } catch {
      toast({ title: 'Failed to update', variant: 'destructive' })
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this question?')) return
    const res = await fetch(`/api/sessions/${params.sessionId}/questions/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setQuestions((prev) => prev.filter((q) => q.id !== id))
      toast({ title: 'Question deleted' })
    }
  }

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'APPROVED' ? 'NEEDS_REVIEW' : 'APPROVED'
    const res = await fetch(`/api/sessions/${params.sessionId}/questions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) {
      setQuestions((prev) => prev.map((q) => q.id === id ? { ...q, status: newStatus } : q))
    }
  }

  const handleRegenerate = async () => {
    if (!regenId) return
    const q = questions.find(x => x.id === regenId)
    if (!q) return
    setIsRegenerating(true)
    try {
      const res = await fetch(`/api/sessions/${params.sessionId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sections: [{ sectionId: q.section.id, count: 1 }],
          extraInstructions: `Regenerate question to replace existing question "${q.stem.slice(0, 100)}". ${regenInstructions}`,
          replaceQuestionId: regenId,
        }),
      })
      if (res.ok && res.body) {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value)
          for (const line of chunk.split('\n')) {
            if (line.startsWith('data: ') && line.slice(6) !== '[DONE]') {
              try {
                const newQ = JSON.parse(line.slice(6))
                if (newQ.id) {
                  await fetch(`/api/sessions/${params.sessionId}/questions/${regenId}`, { method: 'DELETE' })
                  setQuestions(prev => prev.map(x => x.id === regenId ? { ...x, ...newQ } : x))
                  setRegenId(null)
                  setRegenInstructions('')
                  toast({ title: 'Question regenerated' })
                }
              } catch {}
            }
          }
        }
      }
    } catch { toast({ title: 'Regeneration failed', variant: 'destructive' }) }
    finally { setIsRegenerating(false) }
  }

  const handleBulkApprove = async () => {
    for (const id of Array.from(selectedIds)) {
      await fetch(`/api/sessions/${params.sessionId}/questions/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'APPROVED' }),
      })
    }
    setQuestions(prev => prev.map(q => selectedIds.has(q.id) ? { ...q, status: 'APPROVED' } : q))
    const count = selectedIds.size
    setSelectedIds(new Set())
    toast({ title: `${count} questions approved` })
  }

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.size} questions?`)) return
    for (const id of Array.from(selectedIds)) {
      await fetch(`/api/sessions/${params.sessionId}/questions/${id}`, { method: 'DELETE' })
    }
    setQuestions(prev => prev.filter(q => !selectedIds.has(q.id)))
    const count = selectedIds.size
    setSelectedIds(new Set())
    toast({ title: `${count} questions deleted` })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(q => q.id)))
    }
  }

  const handleAddToSample = async (q: Question) => {
    setAddingToSampleId(q.id)
    try {
      const res = await fetch(`/api/sessions/${params.sessionId}/parsed-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: q.stem,
          answer: [q.markingScheme, q.modelAnswer].filter(Boolean).join('\n\n'),
          questionType: q.questionType === 'SCENARIO' ? 'SCENARIO' : q.questionType === 'SHORT_ANSWER' ? 'SHORT_ANSWER' : q.questionType === 'ESSAY' ? 'ESSAY' : 'OTHER',
          difficulty: q.difficulty,
          topicName: q.topic,
          sectionId: q.section?.id ?? null,
          sectionName: q.section?.name ?? null,
          syllabusCode: q.syllabusCode,
          isManual: true,
        }),
      })
      if (!res.ok) throw new Error()
      toast({ title: 'Added to Samples' })
    } catch {
      toast({ title: 'Failed to add to samples', variant: 'destructive' })
    } finally {
      setAddingToSampleId(null)
    }
  }

  const handleExportJSON = async () => {
    const res = await fetch(`/api/sessions/${params.sessionId}/questions?format=json`)
    if (!res.ok) return
    const data = await res.json()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'questions.json'
    a.click()
  }

  const handleExportWord = async () => {
    setIsExportingWord(true)
    try {
      const toExport = selectedIds.size > 0
        ? filtered.filter(q => selectedIds.has(q.id))
        : filtered
      await exportToWord(toExport, 'question-bank')
      toast({ title: `Exported ${toExport.length} questions to Word` })
    } catch (e) {
      toast({ title: 'Word export failed', variant: 'destructive' })
    } finally {
      setIsExportingWord(false)
    }
  }

  // Unique sections from questions
  const allSections = Array.from(new Set(questions.map((q) => q.section?.id))).map((id) => {
    const q = questions.find((q) => q.section?.id === id)
    return { id: id || '', name: q?.section?.name || 'Unknown' }
  })

  const filtered = questions.filter((q) => {
    if (search && !q.stem.toLowerCase().includes(search.toLowerCase())) return false
    if (sectionFilter !== 'all' && q.section?.id !== sectionFilter) return false
    if (difficultyFilter !== 'all' && q.difficulty !== difficultyFilter) return false
    if (statusFilter !== 'all' && q.status !== statusFilter) return false
    if (topicFilter !== 'all') {
      const topicName = allTopics.find(t => t.id === topicFilter)?.name
      if (!topicName || q.topic !== topicName) return false
    }
    return true
  })

  // ── Render answer panel for a question ────────────────────────────────────
  const renderAnswerPanel = (q: Question) => {
    const letters = ['A', 'B', 'C', 'D', 'E']
    const optExpls = q.optionExplanations as OptionExplanations | null

    // Determine correct option letter for MCQ
    const correctLetter = q.options && q.correctAnswer
      ? letters[q.options.indexOf(q.correctAnswer)] || null
      : null

    return (
      <div className="border-l-4 border-[#028a39] pl-4 mt-2 space-y-4 text-sm">

        {/* MCQ Options with explanations */}
        {q.options && q.options.length > 0 && (
          <div className="space-y-1.5">
            {q.options.map((opt, i) => {
              const letter = letters[i]
              const isCorrect = opt === q.correctAnswer
              const explanation = optExpls?.[letter]
              return (
                <div
                  key={i}
                  className={`p-2 rounded text-xs border ${isCorrect ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}
                >
                  <div className="flex items-start gap-2">
                    <span className={`font-bold shrink-0 ${isCorrect ? 'text-green-700' : 'text-gray-500'}`}>
                      {isCorrect ? '✓' : '✗'} {letter}.
                    </span>
                    <div>
                      <span className={`font-medium ${isCorrect ? 'text-green-800' : 'text-gray-700'}`}>{opt}</span>
                      {explanation && (
                        <p className={`mt-0.5 ${isCorrect ? 'text-green-700' : 'text-gray-500'}`}>{explanation}</p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Worked Solution */}
        {q.modelAnswer && (
          <div className="p-3 bg-amber-50 border border-amber-100 rounded">
            <p className="text-xs font-semibold mb-2 text-amber-900 flex items-center gap-1">
              <BookOpen className="h-3 w-3" />Worked Solution
            </p>
            <div
              className="text-amber-900 text-xs [&_table]:border-collapse [&_table]:w-full [&_th]:border [&_th]:border-amber-200 [&_th]:bg-amber-100 [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-amber-100 [&_td]:px-2 [&_td]:py-1"
              dangerouslySetInnerHTML={{ __html: renderAnswerContent(q.modelAnswer) }}
            />
          </div>
        )}

        {/* Syllabus codes + refs */}
        {(q.syllabusCode || q.regulationRefs) && (
          <div className="mt-3 pt-3 border-t border-gray-200 flex flex-wrap gap-2 items-center">
            {q.syllabusCode && (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Syllabus tested:</span>
                {q.syllabusCode.split(/[,;]/).map(code => code.trim()).filter(Boolean).map(code => (
                  <span key={code} className="inline-block bg-green-50 text-green-800 border border-green-300 rounded px-2 py-0.5 text-xs font-semibold">
                    {code}
                  </span>
                ))}
              </div>
            )}
            {q.regulationRefs && (
              <span className="text-xs text-gray-400 italic">📋 {q.regulationRefs}</span>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Render edit panel ─────────────────────────────────────────────────────
  const renderEditPanel = (q: Question) => (
    <div className="space-y-3">
      <HtmlEditor
        label="Question Stem"
        value={editForm.stem || ''}
        onChange={(v) => setEditForm({ ...editForm, stem: v })}
        placeholder="Question stem..."
        editorKey={`stem-${q.id}`}
      />
      {q.options && (
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Options</Label>
          {(editForm.options || q.options).map((opt: string, i: number) => (
            <Input key={i} value={opt} onChange={(e) => {
              const opts = [...(editForm.options || q.options || [])]
              opts[i] = e.target.value
              setEditForm({ ...editForm, options: opts })
            }} placeholder={`Option ${String.fromCharCode(65 + i)}`} />
          ))}
          <Input value={editForm.correctAnswer || ''} onChange={(e) => setEditForm({ ...editForm, correctAnswer: e.target.value })} placeholder="Correct answer (exact option text)" />
        </div>
      )}
      <HtmlEditor
        label="Marking Scheme"
        value={editForm.markingScheme || ''}
        onChange={(v) => setEditForm({ ...editForm, markingScheme: v })}
        placeholder="Marking scheme..."
        editorKey={`marking-${q.id}`}
      />
      <HtmlEditor
        label="Model Answer"
        value={editForm.modelAnswer || ''}
        onChange={(v) => setEditForm({ ...editForm, modelAnswer: v })}
        placeholder="Full model answer with working..."
        editorKey={`model-${q.id}`}
      />
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Syllabus Code</Label>
          <Input
            value={(editForm as any).syllabusCode || q.syllabusCode || ''}
            onChange={(e) => setEditForm({ ...editForm, syllabusCode: e.target.value } as any)}
            placeholder="e.g. C2d, C2n"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Regulation Refs</Label>
          <Input
            value={(editForm as any).regulationRefs || q.regulationRefs || ''}
            onChange={(e) => setEditForm({ ...editForm, regulationRefs: e.target.value } as any)}
            placeholder="e.g. Article 9, Decree ..."
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
        <Button size="sm" className="bg-[#028a39] hover:bg-[#026d2d]" onClick={() => handleSave(q.id)}>
          <Check className="h-4 w-4 mr-1" />Save
        </Button>
      </div>
    </div>
  )

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">Question Bank</h2>
          <p className="text-sm text-gray-500">{filtered.length} of {questions.length} questions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportWord} disabled={isExportingWord}>
            {isExportingWord ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
            Export Word{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportJSON}>
            <Download className="h-4 w-4 mr-2" />
            Export JSON
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search questions..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={sectionFilter} onValueChange={setSectionFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Section" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sections</SelectItem>
            {allSections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Difficulty" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="EASY">Easy</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="HARD">Hard</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="NEEDS_REVIEW">Needs Review</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
          </SelectContent>
        </Select>
        {allTopics.length > 0 && (
          <Select value={topicFilter} onValueChange={setTopicFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Topic" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All topics</SelectItem>
              {allTopics.filter(t => !t.parentId).map(root => (
                <SelectItem key={root.id} value={root.id}>{root.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-500">No questions found</div>
      ) : (
        <div className="space-y-2">
          {/* Bulk action bar */}
          <div className="flex items-center gap-3 mb-2">
            <Checkbox
              checked={selectedIds.size === filtered.length && filtered.length > 0}
              onCheckedChange={toggleSelectAll}
              className="shrink-0"
            />
            <span className="text-xs text-gray-500">{selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}</span>
          </div>

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg mb-2">
              <span className="text-sm font-medium">{selectedIds.size} selected</span>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleBulkApprove}>Approve All</Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleExportWord} disabled={isExportingWord}>
                {isExportingWord ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <FileText className="h-3 w-3 mr-1" />}Export Word
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs text-red-600" onClick={handleBulkDelete}>Delete Selected</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}>Clear</Button>
            </div>
          )}

          {filtered.map((q, qIdx) => (
            <Card key={q.id} className="overflow-hidden">
              {/* Question header row */}
              <div className="p-4 flex items-start justify-between gap-2">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <Checkbox
                    checked={selectedIds.has(q.id)}
                    onCheckedChange={v => {
                      setSelectedIds(prev => {
                        const next = new Set(prev)
                        v ? next.add(q.id) : next.delete(q.id)
                        return next
                      })
                    }}
                    className="mt-1 shrink-0"
                    onClick={e => e.stopPropagation()}
                  />
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-gray-400 shrink-0 mt-0.5">Q{qIdx + 1}</span>
                      <p className="text-sm font-medium line-clamp-2">
                        {q.stem.replace(/^Case:[\s\S]*?Question:\s*/i, '').trim() || q.stem}
                      </p>
                    </div>
                    <div className="flex gap-2 mt-1 flex-wrap pl-5">
                      <span className="text-xs text-gray-400">{q.section?.name}</span>
                      <Badge variant="outline" className="text-xs py-0">{q.questionType.replace(/_/g, ' ')}</Badge>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${difficultyColor[q.difficulty]}`}>{q.difficulty}</span>
                      <span className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded font-medium">
                        {q.marks} mk
                      </span>
                      {q.topic && <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{q.topic}</span>}
                      {q.syllabusCode && (
                        <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded font-mono border border-purple-100">
                          {q.syllabusCode.split(/[,;]/)[0].trim()}
                        </span>
                      )}
                      {q.generatedBy && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-mono">
                          {resolveModelLabel(q.generatedBy)}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">{formatQuestionTime(q.createdAt)}</span>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleStatus(q.id, q.status) }}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs border ${(statusConfig[q.status] ?? statusConfig['NEEDS_REVIEW']).className}`}
                  >
                    {q.status === 'APPROVED' ? <ThumbsUp className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                    {(statusConfig[q.status] ?? statusConfig['NEEDS_REVIEW']).label}
                  </button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Regenerate" onClick={(e) => { e.stopPropagation(); setRegenId(q.id); setRegenInstructions('') }}>
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                  <Button
                    size="icon" variant="ghost" className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditingId(q.id)
                      setEditForm(q)
                      setExpandedId(q.id)
                      setShowAnswerId(null)
                    }}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    size="icon" variant="ghost" className="h-7 w-7 text-purple-500"
                    title="Add to Samples"
                    onClick={(e) => { e.stopPropagation(); handleAddToSample(q) }}
                    disabled={addingToSampleId === q.id}
                  >
                    {addingToSampleId === q.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Library className="h-3 w-3" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={(e) => { e.stopPropagation(); handleDelete(q.id) }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                  <button onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}>
                    {expandedId === q.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Expanded content */}
              {expandedId === q.id && (
                <div className="border-t p-4 bg-gray-50">
                  {editingId === q.id ? (
                    renderEditPanel(q)
                  ) : (
                    <div className="space-y-3 text-sm">
                      {/* Full stem — HTML-aware, splits Case/Question if present */}
                      {(() => {
                        const stem = q.stem
                        const caseContent = stem.match(/^Case:\s*([\s\S]*?)(?=\n\s*Question:)/i)?.[1]?.trim()
                        const questionContent = stem.match(/(?:^|\n)\s*Question:\s*([\s\S]*)/i)?.[1]?.trim()
                        const htmlClass = 'prose prose-sm max-w-none [&_table]:border-collapse [&_table]:w-full [&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-100 [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-gray-200 [&_td]:px-2 [&_td]:py-1 [&_p]:mb-1'
                        if (caseContent !== undefined || questionContent !== undefined) {
                          return (
                            <div className="space-y-3">
                              {caseContent !== undefined && (
                                <div>
                                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Case</span>
                                  <div className={`mt-1 ${htmlClass}`} dangerouslySetInnerHTML={{ __html: caseContent || '' }} />
                                </div>
                              )}
                              {questionContent !== undefined && (
                                <p className="font-semibold text-sm mt-2">
                                  <span className="text-[#028a39] font-bold">Question: </span>
                                  <span>{questionContent}</span>
                                </p>
                              )}
                            </div>
                          )
                        }
                        return <div className={htmlClass} dangerouslySetInnerHTML={{ __html: stem }} />
                      })()}

                      {/* Show Answer toggle */}
                      <button
                        onClick={() => setShowAnswerId(showAnswerId === q.id ? null : q.id)}
                        className="flex items-center gap-2 text-xs font-medium text-[#028a39] hover:text-[#026d2d] transition-colors"
                      >
                        {showAnswerId === q.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        {showAnswerId === q.id ? 'Hide' : 'Show'} Answer &amp; Explanations
                      </button>

                      {showAnswerId === q.id && renderAnswerPanel(q)}
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Regenerate Dialog */}
      <Dialog open={!!regenId} onOpenChange={v => !v && setRegenId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Regenerate Question</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-500">Generate a new question to replace this one.</p>
            <div className="space-y-1">
              <Label className="text-xs">Specific instructions (optional)</Label>
              <Textarea value={regenInstructions} onChange={e => setRegenInstructions(e.target.value)} className="h-20 text-sm" placeholder="e.g. Make it harder, focus on transfer pricing..." />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setRegenId(null)}>Cancel</Button>
              <Button size="sm" className="bg-[#028a39] hover:bg-[#026d2d]" onClick={handleRegenerate} disabled={isRegenerating}>
                {isRegenerating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}Regenerate
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
