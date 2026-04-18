import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// GET /api/quiz-sets/[id]/questions/export — CSV download
export async function GET(
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

  const quizSet = await db.quizSet.findFirst({
    where,
    include: {
      questions: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!quizSet) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const header =
    "stem,questionType,option_a,option_b,option_c,option_d,correctAnswer,explanation,difficulty,points";

  const rows = quizSet.questions.map((q) => {
    const opts = (q.options ?? []) as string[];
    const cols = [
      csvEscape(q.stem),
      csvEscape(q.questionType),
      csvEscape(opts[0] ?? ""),
      csvEscape(opts[1] ?? ""),
      csvEscape(opts[2] ?? ""),
      csvEscape(opts[3] ?? ""),
      csvEscape(q.correctAnswer ?? ""),
      csvEscape(q.explanation ?? ""),
      csvEscape(q.difficulty),
      String(q.points),
    ];
    return cols.join(",");
  });

  const csv = [header, ...rows].join("\n");
  const filename = `${quizSet.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_questions.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
