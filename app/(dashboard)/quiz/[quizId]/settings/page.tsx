'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { Save, Loader2, Globe, Lock, Mail, Copy, ExternalLink } from 'lucide-react'

type QuizSettings = {
  title: string
  description: string
  status: string
  introText: string
  conclusionText: string
  passMessage: string
  failMessage: string
  language: string
  // Question settings
  questionsPerAttempt: number
  randomizeQuestions: boolean
  displayMode: string
  allowBlankAnswers: boolean
  penalizeIncorrect: boolean
  // Review settings
  passMark: number
  showScore: boolean
  showOutline: boolean
  showAnswers: boolean
  showCorrectAnswers: boolean
  // Access
  access: string
  passcode: string
  allowedEmails: string
  identifyBy: string
  customIdentifierPrompt: string
  // Time & limits
  timeLimitMinutes: number | null
  maxAttempts: number | null
  expiresAt: string
  // Anti-cheat
  disableRightClick: boolean
  disableCopyPaste: boolean
  disableTranslate: boolean
  disablePrint: boolean
  // Notifications
  notificationEmail: string
  shareCode: string
}

const DEFAULTS: QuizSettings = {
  title: '',
  description: '',
  status: 'DRAFT',
  introText: '',
  conclusionText: '',
  passMessage: '',
  failMessage: '',
  language: 'en',
  questionsPerAttempt: 20,
  randomizeQuestions: true,
  displayMode: 'ONE_AT_ONCE',
  allowBlankAnswers: false,
  penalizeIncorrect: false,
  passMark: 50,
  showScore: true,
  showOutline: true,
  showAnswers: true,
  showCorrectAnswers: true,
  access: 'PUBLIC',
  passcode: '',
  allowedEmails: '',
  identifyBy: 'EMAIL',
  customIdentifierPrompt: '',
  timeLimitMinutes: null,
  maxAttempts: null,
  expiresAt: '',
  disableRightClick: false,
  disableCopyPaste: false,
  disableTranslate: false,
  disablePrint: false,
  notificationEmail: '',
  shareCode: '',
}

