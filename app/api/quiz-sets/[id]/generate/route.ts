import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { generateQuizQuestions } from "@/lib/ai";

// POST /api/quiz-sets/[id]/generate — AI question generation via SSE
// Body: {
//   topic: string,                    // Content / topic to generate about (used as documentContent)
//   totalQuestions?: number,          // Default 10
//   easyCount?: number,               // Default totalQuestions * 0.2
//   mediumCount?: number,             // Default totalQuestions * 0.6
//   hardCount?: number,               // Default totalQuestions * 0.2
//   easyPoints?: number,              // Default 1
//   mediumPoints?: number,            // Default 1
//   hardPoints?: number,              // Default 1
//   questionTypes?: string[],         // Default ["MCQ"]
//   aiInstructions?: string,          // Extra instructions for AI
// }
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const where =
    session.user.role === "ADMIN"
      ? { id: params.id }
      : { id: params.id, createdById: session.user.id };

  const quizSet = await db.quizSet.findFirst({ where });
  if (!quizSet) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const {
    topic,
    totalQuestions = 10,
    easyCount,
    mediumCount,
    hardCount,
    easyPoints = 1,
    mediumPoints = 1,
    hardPoints = 1,
    questionTypes = ["MCQ"],
    aiInstructions,
    modelId,  // optional AI model override e.g. "openrouter:qwen/qwen3-plus"
  } = body;

  if (!topic) {
    return NextResponse.json({ error: "topic is required" }, { status: 400 });
  }

  // Calculate difficulty distribution
  const easy = easyCount ?? Math.round(totalQuestions * (quizSet.easyPercent / 100));
  const hard = hardCount ?? Math.round(totalQuestions * (quizSet.hardPercent / 100));
  const medium = mediumCount ?? totalQuestions - easy - hard;

  // Set up SSE stream
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const send = async (data: object) => {
    await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  };

  // Run generation in background
  (async () => {
    try {
      await send({ type: "start", message: "Starting AI generation..." });

      let saved = 0;

      const gen = generateQuizQuestions({
        source: "manual",
        documentContent: topic,
        title: quizSet.title,
        totalQuestions,
        easyCount: easy,
        mediumCount: medium,
        hardCount: hard,
        easyPoints,
        mediumPoints,
        hardPoints,
        questionTypes,
        aiInstructions,
      }, modelId);

      for await (const q of gen) {
        const difficultyValue = (
          (q.difficulty as string) ?? "MEDIUM"
        ).toUpperCase() as "EASY" | "MEDIUM" | "HARD";

        const rawType = (
          (q.questionType as string) ??
          (q.type as string) ??
          "MCQ"
        )
          .toUpperCase()
          .replace(/\s+/g, "_");

        const typeMap: Record<string, "MCQ" | "TRUE_FALSE" | "SHORT_ANSWER"> = {
          MCQ: "MCQ",
          TRUE_FALSE: "TRUE_FALSE",
          SHORT_ANSWER: "SHORT_ANSWER",
          SHORT: "SHORT_ANSWER",
        };
        const questionType = typeMap[rawType] ?? "MCQ";

        const created = await db.quizQuestion.create({
          data: {
            quizSetId: params.id,
            stem: (q.stem as string) ?? (q.question as string) ?? "",
            questionType,
            options: (q.options as string[]) ?? [],
            correctAnswer: (q.correctAnswer as string) ?? "",
            explanation: (q.explanation as string) ?? null,
            difficulty: difficultyValue,
            points: (q.points as number) ?? 1,
          },
        });

        saved++;
        await send({
          type: "question",
          question: created,
          progress: saved,
          total: totalQuestions,
        });
      }

      await send({
        type: "complete",
        message: `Generated ${saved} questions`,
        count: saved,
      });
    } catch (error) {
      console.error("Quiz generation error:", error);
      await send({ type: "error", message: String(error) });
    } finally {
      await writer.write(encoder.encode("data: [DONE]\n\n"));
      await writer.close();
    }
  })();

  return new NextResponse(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
