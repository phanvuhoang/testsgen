# TestsGen

A full-stack AI-powered assessment platform built with Next.js 14, PostgreSQL, and OpenRouter.

## Features

### Module 1 — Exam Platform
- Upload study documents (PDF, TXT, Word)
- AI generates exam questions per section with configurable difficulty mix
- Create mock exams from the question bank
- Students take timed mock exams; MCQ auto-graded, written answers AI-graded
- Detailed results analytics with score distribution charts

### Module 2 — Quiz Generator
- Create shareable quizzes with a 4-step wizard
- AI generates questions from a topic or pasted content
- Public quiz player with configurable time limits, pass marks, shuffle
- CSV import/export for questions
- Results dashboard with attempt analytics

### Admin Panel
- User management (create/edit/suspend users, role assignment)
- System settings: AI provider, API key, model selection
- AI connection test

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router, TypeScript) |
| Database | PostgreSQL + Prisma ORM |
| Auth | NextAuth.js v5 beta (JWT, Credentials) |
| UI | TailwindCSS + shadcn/ui |
| AI | OpenRouter (default), OpenAI, Anthropic, DeepSeek |
| Deployment | Docker + docker-compose / Coolify |

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 14+
- An OpenRouter API key (https://openrouter.ai)

### Local Development

1. **Clone and install:**
   ```bash
   git clone https://github.com/phanvuhoang/testsgen
   cd testsgen
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your database URL, NextAuth secret, and API keys
   ```

3. **Set up database:**
   ```bash
   npx prisma migrate dev --name init
   npx tsx prisma/seed.ts
   ```

4. **Start development server:**
   ```bash
   npm run dev
   ```

5. **Open:** http://localhost:3000

### Default Admin Credentials
- **Email:** `admin@testsgen.com`
- **Password:** `Admin@123456`

> Change this password immediately after first login.

## Docker Deployment (Coolify)

### Using docker-compose

1. **Copy environment file:**
   ```bash
   cp .env.docker .env
   # Edit .env with your production values
   ```

2. **Generate a secure secret:**
   ```bash
   openssl rand -base64 32  # Use output as NEXTAUTH_SECRET
   ```

3. **Start services:**
   ```bash
   docker-compose up -d
   ```

4. **Check logs:**
   ```bash
   docker-compose logs -f app
   ```

### Coolify Deployment

1. Create a new **Docker Compose** service in Coolify
2. Point to this repository
3. Add environment variables in Coolify's Environment tab (see `.env.docker`)
4. Set `NEXTAUTH_URL` to your Coolify-assigned domain
5. Deploy

The app automatically runs `prisma migrate deploy` and the seed script on startup.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | ✅ | Random 32-char secret for JWT signing |
| `NEXTAUTH_URL` | ✅ | Full URL of your deployment |
| `AI_PROVIDER` | ✅ | AI backend: `openrouter`, `openai`, `anthropic`, `deepseek` |
| `OPENROUTER_API_KEY` | ✅* | OpenRouter API key (if using openrouter) |
| `OPENAI_API_KEY` | ✅* | OpenAI API key (if using openai) |
| `ANTHROPIC_API_KEY` | ✅* | Anthropic API key (if using anthropic) |
| `DEEPSEEK_API_KEY` | ✅* | DeepSeek API key (if using deepseek) |
| `AI_MODEL_GENERATION` | ❌ | Model for question generation (default: `google/gemini-2.0-flash-001`) |
| `AI_MODEL_GRADING` | ❌ | Model for grading written answers |

\* One AI provider key is required.

## Project Structure

```
testsgen/
├── app/
│   ├── (auth)/login/          # Login page
│   ├── (dashboard)/           # Protected dashboard layout
│   │   ├── page.tsx           # Dashboard home
│   │   ├── quiz/              # Quiz Generator pages
│   │   ├── exams/             # Exam Platform pages
│   │   ├── users/             # User management (admin)
│   │   ├── settings/          # System settings (admin)
│   │   ├── my-exams/          # Student exam list
│   │   ├── take-quiz/         # Enter quiz code
│   │   └── profile/           # User profile
│   ├── quiz/[shareCode]/      # Public quiz player
│   └── api/                   # API routes
│       ├── auth/              # NextAuth handler
│       ├── projects/          # Exam projects CRUD
│       ├── sessions/          # Exam sessions + documents + AI generate
│       ├── mock-exams/        # Mock exams + attempts + grading
│       ├── quiz-sets/         # Quiz sets CRUD + AI generate + CSV
│       ├── quiz/              # Public quiz player API
│       ├── users/             # User management
│       ├── settings/          # System settings
│       └── upload/            # File upload
├── components/
│   ├── ui/                    # shadcn/ui components
│   └── layout/                # Sidebar, nav
├── lib/
│   ├── db.ts                  # Prisma singleton
│   ├── utils.ts               # Utility functions
│   └── ai/                    # AI provider abstraction
│       ├── index.ts           # generateQuizQuestions, generateExamQuestions, gradeWrittenAnswer
│       └── prompts.ts         # Prompt builders
├── prisma/
│   ├── schema.prisma          # All models (testsgen_* prefix)
│   └── seed.ts                # Admin user + default settings
├── scripts/
│   └── startup.ts             # Runs migrations + seed on boot
├── auth.ts                    # NextAuth v5 configuration
├── middleware.ts               # Route protection
├── Dockerfile                 # Multi-stage Docker build
└── docker-compose.yml         # Full stack with PostgreSQL
```

## Database Schema

All tables use the `testsgen_` prefix. Key models:

| Model | Table | Description |
|-------|-------|-------------|
| `User` | `testsgen_users` | Users with roles: ADMIN, TEACHER, STUDENT |
| `Project` | `testsgen_projects` | Exam projects |
| `Session` | `testsgen_sessions` | Exam sessions within a project |
| `Document` | `testsgen_documents` | Uploaded study materials |
| `ExamSection` | `testsgen_exam_sections` | Exam sections (MCQ, Essay, etc.) |
| `Question` | `testsgen_questions` | Exam question bank |
| `MockExam` | `testsgen_mock_exams` | Assembled mock exams |
| `QuizSet` | `testsgen_quiz_sets` | Quiz sets for Module 2 |
| `QuizQuestion` | `testsgen_quiz_questions` | Quiz question bank |
| `Attempt` | `testsgen_attempts` | Student exam/quiz attempts |
| `AttemptAnswer` | `testsgen_attempt_answers` | Per-question answers |
| `SystemSetting` | `testsgen_system_settings` | Key-value app settings |

## API Reference

### Authentication
```
POST /api/auth/[...nextauth]   NextAuth handler
```

### Quiz Sets (Module 2)
```
GET  /api/quiz-sets                   List quiz sets
POST /api/quiz-sets                   Create quiz set
GET  /api/quiz-sets/[id]              Get quiz set
PATCH /api/quiz-sets/[id]             Update quiz set
DELETE /api/quiz-sets/[id]            Delete quiz set
GET  /api/quiz-sets/[id]/questions    List questions
POST /api/quiz-sets/[id]/questions    Add question
PATCH /api/quiz-sets/[id]/questions/[qId]   Update question
DELETE /api/quiz-sets/[id]/questions/[qId]  Delete question
POST /api/quiz-sets/[id]/questions/import   Import from CSV
GET  /api/quiz-sets/[id]/questions/export   Export to CSV
POST /api/quiz-sets/[id]/generate     AI generate questions (SSE)
GET  /api/quiz-sets/[id]/attempts     List attempts with stats
```

### Public Quiz Player
```
GET  /api/quiz/[shareCode]                           Get quiz info
POST /api/quiz/[shareCode]/attempt                   Start attempt
POST /api/quiz/[shareCode]/attempt/[id]/answer       Save answer
POST /api/quiz/[shareCode]/attempt/[id]/submit       Submit + grade
```

### Exam Platform (Module 1)
```
GET  /api/projects            List projects
POST /api/projects            Create project
GET  /api/sessions/[id]/...   Session routes (documents, sections, generate, questions, mock-exams)
GET  /api/mock-exams/[id]/attempts          List attempts
POST /api/mock-exams/[id]/attempts          Start attempt
POST /api/mock-exams/[id]/attempts/[id]/answer   Save answer
POST /api/mock-exams/[id]/attempts/[id]/submit   Submit + grade
```

### Admin
```
GET  /api/users           List users
POST /api/users           Create user
PATCH /api/users/[id]     Update user
DELETE /api/users/[id]    Delete user
PATCH /api/users/me/password   Change own password
GET  /api/settings        Get settings
PATCH /api/settings       Update settings
POST /api/settings/test-ai   Test AI connection
```

## AI Integration

TestsGen uses OpenRouter by default, which provides access to 200+ AI models with a single API key.

### Recommended Models
- **Generation:** `google/gemini-2.0-flash-001` (fast, cost-effective)
- **Grading:** `google/gemini-2.0-flash-001` or `anthropic/claude-3.5-haiku`

### Streaming
All AI generation endpoints use SSE (Server-Sent Events). The client receives questions one-by-one as they are generated and saved to the database.

SSE event format:
```json
{ "type": "start", "message": "Starting AI generation..." }
{ "type": "question", "question": {...}, "progress": 1, "total": 10 }
{ "type": "complete", "message": "Generated 10 questions", "count": 10 }
data: [DONE]
```

## License

MIT

---

**Repository:** https://github.com/phanvuhoang/testsgen
