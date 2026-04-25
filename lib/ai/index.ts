import { db } from '@/lib/db'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { buildQuizGenerationPrompt, buildExamQuestionPrompt, buildGradingPrompt } from './prompts'
import type { GenerationConfig, ExamGenerationConfig, GradingConfig } from './prompts'

export type { GenerationConfig, ExamGenerationConfig, GradingConfig }

// ─── AI Model Choices ──────────────────────────────────────────────────────────
// These are the selectable AI models exposed to the user in the UI.
// provider:model format — parsed by callAI()

export type AIModelChoice = {
  id: string           // value stored/sent in requests
  label: string        // display label
  provider: string
  model: string
  isDefault?: boolean
}

export function getAvailableModels(): AIModelChoice[] {
  const openrouterModel1 = process.env.OPENROUTER_MODEL1 || 'xiaomi/mimo-v2-pro'
  const openrouterModel2 = process.env.OPENROUTER_MODEL2 || 'qwen/qwen3-plus'
  const openrouterModel3 = process.env.OPENROUTER_MODEL3 || ''
  const openrouterModel4 = process.env.OPENROUTER_MODEL4 || ''
  const claudibleModel1  = process.env.CLAUDIBLE_MODEL  || 'claude-haiku-4.5'
  const claudibleModel2  = process.env.CLAUDIBLE_MODEL2 || ''
  const anthropicModel1  = process.env.ANTHROPIC_MODEL1 || ''
  const anthropicModel2  = process.env.ANTHROPIC_MODEL2 || ''
  const openaiModel1     = process.env.OPENAI_MODEL1 || ''
  const openaiModel2     = process.env.OPENAI_MODEL2 || ''
  const hasOpenAI        = !!process.env.OPENAI_API_KEY

  const models: AIModelChoice[] = [
    {
      id: 'claudible:1',
      label: `Claudible — ${claudibleModel1}`,
      provider: 'claudible',
      model: claudibleModel1,
    },
    ...(claudibleModel2 ? [{
      id: 'claudible:2',
      label: `Claudible — ${claudibleModel2}`,
      provider: 'claudible',
      model: claudibleModel2,
    }] : []),
    ...(anthropicModel1 ? [{
      id: 'anthropic:1',
      label: `Anthropic — ${anthropicModel1}`,
      provider: 'anthropic',
      model: anthropicModel1,
    }] : []),
    ...(anthropicModel2 ? [{
      id: 'anthropic:2',
      label: `Anthropic — ${anthropicModel2}`,
      provider: 'anthropic',
      model: anthropicModel2,
    }] : []),
    {
      id: `openrouter:${openrouterModel1}`,
      label: `OpenRouter — ${openrouterModel1}`,
      provider: 'openrouter',
      model: openrouterModel1,
    },
    {
      id: `openrouter:${openrouterModel2}`,
      label: `OpenRouter — ${openrouterModel2}`,
      provider: 'openrouter',
      model: openrouterModel2,
      isDefault: true,
    },
    ...(openrouterModel3 ? [{
      id: `openrouter:${openrouterModel3}`,
      label: `OpenRouter — ${openrouterModel3}`,
      provider: 'openrouter',
      model: openrouterModel3,
    }] : []),
    ...(openrouterModel4 ? [{
      id: `openrouter:${openrouterModel4}`,
      label: `OpenRouter — ${openrouterModel4}`,
      provider: 'openrouter',
      model: openrouterModel4,
    }] : []),
    ...(hasOpenAI && openaiModel1 ? [{
      id: `openai:${openaiModel1}`,
      label: `OpenAI — ${openaiModel1}`,
      provider: 'openai',
      model: openaiModel1,
    }] : []),
    ...(hasOpenAI && openaiModel2 ? [{
      id: `openai:${openaiModel2}`,
      label: `OpenAI — ${openaiModel2}`,
      provider: 'openai',
      model: openaiModel2,
    }] : []),
    {
      id: 'deepseek:deepseek-reasoner',
      label: 'DeepSeek Reasoner',
      provider: 'deepseek',
      model: 'deepseek-reasoner',
    },
  ]

  return models
}

/** Parse a model choice id like "deepseek:deepseek-reasoner" → { provider, model } */
export function parseModelId(modelId: string): { provider: string; model: string } {
  const idx = modelId.indexOf(':')
  if (idx === -1) return { provider: 'deepseek', model: modelId }
  const provider = modelId.slice(0, idx)
  const modelPart = modelId.slice(idx + 1)

  if (provider === 'claudible') {
    if (modelPart === '1') return { provider: 'claudible', model: process.env.CLAUDIBLE_MODEL || 'claude-haiku-4.5' }
    if (modelPart === '2') return { provider: 'claudible', model: process.env.CLAUDIBLE_MODEL2 || process.env.CLAUDIBLE_MODEL || 'claude-haiku-4.5' }
    return { provider: 'claudible', model: process.env.CLAUDIBLE_MODEL || modelPart }
  }

  if (provider === 'anthropic') {
    if (modelPart === '1') return { provider: 'anthropic', model: process.env.ANTHROPIC_MODEL1 || 'claude-haiku-4-5' }
    if (modelPart === '2') return { provider: 'anthropic', model: process.env.ANTHROPIC_MODEL2 || 'claude-sonnet-4-5' }
    return { provider: 'anthropic', model: modelPart }
  }

  if (provider === 'openai') {
    return { provider: 'openai', model: modelPart }
  }

  return { provider, model: modelPart }
}

