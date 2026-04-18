'use client'

import { useEffect, useRef, useState } from 'react'
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
import { Save, Loader2, Globe, Lock, Mail, Copy, ExternalLink, Upload } from 'lucide-react'

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
  // Per-question feedback
  feedbackShowCorrect: boolean
  feedbackShowAnswer: boolean
  feedbackShowExplanation: boolean
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
  // Certificate
  certificateEnabled: boolean
  certificateTitle: string
  certificateMessage: string
  // Theme
  themeColor: string
  themeFont: string
  themeLogo: string
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
  feedbackShowCorrect: false,
  feedbackShowAnswer: false,
  feedbackShowExplanation: false,
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
  certificateEnabled: false,
  certificateTitle: 'Certificate of Completion',
  certificateMessage: '',
  themeColor: '#028a39',
  themeFont: 'Inter',
  themeLogo: '',
}

export default function QuizSettingsPage() {
  const params = useParams()
  const { toast } = useToast()
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [settings, setSettings] = useState<QuizSettings>(DEFAULTS)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)

  // Derived: feedbackShowNothing = all three feedback flags are false
  const feedbackShowNothing =
    !settings.feedbackShowCorrect &&
    !settings.feedbackShowAnswer &&
    !settings.feedbackShowExplanation

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
          feedbackShowCorrect: data.feedbackShowCorrect ?? false,
          feedbackShowAnswer: data.feedbackShowAnswer ?? false,
          feedbackShowExplanation: data.feedbackShowExplanation ?? false,
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
          certificateEnabled: data.certificateEnabled ?? false,
          certificateTitle: data.certificateTitle ?? 'Certificate of Completion',
          certificateMessage: data.certificateMessage ?? '',
          themeColor: data.themeColor ?? '#028a39',
          themeFont: data.themeFont ?? 'Inter',
          themeLogo: data.themeLogo ?? '',
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

  const handleLogoUpload = async (file: File) => {
    setIsUploadingLogo(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`/api/quiz-sets/${params.quizId}/logo`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      set('themeLogo', data.url || data.path || '')
      toast({ title: 'Logo uploaded' })
    } catch {
      toast({ title: 'Failed to upload logo', variant: 'destructive' })
    } finally {
      setIsUploadingLogo(false)
      if (logoInputRef.current) logoInputRef.current.value = ''
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

      {/* After Each Question (per-question feedback) */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">After Each Question</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-gray-500">
            In &quot;one at a time&quot; mode, choose what to show the student immediately after they answer each question.
          </p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="feedbackShowCorrect"
                checked={settings.feedbackShowCorrect}
                disabled={feedbackShowNothing && !settings.feedbackShowCorrect}
                onCheckedChange={(c) => {
                  set('feedbackShowCorrect', c)
                }}
              />
              <Label htmlFor="feedbackShowCorrect" className="font-normal">
                Indicate if the student&apos;s response was correct or incorrect
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="feedbackShowAnswer"
                checked={settings.feedbackShowAnswer}
                onCheckedChange={(c) => {
                  set('feedbackShowAnswer', c)
                }}
              />
              <Label htmlFor="feedbackShowAnswer" className="font-normal">
                Display the correct answer
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="feedbackShowExplanation"
                checked={settings.feedbackShowExplanation}
                onCheckedChange={(c) => {
                  set('feedbackShowExplanation', c)
                }}
              />
              <Label htmlFor="feedbackShowExplanation" className="font-normal">
                Show the explanation (if there is one)
              </Label>
            </div>

            <Separator className="my-1" />

            <div className="flex items-center gap-2">
              <Checkbox
                id="feedbackShowNothing"
                checked={feedbackShowNothing}
                onCheckedChange={(c) => {
                  if (c) {
                    // Uncheck all three
                    setSettings((prev) => ({
                      ...prev,
                      feedbackShowCorrect: false,
                      feedbackShowAnswer: false,
                      feedbackShowExplanation: false,
                    }))
                  }
                  // If unchecking "nothing", leave all three as false (user can check individually)
                }}
              />
              <Label htmlFor="feedbackShowNothing" className="font-normal text-gray-600">
                Don&apos;t show anything. Just move on to the next question.
              </Label>
            </div>
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
              { key: 'showCorrectAnswers', label: 'Indicate if their response was correct or incorrect' },
              { key: 'showAnswers', label: 'Display the correct answer and explanation' },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <Checkbox
                  id={`review-${key}`}
                  checked={settings[key as keyof QuizSettings] as boolean}
                  onCheckedChange={(c) => set(key as keyof QuizSettings, c)}
                />
                <Label htmlFor={`review-${key}`} className="font-normal">{label}</Label>
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

      {/* Certificate */}
      <Card className="mb-4">
        <CardHeader><CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Certificate</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="certificateEnabled"
              checked={settings.certificateEnabled}
              onCheckedChange={(c) => set('certificateEnabled', c)}
            />
            <Label htmlFor="certificateEnabled" className="font-normal">
              Issue a certificate upon quiz completion (when student passes)
            </Label>
          </div>

          {settings.certificateEnabled && (
            <div className="space-y-3 pl-6">
              <div className="space-y-1.5">
                <Label>Certificate Title</Label>
                <Input
                  placeholder="Certificate of Completion"
                  value={settings.certificateTitle}
                  onChange={(e) => set('certificateTitle', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Certificate Message</Label>
                <Textarea
                  rows={3}
                  placeholder="This is to certify that {name} has successfully completed {quiz}."
                  value={settings.certificateMessage}
                  onChange={(e) => set('certificateMessage', e.target.value)}
                />
                <p className="text-xs text-gray-500">
                  Use <code className="bg-gray-100 px-1 rounded">{'{name}'}</code> for the student name and{' '}
                  <code className="bg-gray-100 px-1 rounded">{'{quiz}'}</code> for the quiz title.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Customize Theme */}
      <Card className="mb-4">
        <CardHeader><CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Customize Theme</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Accent Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={settings.themeColor}
                  onChange={(e) => set('themeColor', e.target.value)}
                  className="h-9 w-12 rounded border border-input cursor-pointer p-0.5"
                />
                <Input
                  value={settings.themeColor}
                  onChange={(e) => set('themeColor', e.target.value)}
                  placeholder="#028a39"
                  className="h-9 flex-1 font-mono text-sm"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Font</Label>
              <Select value={settings.themeFont} onValueChange={(v) => set('themeFont', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Inter">Inter</SelectItem>
                  <SelectItem value="Roboto">Roboto</SelectItem>
                  <SelectItem value="Open Sans">Open Sans</SelectItem>
                  <SelectItem value="Lato">Lato</SelectItem>
                  <SelectItem value="Georgia">Georgia</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Logo</Label>
            <div className="flex items-center gap-3">
              {settings.themeLogo && (
                <img
                  src={settings.themeLogo}
                  alt="Quiz logo"
                  className="h-10 w-auto max-w-[120px] object-contain border rounded"
                />
              )}
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleLogoUpload(f)
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => logoInputRef.current?.click()}
                disabled={isUploadingLogo}
              >
                {isUploadingLogo ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                {settings.themeLogo ? 'Replace Logo' : 'Upload Logo'}
              </Button>
              {settings.themeLogo && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500 hover:text-red-600"
                  onClick={() => set('themeLogo', '')}
                >
                  Remove
                </Button>
              )}
            </div>
            <p className="text-xs text-gray-500">Logo will be shown in the quiz header. Recommended: PNG or SVG, max 200px height.</p>
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
                placeholder={"student@school.edu\n*@mycompany.com"}
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
        <Card className="mb-4">
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
