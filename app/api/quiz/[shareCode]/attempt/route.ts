import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// POST /api/quiz/[shareCode]/attempt — Start a new quiz attempt
export async function POST(
  req: NextRequest,
  { params }: { params: { shareCode: string } }
) {
  // Auth is optional for public quizzes
  const session = await auth();

  // Check if shareCode belongs to a QuizClass first
  let resolvedClassId: string | null = null
  let quizSet = await db.quizSet.findFirst({
    where: {
      shareCode: params.shareCode,
      status: "OPEN",
    },
    include: {
      questions: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, difficulty: true, sortOrder: true, topic: true, tags: true, questionType: true },
      },
    },
  });

  if (!quizSet) {
    // Try class shareCode
    const quizClassByCode = await db.quizClass.findFirst({
      where: { shareCode: params.shareCode },
      include: {
        quizSet: {
          include: {
            questions: {
              orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
              select: { id: true, difficulty: true, sortOrder: true, topic: true, tags: true, questionType: true },
            },
          },
        },
      },
    }).catch(() => null)
    if (quizClassByCode && quizClassByCode.quizSet.status === 'OPEN') {
      // Apply class setting overrides onto the quizSet object
      const parentSet = quizClassByCode.quizSet as any
      quizSet = {
        ...parentSet,
        questionsPerAttempt: quizClassByCode.questionsPerAttempt ?? parentSet.questionsPerAttempt,
        timeLimitMinutes: quizClassByCode.timeLimitMinutes ?? parentSet.timeLimitMinutes,
        passMark: quizClassByCode.passMark ?? parentSet.passMark,
        randomizeQuestions: quizClassByCode.randomizeQuestions,
        maxAttempts: quizClassByCode.maxAttempts ?? parentSet.maxAttempts,
      } as any
      resolvedClassId = quizClassByCode.id
    }
  }

  if (!quizSet) {
    return NextResponse.json({ error: "Quiz not found or not available" }, { status: 404 });
  }

  // Check expiry
  if (quizSet.expiresAt && quizSet.expiresAt < new Date()) {
    return NextResponse.json({ error: "This quiz has expired" }, { status: 410 });
  }

  // Check max attempts if user is logged in
  if (quizSet.maxAttempts && session?.user?.id) {
    const attemptCount = await db.attempt.count({
      where: {
        quizSetId: quizSet.id,
        userId: session.user.id,
        status: { in: ["SUBMITTED", "GRADED"] },
      },
    });
    if (attemptCount >= quizSet.maxAttempts) {
      return NextResponse.json(
        { error: "Maximum attempts reached" },
        { status: 409 }
      );
    }
  }

  const body = await req.json().catch(() => ({}));
  const { guestName, guestEmail, passcode, variantId, fixedQuestionIds, shuffleAnswerOptions, classId } = body;

  // If classId provided and no fixedQuestionIds in body, fetch from quizClass
  let resolvedFixedIds = fixedQuestionIds
  if (!resolvedFixedIds && classId) {
    const cls = await db.quizClass.findFirst({ where: { id: classId }, select: { fixedQuestionIds: true } }).catch(() => null)
    if (cls?.fixedQuestionIds) {
      try { resolvedFixedIds = JSON.parse(cls.fixedQuestionIds) } catch {}
    }
  }

  // Validate passcode if required
  if (quizSet.access === "PASSCODE") {
    if (!passcode || passcode !== quizSet.passcode) {
      return NextResponse.json({ error: "Invalid passcode" }, { status: 403 });
    }
  }

  // Select questions based on difficulty percentages
  let allQuestions = [...quizSet.questions];

  // Apply difficulty mix
  const totalToSelect = Math.min(quizSet.questionsPerAttempt, allQuestions.length);

  let selectedQuestions: typeof allQuestions;

  // If fixedQuestionIds provided, use those specific questions in order
  if (resolvedFixedIds && Array.isArray(resolvedFixedIds) && resolvedFixedIds.length > 0) {
    selectedQuestions = resolvedFixedIds
      .map((id: string) => allQuestions.find(q => q.id === id))
      .filter(Boolean) as typeof allQuestions
  } else if (quizSet.randomizeQuestions) {
    const easy = allQuestions.filter((q) => q.difficulty === "EASY");
    const medium = allQuestions.filter((q) => q.difficulty === "MEDIUM");
    const hard = allQuestions.filter((q) => q.difficulty === "HARD");

    const easyCount = Math.round((quizSet.easyPercent / 100) * totalToSelect);
    const hardCount = Math.round((quizSet.hardPercent / 100) * totalToSelect);
    const mediumCount = totalToSelect - easyCount - hardCount;

    const pick = <T>(arr: T[], n: number): T[] => {
      const shuffled = [...arr].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, Math.min(n, shuffled.length));
    };

    selectedQuestions = [
      ...pick(easy, easyCount),
      ...pick(medium, mediumCount),
      ...pick(hard, hardCount),
    ].sort(() => Math.random() - 0.5);

    // If we don't have enough from specific difficulties, fill from remaining
    if (selectedQuestions.length < totalToSelect) {
      const selectedIds = new Set(selectedQuestions.map((q) => q.id));
      const remaining = allQuestions
        .filter((q) => !selectedIds.has(q.id))
        .sort(() => Math.random() - 0.5);
      selectedQuestions.push(
        ...remaining.slice(0, totalToSelect - selectedQuestions.length)
      );
    }
  } else {
    selectedQuestions = allQuestions.slice(0, totalToSelect);
  }

  // Apply class/quiz filters if set
  const effectiveClassForFilters = resolvedClassId
    ? await db.quizClass.findFirst({ where: { id: resolvedClassId } }).catch(() => null)
    : null
  const filterConfig: any = effectiveClassForFilters || quizSet

  // Filter by topics
  if (filterConfig.filterTopics) {
    try {
      const topics: string[] = JSON.parse(filterConfig.filterTopics)
      if (topics.length > 0) {
        selectedQuestions = selectedQuestions.filter((q: any) => q.topic && topics.some((t: string) => q.topic.toLowerCase().includes(t.toLowerCase())))
      }
    } catch {}
  }

  // Filter by tags
  if (filterConfig.filterTags) {
    try {
      const tags: string[] = JSON.parse(filterConfig.filterTags)
      if (tags.length > 0) {
        selectedQuestions = selectedQuestions.filter((q: any) => {
          if (!q.tags) return false
          const qTags = q.tags.toLowerCase().split(',').map((t: string) => t.trim())
          return tags.some((t: string) => qTags.includes(t.toLowerCase()))
        })
      }
    } catch {}
  }

  // Apply difficulty counts
  const easyCountFilter = filterConfig.easyCount
  const mediumCountFilter = filterConfig.mediumCount
  const hardCountFilter = filterConfig.hardCount
  if (easyCountFilter != null || mediumCountFilter != null || hardCountFilter != null) {
    const pickByDifficulty = (diff: string, count: number | null) => {
      if (count == null) return []
      return selectedQuestions
        .filter((q: any) => q.difficulty === diff)
        .sort(() => Math.random() - 0.5)
        .slice(0, count)
    }
    const easy = pickByDifficulty('EASY', easyCountFilter)
    const medium = pickByDifficulty('MEDIUM', mediumCountFilter)
    const hard = pickByDifficulty('HARD', hardCountFilter)
    const picked = [...easy, ...medium, ...hard]
    const remaining = selectedQuestions.filter((q: any) => !picked.find((p: any) => p.id === q.id))
    const total = filterConfig.questionsPerAttempt ?? quizSet.questionsPerAttempt ?? selectedQuestions.length
    if (picked.length < total) {
      const fill = remaining.sort(() => Math.random() - 0.5).slice(0, total - picked.length)
      selectedQuestions = [...picked, ...fill].sort(() => Math.random() - 0.5)
    } else {
      selectedQuestions = picked.sort(() => Math.random() - 0.5)
    }
  }

  // Apply question type mix
  if (filterConfig.questionTypeMix) {
    try {
      const typeMix: Record<string, number> = JSON.parse(filterConfig.questionTypeMix)
      const typePicked: any[] = []
      for (const [qType, count] of Object.entries(typeMix)) {
        const matching = selectedQuestions.filter((q: any) => q.questionType === qType)
        typePicked.push(...matching.sort(() => Math.random() - 0.5).slice(0, count))
      }
      if (typePicked.length > 0) {
        const typePickedIds = new Set(typePicked.map((q: any) => q.id))
        const remainder = selectedQuestions.filter((q: any) => !typePickedIds.has(q.id))
        const total = filterConfig.questionsPerAttempt ?? quizSet.questionsPerAttempt ?? selectedQuestions.length
        if (typePicked.length < total) {
          const fill = remainder.sort(() => Math.random() - 0.5).slice(0, total - typePicked.length)
          selectedQuestions = [...typePicked, ...fill].sort(() => Math.random() - 0.5)
        } else {
          selectedQuestions = typePicked.sort(() => Math.random() - 0.5)
        }
      }
    } catch {}
  }

  const questionOrder = selectedQuestions.map((q) => q.id);

  // Build questions snapshot (without correct answers)
  const questionsForSnapshot = await db.quizQuestion.findMany({
    where: { id: { in: questionOrder } },
    select: {
      id: true,
      stem: true,
      questionType: true,
      options: true,
      correctAnswer: true,   // included for per-question feedback
      explanation: true,     // included for per-question feedback
      difficulty: true,
      points: true,
      sortOrder: true,
      poolTag: true,
    },
  });

  const snapshotMap = new Map(questionsForSnapshot.map((q) => [q.id, q]));
  // Map each question so frontend gets quizQuestionId = the DB question id
  const questionsSnapshot = questionOrder
    .map((id) => snapshotMap.get(id))
    .filter(Boolean)
    .map((q) => ({
      ...q,
      quizQuestionId: q!.id, // critical: expose as quizQuestionId for frontend
    }));

  const attempt = await db.attempt.create({
    data: {
      quizSetId: quizSet.id,
      userId: session?.user?.id ?? null,
      guestName: guestName ?? session?.user?.name ?? null,
      guestEmail: guestEmail ?? session?.user?.email ?? null,
      questionsSnapshot: questionsSnapshot as any,
      status: "IN_PROGRESS",
      variantId: variantId ?? null,
      quizClassId: classId ?? resolvedClassId ?? null,
    },
  });

  return NextResponse.json(
    {
      attemptId: attempt.id,
      questionOrder,
      questions: questionsSnapshot,
      startedAt: attempt.startedAt,
      timeLimitMinutes: quizSet.timeLimitMinutes,
    },
    { status: 201 }
  );
}
