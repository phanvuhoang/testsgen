import { db } from '@/lib/db'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { buildQuizGenerationPrompt, buildExamQuestionPrompt, buildGradingPrompt } from './prompts'
import type { GenerationConfig, ExamGenerationConfig, GradingConfig } from './prompts'

export type { GenerationConfig, ExamGenerationConfig, GradingConfig }

async function getAISettings() {
  const settings = await db.systemSetting.findMany({
    where: { key: { in: ['ai_provider', 'ai_model_generation', 'ai_model_grading'] } },
  })
  const map: Record<string, string> = {}
  settings.forEach((s) => { map[s.key] = s.value })
  return {
    provider: map.ai_provider || process.env.AI_PROVIDER || 'openrouter',
    generationModel: map.ai_model_generation || process.env.AI_MODEL_GENERATION || 'google/gemini-2.0-flash-001',
    gradingModel: map.ai_model_grading || process.env.AI_MODEL_GRADING || 'google/gemini-2.0-flash-001',
  }
}

function getOpenAICompatibleClient(provider: string): { client: OpenAI; baseURL: string } {
  switch (provider) {
    case 'openrouter':
      return {
        client: new OpenAI({
          apiKey: process.env.OPENROUTER_API_KEY || '',
          baseURL: 'https://openrouter.ai/api/v1',
          defaultHeaders: {
            'HTTP-Referer': process.env.NEXTAUTH_URL || 'https://testsgen.com',
            'X-Title': 'TestsGen',
          },
        }),
        baseURL: 'https://openrouter.ai/api/v1',
      }
    case 'deepseek':
      return {
        client: new OpenAI({
          apiKey: process.env.DEEPSEEK_API_KEY || '',
          baseURL: 'https://api.deepseek.com',
        }),
        baseURL: 'https://api.deepseek.com',
      }
    case 'openai':
      return {
        client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' }),
        baseURL: 'https://api.openai.com/v1',
      }
    default:
      throw new Error(`Provider ${provider} not supported via OpenAI client`)
  }
}

async function generateWithOpenAICompat(
  provider: string,
  model: string,
  prompt: string
): Promise<string> {
  const { client } = getOpenAICompatibleClient(provider)
  const response = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
  })
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

function parseJSONFromResponse(text: string): unknown[] {
  // Try direct parse
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch {}
  
  // Try extracting JSON array from markdown code blocks
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1])
      return Array.isArray(parsed) ? parsed : [parsed]
    } catch {}
  }
  
  // Try extracting raw JSON array
  const arrayMatch = text.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0])
      return Array.isArray(parsed) ? parsed : []
    } catch {}
  }
  
  return []
}

export async function* generateQuizQuestions(
  config: GenerationConfig
): AsyncGenerator<Record<string, unknown>> {
  const settings = await getAISettings()
  const prompt = buildQuizGenerationPrompt(config)
  
  const text = await callAI(settings.provider, settings.generationModel, prompt)
  const questions = parseJSONFromResponse(text)
  
  for (const q of questions) {
    yield q as Record<string, unknown>
  }
}

export async function* generateExamQuestions(
  config: ExamGenerationConfig
): AsyncGenerator<Record<string, unknown>> {
  const settings = await getAISettings()
  const prompt = buildExamQuestionPrompt(config)
  
  const text = await callAI(settings.provider, settings.generationModel, prompt)
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
  
  // Fallback
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