export default function QuizSettingsPage() {
  const params = useParams()
  const { toast } = useToast()
  const [settings, setSettings] = useState<QuizSettings>(DEFAULTS)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/quiz-sets/${params.quizId}`)
      if (res.ok) {
        const data = await res.json()
        setSettings({
          title: data.title ?? '',
          description: data.description ?? '',
          status: data.status ?? 'DRAFT',
          introText: data.introText ?? '',
          conclusionText: data.conclusionText ?? '',
          passMessage: data.passMessage ?? '',
          failMessage: data.failMessage ?? '',
          language: data.language ?? 'en',
          questionsPerAttempt: data.questionsPerAttempt ?? 20,
          randomizeQuestions: data.randomizeQuestions ?? true,
          displayMode: data.displayMode ?? 'ONE_AT_ONCE',
          allowBlankAnswers: data.allowBlankAnswers ?? false,
          penalizeIncorrect: data.penalizeIncorrect ?? false,
          passMark: data.passMark ?? 50,
          showScore: data.showScore ?? true,
          showOutline: data.showOutline ?? true,
          showAnswers: data.showAnswers ?? true,
          showCorrectAnswers: data.showCorrectAnswers ?? true,
          access: data.access ?? 'PUBLIC',
          passcode: data.passcode ?? '',
          allowedEmails: data.allowedEmails ?? '',
          identifyBy: data.identifyBy ?? 'EMAIL',
          customIdentifierPrompt: data.customIdentifierPrompt ?? '',
          timeLimitMinutes: data.timeLimitMinutes ?? null,
          maxAttempts: data.maxAttempts ?? null,
          expiresAt: data.expiresAt ? new Date(data.expiresAt).toISOString().slice(0, 16) : '',
          disableRightClick: data.disableRightClick ?? false,
          disableCopyPaste: data.disableCopyPaste ?? false,
          disableTranslate: data.disableTranslate ?? false,
          disablePrint: data.disablePrint ?? false,
          notificationEmail: data.notificationEmail ?? '',
          shareCode: data.shareCode ?? '',
        })
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const body = {
        ...settings,
        timeLimitMinutes: settings.timeLimitMinutes || null,
        maxAttempts: settings.maxAttempts || null,
        expiresAt: settings.expiresAt || null,
      }
      const res = await fetch(`/api/quiz-sets/${params.quizId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      toast({ title: 'Settings saved' })
    } catch {
      toast({ title: 'Failed to save settings', variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const set = (key: keyof QuizSettings, value: unknown) =>
    setSettings((prev) => ({ ...prev, [key]: value }))

  const shareUrl = typeof window !== 'undefined' && settings.shareCode
    ? `${window.location.origin}/q/${settings.shareCode}`
    : ''

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Quiz Settings</h1>
          <p className="text-sm text-gray-500">{settings.title}</p>
        </div>
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-[#028a39] hover:bg-[#026d2e] text-white"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save Settings
        </Button>
      </div>

      {/* Basic */}
      <Card className="mb-4">
        <CardHeader><CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Basic</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-2">
              <Label>Test Name</Label>
              <Input value={settings.title} onChange={(e) => set('title', e.target.value)} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Description (internal only)</Label>
              <Input value={settings.description} onChange={(e) => set('description', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={settings.status} onValueChange={(v) => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="OPEN">Open</SelectItem>
                  <SelectItem value="CLOSED">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Interface Language</Label>
              <Select value={settings.language} onValueChange={(v) => set('language', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="vi">Vietnamese</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Introduction (shown before test starts)</Label>
            <Textarea
              rows={3}
              placeholder="Welcome to this quiz. Read all questions carefully before answering."
              value={settings.introText}
              onChange={(e) => set('introText', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Conclusion Text (shown after submission)</Label>
            <Textarea
              rows={2}
              placeholder="Thank you for completing this quiz."
              value={settings.conclusionText}
              onChange={(e) => set('conclusionText', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Questions */}
      <Card className="mb-4">
        <CardHeader><CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Questions</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Questions per attempt</Label>
              <Input
                type="number"
                min={1}
                value={settings.questionsPerAttempt}
                onChange={(e) => set('questionsPerAttempt', Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Display mode</Label>
              <Select value={settings.displayMode} onValueChange={(v) => set('displayMode', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ONE_AT_ONCE">One at a time</SelectItem>
                  <SelectItem value="ALL_AT_ONCE">All on one page</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            {[
              { key: 'randomizeQuestions', label: 'Randomize question order for each attempt' },
              { key: 'allowBlankAnswers', label: 'Allow blank / empty answers' },
              { key: 'penalizeIncorrect', label: 'Penalize incorrect answers (negative marking)' },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <Checkbox
                  id={key}
                  checked={settings[key as keyof QuizSettings] as boolean}
                  onCheckedChange={(c) => set(key as keyof QuizSettings, c)}
                />
                <Label htmlFor={key} className="font-normal">{label}</Label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Review / After submission */}
      <Card className="mb-4">
        <CardHeader><CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">After Submission</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Passing score (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={settings.passMark}
              onChange={(e) => set('passMark', Number(e.target.value))}
              className="w-32"
            />
          </div>
          <div className="space-y-2">
            {[
              { key: 'showScore', label: 'Show score to student' },
              { key: 'showOutline', label: 'Show test outline (per-question result)' },
              { key: 'showCorrectAnswers', label: 'Show correct answers' },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <Checkbox
                  id={key}
                  checked={settings[key as keyof QuizSettings] as boolean}
                  onCheckedChange={(c) => set(key as keyof QuizSettings, c)}
                />
                <Label htmlFor={key} className="font-normal">{label}</Label>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Pass message</Label>
              <Input
                placeholder="Congratulations! You passed."
                value={settings.passMessage}
                onChange={(e) => set('passMessage', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Fail message</Label>
              <Input
                placeholder="You did not reach the passing score."
                value={settings.failMessage}
                onChange={(e) => set('failMessage', e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Access control */}
      <Card className="mb-4">
        <CardHeader><CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Access Control</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Who can take this test</Label>
            <Select value={settings.access} onValueChange={(v) => set('access', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PUBLIC">
                  <div className="flex items-center gap-2"><Globe className="h-4 w-4" /> Anyone (public)</div>
                </SelectItem>
                <SelectItem value="PASSCODE">
                  <div className="flex items-center gap-2"><Lock className="h-4 w-4" /> Anyone with passcode</div>
                </SelectItem>
                <SelectItem value="EMAIL_LIST">
                  <div className="flex items-center gap-2"><Mail className="h-4 w-4" /> Email list only</div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {settings.access === 'PASSCODE' && (
            <div className="space-y-1.5">
              <Label>Passcode</Label>
              <Input value={settings.passcode} onChange={(e) => set('passcode', e.target.value)} placeholder="Enter passcode..." />
            </div>
          )}

          {settings.access === 'EMAIL_LIST' && (
            <div className="space-y-1.5">
              <Label>Allowed emails (one per line, wildcards like *@company.com supported)</Label>
              <Textarea
                rows={4}
                placeholder="student@school.edu&#10;*@mycompany.com"
                value={settings.allowedEmails}
                onChange={(e) => set('allowedEmails', e.target.value)}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Student identifier</Label>
              <Select value={settings.identifyBy} onValueChange={(v) => set('identifyBy', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NAME">Name only</SelectItem>
                  <SelectItem value="EMAIL">Email address</SelectItem>
                  <SelectItem value="ID">Student ID</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Custom identifier prompt</Label>
              <Input
                placeholder="e.g. Enter your student ID"
                value={settings.customIdentifierPrompt}
                onChange={(e) => set('customIdentifierPrompt', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Time limit (minutes, blank = unlimited)</Label>
              <Input
                type="number"
                min={1}
                value={settings.timeLimitMinutes ?? ''}
                onChange={(e) => set('timeLimitMinutes', e.target.value ? Number(e.target.value) : null)}
                placeholder="Unlimited"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Attempt limit (blank = unlimited)</Label>
              <Input
                type="number"
                min={1}
                value={settings.maxAttempts ?? ''}
                onChange={(e) => set('maxAttempts', e.target.value ? Number(e.target.value) : null)}
                placeholder="Unlimited"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Expiry date/time (blank = no expiry)</Label>
            <Input
              type="datetime-local"
              value={settings.expiresAt}
              onChange={(e) => set('expiresAt', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Anti-cheat */}
      <Card className="mb-4">
        <CardHeader><CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Browser Controls (Anti-cheat)</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: 'disableRightClick', label: 'Disable right-click' },
              { key: 'disableCopyPaste', label: 'Disable copy/paste' },
              { key: 'disableTranslate', label: 'Disable translate' },
              { key: 'disablePrint', label: 'Disable printing' },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <Checkbox
                  id={key}
                  checked={settings[key as keyof QuizSettings] as boolean}
                  onCheckedChange={(c) => set(key as keyof QuizSettings, c)}
                />
                <Label htmlFor={key} className="font-normal text-sm">{label}</Label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card className="mb-4">
        <CardHeader><CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Notifications</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <Label>Notify when someone finishes (comma-separated emails)</Label>
            <Input
              placeholder="teacher@school.edu, admin@school.edu"
              value={settings.notificationEmail}
              onChange={(e) => set('notificationEmail', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Share */}
      {settings.shareCode && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Share</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Input value={shareUrl} readOnly className="font-mono text-sm" />
              <Button
                variant="outline"
                size="icon"
                onClick={() => { navigator.clipboard.writeText(shareUrl); toast({ title: 'Link copied' }) }}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" asChild>
                <a href={shareUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
            <div className="mt-3">
              <Badge variant={settings.status === 'OPEN' ? 'success' : settings.status === 'DRAFT' ? 'outline' : 'secondary'}>
                {settings.status}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mt-6 flex justify-end">
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-[#028a39] hover:bg-[#026d2e] text-white"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save Settings
        </Button>
      </div>
    </div>
  )
}