// ─── Settings (fallback from DB / env) ────────────────────────────────────────
async function getAISettings() {
  const settings = await db.systemSetting.findMany({
    where: { key: { in: ['ai_provider', 'ai_model_generation', 'ai_model_grading'] } },
  })
  const map: Record<string, string> = {}
  settings.forEach((s) => { map[s.key] = s.value })
  return {
    provider: map.ai_provider || process.env.AI_PROVIDER || 'deepseek',
    generationModel: map.ai_model_generation || process.env.AI_MODEL_GENERATION || 'deepseek-reasoner',
    gradingModel: map.ai_model_grading || process.env.AI_MODEL_GRADING || 'deepseek-reasoner',
  }
}

// ─── Provider Clients ──────────────────────────────────────────────────────────
function getOpenAICompatibleClient(provider: string): OpenAI {
  switch (provider) {
    case 'openrouter':
      return new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY || '',
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': process.env.NEXTAUTH_URL || 'https://testsgen.gpt4vn.com',
          'X-Title': 'TestsGen',
        },
      })
    case 'deepseek':
      return new OpenAI({
        apiKey: process.env.DEEPSEEK_API_KEY || '',
        baseURL: 'https://api.deepseek.com/v1',  // Fixed: must use /v1 for OpenAI-compat
      })
    case 'openai':
      return new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' })
    case 'claudible':
      return new OpenAI({
        apiKey: process.env.CLAUDIBLE_API_KEY || '',
        baseURL: process.env.CLAUDIBLE_BASE_URL || 'https://claudible.io/v1',
      })
    default:
      throw new Error(`Provider ${provider} not supported via OpenAI client`)
  }
}

async function generateWithOpenAICompat(
  provider: string,
  model: string,
  prompt: string
): Promise<string> {
  const client = getOpenAICompatibleClient(provider)
  const createParams: any = {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
  }
  if (provider === 'claudible') {
    createParams.max_tokens = 16000
  }
  const response = await client.chat.completions.create(createParams)
  return response.choices[0]?.message?.content || ''
}

async function generateWithAnthropic(model: string, prompt: string): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' })
  const response = await client.messages.create({
    model,
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  })
  const block = response.content[0]
  return block.type === 'text' ? block.text : ''
}

export async function callAI(provider: string, model: string, prompt: string): Promise<string> {
  if (provider === 'anthropic') {
    return generateWithAnthropic(model, prompt)
  }
  return generateWithOpenAICompat(provider, model, prompt)
}

// ─── JSON Parser ───────────────────────────────────────────────────────────────
export function parseJSONFromResponse(text: string): unknown[] {
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch {}

  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1])
      return Array.isArray(parsed) ? parsed : [parsed]
    } catch {}
  }

  const arrayMatch = text.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0])
      return Array.isArray(parsed) ? parsed : []
    } catch {}
  }

  return []
}

// ─── Public API ────────────────────────────────────────────────────────────────

export async function* generateQuizQuestions(
  config: GenerationConfig,
  modelId?: string   // optional override e.g. "openrouter:qwen/qwen3-plus"
): AsyncGenerator<Record<string, unknown>> {
  let provider: string
  let model: string

  if (modelId) {
    const parsed = parseModelId(modelId)
    provider = parsed.provider
    model = parsed.model
  } else {
    const settings = await getAISettings()
    provider = settings.provider
    model = settings.generationModel
  }

  const prompt = buildQuizGenerationPrompt(config)
  const text = await callAI(provider, model, prompt)
  const questions = parseJSONFromResponse(text)

  for (const q of questions) {
    yield q as Record<string, unknown>
  }
}

export async function* generateExamQuestions(
  config: ExamGenerationConfig,
  modelId?: string
): AsyncGenerator<Record<string, unknown>> {
  let provider: string
  let model: string

  if (modelId) {
    const parsed = parseModelId(modelId)
    provider = parsed.provider
    model = parsed.model
  } else {
    const settings = await getAISettings()
    provider = settings.provider
    model = settings.generationModel
  }

  const prompt = buildExamQuestionPrompt(config)
  const text = await callAI(provider, model, prompt)
  const questions = parseJSONFromResponse(text)

  for (const q of questions) {
    yield q as Record<string, unknown>
  }
}

export async function gradeWrittenAnswer(config: GradingConfig): Promise<{
  marksAwarded: number
  feedback: string
  keyPointsHit?: string[]
  keyPointsMissed?: string[]
}> {
  const settings = await getAISettings()
  const prompt = buildGradingPrompt(config)
  const text = await callAI(settings.provider, settings.gradingModel, prompt)

  try {
    const parsed = parseJSONFromResponse(text)
    if (parsed[0]) return parsed[0] as { marksAwarded: number; feedback: string }
  } catch {}

  return {
    marksAwarded: 0,
    feedback: 'Unable to grade automatically. Please review manually.',
  }
}

export async function testAIConnection(): Promise<boolean> {
  try {
    const settings = await getAISettings()
    const text = await callAI(
      settings.provider,
      settings.generationModel,
      'Respond with just: {"status":"ok"}'
    )
    return text.includes('ok')
  } catch {
    return false
  }
}
