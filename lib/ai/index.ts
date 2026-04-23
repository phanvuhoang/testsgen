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
}

export function getAvailableModels(): AIModelChoice[] {
  const openrouterModel1 = process.env.OPENROUTER_MODEL1 || 'xiaomi/mimo-v2-pro'
  const openrouterModel2 = process.env.OPENROUTER_MODEL2 || 'qwen/qwen3-plus'

  return [
    {
      id: 'deepseek:deepseek-reasoner',
      label: 'DeepSeek Reasoner (Default)',
      provider: 'deepseek',
      model: 'deepseek-reasoner',
    },
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
    },
    {
      id: 'anthropic:claude-haiku-4-5',
      label: 'Anthropic — Claude Haiku 4.5',
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
    },
    {
      id: 'anthropic:claude-sonnet-4-5',
      label: 'Anthropic — Claude Sonnet 4.5',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
    },
    {
      id: 'claudible:claude-haiku-4.5',
      label: `Claudible (${process.env.CLAUDIBLE_MODEL || 'claude-haiku-4.5'})`,
      provider: 'claudible',
      model: process.env.CLAUDIBLE_MODEL || 'claude-haiku-4.5',
    },
  ]
}

/** Parse a model choice id like "deepseek:deepseek-reasoner" → { provider, model } */
export function parseModelId(modelId: string): { provider: string; model: string } {
  const idx = modelId.indexOf(':')
  if (idx === -1) return { provider: 'deepseek', model: modelId }
  const provider = modelId.slice(0, idx)
  const modelFromId = modelId.slice(idx + 1)
  if (provider === 'claudible') {
    return { provider: 'claudible', model: process.env.CLAUDIBLE_MODEL || modelFromId }
  }
  return { provider, model: modelFromId }
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

async function callAI(provider: string, model: string, prompt: string): Promise<string> {
  if (provider === 'anthropic') {
    return generateWithAnthropic(model, prompt)
  }
  return generateWithOpenAICompat(provider, model, prompt)
}

// ─── JSON Parser ───────────────────────────────────────────────────────────────
function parseJSONFromResponse(text: string): unknown[] {
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
