import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// POST /api/settings/test-ai — Test AI provider connection (admin only)
// Optionally accepts { provider, model, apiKey } to override settings temporarily
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { provider, model, apiKey, baseUrl } = body;

  // If custom config provided, test it directly using openai-compatible client
  if (provider || model || apiKey) {
    try {
      const resolvedProvider = provider ?? "openrouter";
      const resolvedModel = model ?? "openai/gpt-4o-mini";

      // Get stored key if not provided
      let resolvedApiKey = apiKey;
      if (!resolvedApiKey) {
        const storedKey = await db.systemSetting.findUnique({
          where: { key: "ai_api_key" },
        });
        resolvedApiKey = storedKey?.value ?? process.env.OPENROUTER_API_KEY ?? "";
      }

      if (!resolvedApiKey) {
        return NextResponse.json({
          success: false,
          error: "No API key configured. Please add an API key in settings.",
        });
      }

      const { default: OpenAI } = await import("openai");

      const baseURL =
        baseUrl ??
        (resolvedProvider === "openrouter"
          ? "https://openrouter.ai/api/v1"
          : resolvedProvider === "deepseek"
          ? "https://api.deepseek.com"
          : undefined);

      const client = new OpenAI({
        apiKey: resolvedApiKey,
        ...(baseURL ? { baseURL } : {}),
        defaultHeaders:
          resolvedProvider === "openrouter"
            ? {
                "HTTP-Referer": process.env.NEXTAUTH_URL ?? "https://testsgen.com",
                "X-Title": "TestsGen",
              }
            : undefined,
      });

      const response = await client.chat.completions.create({
        model: resolvedModel,
        messages: [{ role: "user", content: 'Respond with just: {"status":"ok"}' }],
        max_tokens: 20,
      });

      const text = response.choices[0]?.message?.content ?? "";
      const success = text.includes("ok");

      return NextResponse.json({
        success,
        message: success ? "AI connection successful" : "Unexpected response from AI",
        model: resolvedModel,
        provider: resolvedProvider,
        response: text,
      });
    } catch (error) {
      return NextResponse.json({
        success: false,
        error: String(error),
      });
    }
  }

  // Otherwise test using stored settings
  try {
    const settings = await db.systemSetting.findMany({
      where: {
        key: {
          in: ["ai_provider", "ai_model_generation", "ai_api_key"],
        },
      },
    });
    const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]));

    const storedProvider = settingsMap["ai_provider"] ?? process.env.AI_PROVIDER ?? "openrouter";
    const storedModel =
      settingsMap["ai_model_generation"] ??
      process.env.AI_MODEL_GENERATION ??
      "openai/gpt-4o-mini";
    const storedKey =
      settingsMap["ai_api_key"] ?? process.env.OPENROUTER_API_KEY ?? "";

    if (!storedKey) {
      return NextResponse.json({
        success: false,
        error: "No API key configured. Please add an API key in settings.",
      });
    }

    const { default: OpenAI } = await import("openai");

    const baseURL =
      storedProvider === "openrouter"
        ? "https://openrouter.ai/api/v1"
        : storedProvider === "deepseek"
        ? "https://api.deepseek.com"
        : undefined;

    const client = new OpenAI({
      apiKey: storedKey,
      ...(baseURL ? { baseURL } : {}),
      defaultHeaders:
        storedProvider === "openrouter"
          ? {
              "HTTP-Referer": process.env.NEXTAUTH_URL ?? "https://testsgen.com",
              "X-Title": "TestsGen",
            }
          : undefined,
    });

    const response = await client.chat.completions.create({
      model: storedModel,
      messages: [{ role: "user", content: 'Respond with just: {"status":"ok"}' }],
      max_tokens: 20,
    });

    const text = response.choices[0]?.message?.content ?? "";
    const success = text.includes("ok");

    return NextResponse.json({
      success,
      message: success ? "AI connection successful" : "Unexpected response from AI",
      model: storedModel,
      provider: storedProvider,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
