// Study-prep AI runner — wraps callAI with the right prompt and parses the result.
import { callAI, parseModelId, DEFAULT_DEEPSEEK_GENERATION_MODEL } from './index'
import { db } from '@/lib/db'
import {
  buildStudyPlanPrompt,
  buildStudyMaterialsPrompt,
  buildMockExamPlanPrompt,
  extractStudyPrepJSON,
  type StudyPrepContext,
} from './study-prep-prompts'

export type StudyPrepKind = 'plan' | 'materials' | 'mock-plan'

export type StudyPrepResult = {
  title: string
  summary?: string
  markdown: string
  structured?: unknown
  mindmap?: string
  citedSources?: { type: string; id: string; label?: string }[]
  generatedBy: string
}

async function resolveModel(modelId?: string) {
  if (modelId) return parseModelId(modelId)
  const settings = await db.systemSetting.findMany({
    where: { key: { in: ['ai_provider', 'ai_model_generation'] } },
  })
  const map: Record<string, string> = {}
  settings.forEach((s) => { map[s.key] = s.value })
  return {
    provider: map.ai_provider || process.env.AI_PROVIDER || 'deepseek',
    model:
      map.ai_model_generation ||
      process.env.AI_MODEL_GENERATION ||
      DEFAULT_DEEPSEEK_GENERATION_MODEL,
  }
}

export async function runStudyPrepGeneration(
  kind: StudyPrepKind,
  ctx: StudyPrepContext,
  modelId?: string
): Promise<StudyPrepResult> {
  const { provider, model } = await resolveModel(modelId)

  const prompt =
    kind === 'plan'
      ? buildStudyPlanPrompt(ctx)
      : kind === 'materials'
        ? buildStudyMaterialsPrompt(ctx)
        : buildMockExamPlanPrompt(ctx)

  const text = await callAI(provider, model, prompt)
  const parsed = extractStudyPrepJSON(text)

  const fallbackTitle =
    kind === 'plan'      ? `Study Plan — ${ctx.prepSetName}` :
    kind === 'materials' ? `Secret Sauce Notes — ${ctx.prepSetName}` :
                           `Mock Exam Plan — ${ctx.prepSetName}`

  return {
    title: (typeof parsed.title === 'string' && parsed.title.trim()) || fallbackTitle,
    summary: typeof parsed.summary === 'string' ? parsed.summary : undefined,
    markdown:
      (typeof parsed.markdown === 'string' && parsed.markdown.trim())
        ? parsed.markdown
        : text || '_(empty AI response)_',
    structured: parsed.structured,
    mindmap: typeof parsed.mindmap === 'string' ? parsed.mindmap : undefined,
    citedSources: Array.isArray(parsed.citedSources)
      ? parsed.citedSources.filter(
          (s: any) => s && typeof s.id === 'string' && typeof s.type === 'string'
        )
      : undefined,
    generatedBy: `${provider}:${model}`,
  }
}
