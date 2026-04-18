'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useToast } from '@/components/ui/use-toast'
import { Save, Loader2, TestTube, CheckCircle2, XCircle, Sparkles } from 'lucide-react'

type Settings = {
  ai_provider: string
  ai_model_generation: string
  ai_model_grading: string
  app_name: string
  openrouter_models: string
}

export default function SettingsPage() {
  const { toast } = useToast()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/settings')
      if (res.ok) {
        const data = await res.json()
        setSettings(data)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    if (!settings) return
    setIsSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) throw new Error()
      toast({ title: 'Settings saved' })
    } catch {
      toast({ title: 'Failed to save', variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleTestAI = async () => {
    setIsTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/settings/test-ai', { method: 'POST' })
      setTestResult(res.ok ? 'success' : 'error')
    } catch {
      setTestResult('error')
    } finally {
      setIsTesting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (!settings) return null

  const openrouterModels = (settings.openrouter_models || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)

  const providers = [
    { value: 'openrouter', label: 'OpenRouter' },
    { value: 'anthropic', label: 'Anthropic (Claude)' },
    { value: 'openai', label: 'OpenAI (GPT)' },
    { value: 'deepseek', label: 'DeepSeek' },
  ]

  const getDefaultModels = (provider: string) => {
    switch (provider) {
      case 'openrouter': return openrouterModels
      case 'anthropic': return ['claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241022', 'claude-3-opus-20240229']
      case 'openai': return ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo']
      case 'deepseek': return ['deepseek-chat', 'deepseek-reasoner']
      default: return []
    }
  }

  const models = getDefaultModels(settings.ai_provider)

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">System Settings</h1>
          <p className="text-gray-500">Configure AI providers and application settings</p>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save Settings
        </Button>
      </div>

      {/* App Settings */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Application</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>App Name</Label>
            <Input
              value={settings.app_name}
              onChange={(e) => setSettings({ ...settings, app_name: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      {/* AI Provider Settings */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">AI Provider</CardTitle>
          <CardDescription>Configure which AI provider to use for question generation and grading</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Active Provider</Label>
            <Select
              value={settings.ai_provider}
              onValueChange={(v) => setSettings({ ...settings, ai_provider: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {settings.ai_provider === 'openrouter' && (
            <div className="space-y-2">
              <Label>OpenRouter Models (comma-separated)</Label>
              <Input
                value={settings.openrouter_models}
                onChange={(e) => setSettings({ ...settings, openrouter_models: e.target.value })}
                placeholder="model1,model2,model3"
              />
              <p className="text-xs text-gray-500">These models will be available in the dropdowns below</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Generation Model</Label>
              <Select
                value={settings.ai_model_generation}
                onValueChange={(v) => setSettings({ ...settings, ai_model_generation: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Grading Model</Label>
              <Select
                value={settings.ai_model_grading}
                onValueChange={(v) => setSettings({ ...settings, ai_model_grading: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={handleTestAI} disabled={isTesting}>
              {isTesting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <TestTube className="h-4 w-4 mr-2" />
              )}
              Test AI Connection
            </Button>
            {testResult === 'success' && (
              <div className="flex items-center gap-1 text-primary text-sm">
                <CheckCircle2 className="h-4 w-4" />
                Connection successful
              </div>
            )}
            {testResult === 'error' && (
              <div className="flex items-center gap-1 text-red-500 text-sm">
                <XCircle className="h-4 w-4" />
                Connection failed — check API key
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* API Keys Info */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">API Keys</CardTitle>
          <CardDescription>API keys are configured via environment variables</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            {[
              { name: 'OPENROUTER_API_KEY', label: 'OpenRouter' },
              { name: 'ANTHROPIC_API_KEY', label: 'Anthropic' },
              { name: 'OPENAI_API_KEY', label: 'OpenAI' },
              { name: 'DEEPSEEK_API_KEY', label: 'DeepSeek' },
            ].map((key) => (
              <div key={key.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium">{key.label}</p>
                  <p className="text-xs text-gray-500 font-mono">{key.name}</p>
                </div>
                <span className="text-xs text-gray-400">Set via .env</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* SMTP Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Email (SMTP)</CardTitle>
          <CardDescription>Configure via environment variables: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <Sparkles className="h-4 w-4" />
            <AlertDescription>
              Email settings are configured through environment variables. Update your .env file and restart the application.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  )
}
