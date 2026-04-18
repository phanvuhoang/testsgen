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
import { Save, Loader2, TestTube, CheckCircle2, XCircle, Sparkles, Lock } from 'lucide-react'

type SettingRow = { key: string; value: string }

type SettingsMap = {
  ai_provider: string
  ai_model_generation: string
  ai_model_grading: string
  app_name: string
  openrouter_model1: string
  openrouter_model2: string
}

const DEFAULTS: SettingsMap = {
  ai_provider: 'deepseek',
  ai_model_generation: 'deepseek-reasoner',
  ai_model_grading: 'deepseek-reasoner',
  app_name: 'TestsGen',
  openrouter_model1: 'xiaomi/mimo-v2-pro',
  openrouter_model2: 'qwen/qwen3-plus',
}

export default function SettingsPage() {
  const { toast } = useToast()
  const [settings, setSettings] = useState<SettingsMap>(DEFAULTS)
  const [isLoading, setIsLoading] = useState(true)
  const [isForbidden, setIsForbidden] = useState(false)
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
      if (res.status === 403) {
        setIsForbidden(true)
        return
      }
      if (res.ok) {
        const rows: SettingRow[] = await res.json()
        const map: Partial<SettingsMap> = {}
        rows.forEach((r) => {
          if (r.key in DEFAULTS) {
            (map as Record<string, string>)[r.key] = r.value
          }
        })
        setSettings({ ...DEFAULTS, ...map })
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const body = Object.entries(settings).map(([key, value]) => ({ key, value }))
      const res = await fetch('/api/settings', {
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

  if (isForbidden) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="bg-gray-100 rounded-full p-6 mb-4">
            <Lock className="h-10 w-10 text-gray-400" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Admin Access Required</h2>
          <p className="text-gray-500 max-w-sm">
            System settings are only accessible to administrators.
          </p>
        </div>
      </div>
    )
  }

  const allModels = [
    `deepseek:deepseek-reasoner`,
    `deepseek:deepseek-chat`,
    `openrouter:${settings.openrouter_model1}`,
    `openrouter:${settings.openrouter_model2}`,
    `anthropic:claude-haiku-4-5`,
    `anthropic:claude-sonnet-4-5`,
  ]

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">System Settings</h1>
          <p className="text-gray-500">Configure AI providers and application settings</p>
        </div>
        <Button onClick={handleSave} disabled={isSaving} className="bg-[#028a39] hover:bg-[#026d2e] text-white">
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

      {/* AI Provider */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">AI Provider</CardTitle>
          <CardDescription>Default provider for question generation and grading. Users can override per-generation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Default Provider</Label>
            <Select
              value={settings.ai_provider}
              onValueChange={(v) => setSettings({ ...settings, ai_provider: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="deepseek">DeepSeek</SelectItem>
                <SelectItem value="openrouter">OpenRouter</SelectItem>
                <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>OpenRouter Model 1</Label>
              <Input
                value={settings.openrouter_model1}
                onChange={(e) => setSettings({ ...settings, openrouter_model1: e.target.value })}
                placeholder="e.g. xiaomi/mimo-v2-pro"
              />
            </div>
            <div className="space-y-2">
              <Label>OpenRouter Model 2</Label>
              <Input
                value={settings.openrouter_model2}
                onChange={(e) => setSettings({ ...settings, openrouter_model2: e.target.value })}
                placeholder="e.g. qwen/qwen3-plus"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Generation Model</Label>
              <Select
                value={settings.ai_model_generation}
                onValueChange={(v) => setSettings({ ...settings, ai_model_generation: v })}
              >
                <SelectTrigger><SelectValue placeholder="Select model" /></SelectTrigger>
                <SelectContent>
                  {allModels.map((m) => (
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
                <SelectTrigger><SelectValue placeholder="Select model" /></SelectTrigger>
                <SelectContent>
                  {allModels.map((m) => (
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
              <span className="flex items-center gap-1 text-[#028a39] text-sm">
                <CheckCircle2 className="h-4 w-4" /> Connected
              </span>
            )}
            {testResult === 'error' && (
              <span className="flex items-center gap-1 text-red-500 text-sm">
                <XCircle className="h-4 w-4" /> Failed — check API key
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* API Keys */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">API Keys</CardTitle>
          <CardDescription>Set via environment variables in Coolify</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            {[
              { name: 'DEEPSEEK_API_KEY', label: 'DeepSeek' },
              { name: 'OPENROUTER_API_KEY', label: 'OpenRouter' },
              { name: 'ANTHROPIC_API_KEY', label: 'Anthropic' },
            ].map((key) => (
              <div key={key.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium">{key.label}</p>
                  <p className="text-xs text-gray-500 font-mono">{key.name}</p>
                </div>
                <span className="text-xs text-gray-400">Set via env</span>
              </div>
            ))}
          </div>
          <Alert className="mt-4">
            <Sparkles className="h-4 w-4" />
            <AlertDescription className="text-xs">
              API keys are configured through Coolify environment variables. Changes require a redeploy.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  )
}
