import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/quiz/[shareCode] — Public: get quiz metadata + questions (no correct answers)
export async function GET(
  req: NextRequest,
  { params }: { params: { shareCode: string } }
) {
  // Check if shareCode belongs to a QuizClass
  const quizClass = await db.quizClass.findFirst({
    where: { shareCode: params.shareCode },
    include: { quizSet: { include: { createdBy: { select: { name: true } }, questions: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { id: true, stem: true, questionType: true, options: true, difficulty: true, points: true, sortOrder: true, poolTag: true } } } } }
  }).catch(() => null)

  if (quizClass) {
    const quizSet = quizClass.quizSet
    // Build response: Class settings take full precedence over Quiz Set.
    // For nullable overrides (timeLimitMinutes, questionsPerAttempt, passMark, maxAttempts,
    // displayMode) fall back to quizSet only when class value is null (not yet customised).
    // For boolean flags that exist on QuizClass, always use the class value.
    return NextResponse.json({
      id: quizSet.id,
      title: quizSet.title,
      description: quizSet.description,
      shareCode: params.shareCode, // class shareCode
      classId: quizClass.id,
      className: quizClass.name,
      // ── Class-owned settings (always from class) ─────────────────────────
      timeLimitMinutes: quizClass.timeLimitMinutes ?? quizSet.timeLimitMinutes,
      questionsPerAttempt: quizClass.questionsPerAttempt ?? quizSet.questionsPerAttempt,
      passMark: quizClass.passMark ?? quizSet.passMark,
      randomizeQuestions: quizClass.randomizeQuestions,
      shuffleAnswerOptions: quizClass.shuffleAnswerOptions,
      displayMode: quizClass.displayMode ?? quizSet.displayMode,
      disablePrevButton: quizClass.disablePrevButton,
      requireLogin: quizClass.requireLogin,
      maxAttempts: quizClass.maxAttempts ?? quizSet.maxAttempts,
      fixedQuestionIds: quizClass.fixedQuestionIds ? JSON.parse(quizClass.fixedQuestionIds) : null,
      // ── Per-question feedback (from class) ───────────────────────────────
      feedbackShowCorrect: quizClass.feedbackShowCorrect,
      feedbackShowAnswer: quizClass.feedbackShowAnswer,
      feedbackShowExplanation: quizClass.feedbackShowExplanation,
      // ── Results display (from class) ─────────────────────────────────────
      showAnswers: quizClass.showAnswers ?? quizSet.showAnswers,
      showScore: quizClass.showScore ?? quizSet.showScore,
      showCorrectAnswers: quizClass.showCorrectAnswers ?? quizSet.showCorrectAnswers,
      // ── Pass/Fail messages (from class if set, else quizSet) ─────────────
      passMessage: quizClass.passMessage ?? quizSet.passMessage,
      failMessage: quizClass.failMessage ?? quizSet.failMessage,
      // ── Content (from class if set, else quizSet) ────────────────────────
      introText: quizClass.introText ?? quizSet.introText,
      conclusionText: quizClass.conclusionText ?? quizSet.conclusionText,
      // ── Access (from class if set, else quizSet) ─────────────────────────
      accessType: quizClass.accessType ?? quizSet.access,
      access: quizClass.accessType ?? quizSet.access,
      passcode: quizClass.passcode ?? quizSet.passcode,
      // ── Certificate (from class) ─────────────────────────────────────────
      certificateEnabled: quizClass.certificateEnabled,
      certificateTitle: quizClass.certificateTitle ?? quizSet.certificateTitle,
      certificateMessage: quizClass.certificateMessage ?? quizSet.certificateMessage,
      certificateBorderColor: quizClass.certificateBorderColor ?? quizSet.certificateBorderColor,
      certificateFont: quizClass.certificateFont ?? quizSet.certificateFont,
      certificateShowLogo: quizSet.certificateShowLogo,
      certificateShowScore: quizClass.certificateShowScore,
      certificateShowDate: quizClass.certificateShowDate,
      certificateIssuerName: quizClass.certificateIssuerName ?? quizSet.certificateIssuerName,
      certificateIssuerTitle: quizClass.certificateIssuerTitle ?? quizSet.certificateIssuerTitle,
      // ── Theme & other display (from quizSet — shared branding) ───────────
      themeColor: quizSet.themeColor,
      themeFont: quizSet.themeFont,
      themeLogo: quizSet.themeLogo,
      partialCredits: quizSet.partialCredits,
      showOutline: quizSet.showOutline,
      identifyBy: quizSet.identifyBy,
      expiresAt: quizSet.expiresAt,
      disableRightClick: quizSet.disableRightClick,
      disableCopyPaste: quizSet.disableCopyPaste,
      disableTranslate: quizSet.disableTranslate,
      disablePrint: quizSet.disablePrint,
      customIdentifierPrompt: quizSet.customIdentifierPrompt,
      language: quizSet.language,
      createdBy: quizSet.createdBy?.name ?? 'Unknown',
      variantId: null,
      questionCount: quizSet.questions.length,
      questions: quizSet.questions,
    })
  }

  const quizSet = await db.quizSet.findFirst({
    where: {
      shareCode: params.shareCode,
      status: "OPEN",
    },
    include: {
      questions: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          stem: true,
          questionType: true,
          options: true,
          difficulty: true,
          points: true,
          sortOrder: true,
          poolTag: true,
          // Do NOT expose correctAnswer or explanation here
        },
      },
      createdBy: {
        select: { name: true },
      },
    },
  });

  if (!quizSet) {
    return NextResponse.json({ error: "Quiz not found or not available" }, { status: 404 });
  }

  // Check access
  if (quizSet.access === "EMAIL_LIST") {
    // handled at attempt start
  }

  // Check expiry
  if (quizSet.expiresAt && quizSet.expiresAt < new Date()) {
    return NextResponse.json({ error: "This quiz has expired" }, { status: 410 });
  }

  // Handle variant overrides
  const url2 = new URL(req.url)
  const variantId = url2.searchParams.get('variant')
  let variantOverride: any = null
  if (variantId) {
    variantOverride = await db.quizVariant.findFirst({
      where: { id: variantId, quizSet: { shareCode: params.shareCode } }
    }).catch(() => null)
  }

  // Apply overrides to quizSet (mutate the object before using it in response)
  if (variantOverride) {
    if (variantOverride.questionsPerAttempt != null) quizSet.questionsPerAttempt = variantOverride.questionsPerAttempt
    if (variantOverride.timeLimitMinutes != null) quizSet.timeLimitMinutes = variantOverride.timeLimitMinutes
    if (variantOverride.passMark != null) quizSet.passMark = variantOverride.passMark
    if (variantOverride.randomizeQuestions != null) quizSet.randomizeQuestions = variantOverride.randomizeQuestions
    if (variantOverride.displayMode != null) quizSet.displayMode = variantOverride.displayMode
  }

  return NextResponse.json({
    id: quizSet.id,
    title: quizSet.title,
    description: quizSet.description,
    shareCode: quizSet.shareCode,
    timeLimitMinutes: quizSet.timeLimitMinutes,
    passMark: quizSet.passMark,
    randomizeQuestions: quizSet.randomizeQuestions,
    showAnswers: quizSet.showAnswers,
    displayMode: quizSet.displayMode,
    requireLogin: quizSet.requireLogin,
    questionsPerAttempt: quizSet.questionsPerAttempt,
    access: quizSet.access,
    maxAttempts: quizSet.maxAttempts,
    expiresAt: quizSet.expiresAt,
    passMessage: quizSet.passMessage,
    failMessage: quizSet.failMessage,
    identifyBy: quizSet.identifyBy,
    introText: quizSet.introText,
    conclusionText: quizSet.conclusionText,
    // Per-question feedback settings
    feedbackShowCorrect: quizSet.feedbackShowCorrect,
    feedbackShowAnswer: quizSet.feedbackShowAnswer,
    feedbackShowExplanation: quizSet.feedbackShowExplanation,
    // Certificate
    certificateEnabled: quizSet.certificateEnabled,
    certificateTitle: quizSet.certificateTitle,
    certificateMessage: quizSet.certificateMessage,
    certificateBorderColor: quizSet.certificateBorderColor,
    certificateFont: quizSet.certificateFont,
    certificateShowLogo: quizSet.certificateShowLogo,
    certificateShowScore: quizSet.certificateShowScore,
    certificateShowDate: quizSet.certificateShowDate,
    certificateIssuerName: quizSet.certificateIssuerName,
    certificateIssuerTitle: quizSet.certificateIssuerTitle,
    // Theme
    themeColor: quizSet.themeColor,
    themeFont: quizSet.themeFont,
    themeLogo: quizSet.themeLogo,
    // Anti-cheat
    disableRightClick: quizSet.disableRightClick,
    disableCopyPaste: quizSet.disableCopyPaste,
    disableTranslate: quizSet.disableTranslate,
    disablePrint: quizSet.disablePrint,
    // Review settings
    showScore: quizSet.showScore,
    showOutline: quizSet.showOutline,
    showCorrectAnswers: quizSet.showCorrectAnswers,
    questionCount: quizSet.questions.length,
    questions: quizSet.questions,
    createdBy: quizSet.createdBy?.name ?? "Unknown",
    variantId: variantOverride?.id ?? null,
    shuffleAnswerOptions: variantOverride?.shuffleAnswerOptions ?? false,
    fixedQuestionIds: variantOverride?.fixedQuestionIds ? JSON.parse(variantOverride.fixedQuestionIds) : null,
    disablePrevButton: variantOverride?.disablePrevButton ?? quizSet.disablePrevButton ?? false,
  });
}
