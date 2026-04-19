import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export async function GET(
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

  const quizSet = await db.quizSet.findFirst({
    where,
    include: {
      questions: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
      _count: {
        select: { attempts: true },
      },
    },
  });

  if (!quizSet) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(quizSet);
}

export async function PATCH(
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
    title,
    description,
    status,
    questionsPerAttempt,
    timeLimitMinutes,
    showAnswers,
    passMark,
    maxAttempts,
    access,
    passcode,
    allowedEmails,
    randomizeQuestions,
    displayMode,
    disablePrevButton,
    requireLogin,
    expiresAt,
    tags,
    theme,
    passMessage,
    failMessage,
    easyPercent,
    mediumPercent,
    hardPercent,
    identifyBy,
    // Testmoz parity fields
    allowBlankAnswers,
    penalizeIncorrect,
    showScore,
    showOutline,
    showCorrectAnswers,
    notificationEmail,
    disableRightClick,
    disableCopyPaste,
    disableTranslate,
    disablePrint,
    customIdentifierPrompt,
    language,
    introText,
    conclusionText,
    // Per-question feedback
    feedbackShowCorrect,
    feedbackShowAnswer,
    feedbackShowExplanation,
    // Certificate
    certificateEnabled,
    certificateTitle,
    certificateMessage,
    certificateBorderColor,
    certificateFont,
    certificateShowLogo,
    certificateShowScore,
    certificateShowDate,
    certificateIssuerName,
    certificateIssuerTitle,
    // Partial credits (MULTIPLE_RESPONSE)
    partialCredits,
    // Theme
    themeColor,
    themeFont,
    themeLogo,
  } = body;

  const updated = await db.quizSet.update({
    where: { id: params.id },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(status !== undefined && { status: status.toUpperCase() }),
      ...(questionsPerAttempt !== undefined && { questionsPerAttempt }),
      ...(timeLimitMinutes !== undefined && { timeLimitMinutes }),
      ...(showAnswers !== undefined && { showAnswers }),
      ...(passMark !== undefined && { passMark }),
      ...(maxAttempts !== undefined && { maxAttempts }),
      ...(access !== undefined && { access }),
      ...(passcode !== undefined && { passcode }),
      ...(allowedEmails !== undefined && { allowedEmails }),
      ...(randomizeQuestions !== undefined && { randomizeQuestions }),
      ...(displayMode !== undefined && { displayMode }),
      ...(disablePrevButton !== undefined && { disablePrevButton }),
      ...(requireLogin !== undefined && { requireLogin }),
      ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
      ...(tags !== undefined && { tags }),
      ...(theme !== undefined && { theme }),
      ...(passMessage !== undefined && { passMessage }),
      ...(failMessage !== undefined && { failMessage }),
      ...(easyPercent !== undefined && { easyPercent }),
      ...(mediumPercent !== undefined && { mediumPercent }),
      ...(hardPercent !== undefined && { hardPercent }),
      ...(identifyBy !== undefined && { identifyBy }),
      // Testmoz parity fields
      ...(allowBlankAnswers !== undefined && { allowBlankAnswers }),
      ...(penalizeIncorrect !== undefined && { penalizeIncorrect }),
      ...(showScore !== undefined && { showScore }),
      ...(showOutline !== undefined && { showOutline }),
      ...(showCorrectAnswers !== undefined && { showCorrectAnswers }),
      ...(notificationEmail !== undefined && { notificationEmail }),
      ...(disableRightClick !== undefined && { disableRightClick }),
      ...(disableCopyPaste !== undefined && { disableCopyPaste }),
      ...(disableTranslate !== undefined && { disableTranslate }),
      ...(disablePrint !== undefined && { disablePrint }),
      ...(customIdentifierPrompt !== undefined && { customIdentifierPrompt }),
      ...(language !== undefined && { language }),
      ...(introText !== undefined && { introText }),
      ...(conclusionText !== undefined && { conclusionText }),
      // Per-question feedback
      ...(feedbackShowCorrect !== undefined && { feedbackShowCorrect }),
      ...(feedbackShowAnswer !== undefined && { feedbackShowAnswer }),
      ...(feedbackShowExplanation !== undefined && { feedbackShowExplanation }),
      // Certificate
      ...(certificateEnabled !== undefined && { certificateEnabled }),
      ...(certificateTitle !== undefined && { certificateTitle }),
      ...(certificateMessage !== undefined && { certificateMessage }),
      ...(certificateBorderColor !== undefined && { certificateBorderColor }),
      ...(certificateFont !== undefined && { certificateFont }),
      ...(certificateShowLogo !== undefined && { certificateShowLogo }),
      ...(certificateShowScore !== undefined && { certificateShowScore }),
      ...(certificateShowDate !== undefined && { certificateShowDate }),
      ...(certificateIssuerName !== undefined && { certificateIssuerName }),
      ...(certificateIssuerTitle !== undefined && { certificateIssuerTitle }),
      ...(partialCredits !== undefined && { partialCredits }),
      // Theme
      ...(themeColor !== undefined && { themeColor }),
      ...(themeFont !== undefined && { themeFont }),
      ...(themeLogo !== undefined && { themeLogo }),
    },
    include: {
      _count: { select: { questions: true, attempts: true } },
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
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

  await db.quizSet.delete({ where: { id: params.id } });

  return NextResponse.json({ success: true });
}
