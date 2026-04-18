import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// POST /api/quiz-sets/[id]/questions/import
// CSV format: stem,questionType,option_a,option_b,option_c,option_d,correctAnswer,explanation,difficulty,points
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const where =
    session.user.role === "admin"
      ? { id: params.id }
      : { id: params.id, createdById: session.user.id };

  const quizSet = await db.quizSet.findFirst({ where });
  if (!quizSet) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let csvText = "";

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    csvText = await file.text();
  } else {
    const body = await req.json();
    csvText = body.csv ?? "";
  }

  if (!csvText.trim()) {
    return NextResponse.json({ error: "Empty CSV" }, { status: 400 });
  }

  const lines = csvText.trim().split("\n");
  const startIdx = lines[0].toLowerCase().includes("stem") || lines[0].toLowerCase().includes("question") ? 1 : 0;

  const created: { id: string }[] = [];
  const errors: { row: number; error: string }[] = [];

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseCSVLine(line);
    const [
      stemText,
      typeRaw,
      optA,
      optB,
      optC,
      optD,
      correctAnswer,
      explanation,
      difficultyRaw,
      pointsStr,
    ] = cols;

    if (!stemText || !correctAnswer) {
      errors.push({ row: i + 1, error: "Missing required fields (stem, correctAnswer)" });
      continue;
    }

    const questionTypeMap: Record<string, string> = {
      mcq: "MCQ",
      "true_false": "TRUE_FALSE",
      short_answer: "SHORT_ANSWER",
      short: "SHORT_ANSWER",
    };
    const questionType = questionTypeMap[(typeRaw ?? "mcq").toLowerCase().trim()] ?? "MCQ";

    const difficultyMap: Record<string, string> = {
      easy: "EASY",
      medium: "MEDIUM",
      hard: "HARD",
    };
    const difficulty = difficultyMap[(difficultyRaw ?? "medium").toLowerCase().trim()] ?? "MEDIUM";

    const options: string[] = [];
    if (optA) options.push(optA.trim());
    if (optB) options.push(optB.trim());
    if (optC) options.push(optC.trim());
    if (optD) options.push(optD.trim());

    const points = parseFloat(pointsStr ?? "1") || 1;

    try {
      const q = await db.quizQuestion.create({
        data: {
          quizSetId: params.id,
          stem: stemText.trim(),
          questionType: questionType as any,
          options: options as any,
          correctAnswer: correctAnswer.trim(),
          explanation: explanation?.trim() || null,
          difficulty: difficulty as any,
          points,
        },
      });
      created.push({ id: q.id });
    } catch (err) {
      errors.push({ row: i + 1, error: String(err) });
    }
  }

  return NextResponse.json({
    imported: created.length,
    errors,
    total: lines.length - startIdx,
  });
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}
