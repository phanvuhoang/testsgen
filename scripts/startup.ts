import { execSync } from 'child_process'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function runMigrations() {
  console.log('🔄 Running database migrations...')
  try {
    execSync('npx prisma migrate deploy', { stdio: 'inherit' })
    console.log('✅ Migrations complete')
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

async function seedAdmin() {
  console.log('🌱 Running seed check...')
  const adminEmail = 'admin@testsgen.com'
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  })

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash('Admin@123456', 12)
    await prisma.user.create({
      data: {
        name: 'Admin',
        email: adminEmail,
        password: hashedPassword,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    })
    console.log('✅ Admin created: admin@testsgen.com / Admin@123456')
  } else {
    console.log('ℹ️  Admin already exists, skipping')
  }

  // Initialize default system settings if not present
  const defaultSettings = [
    { key: 'ai_provider', value: process.env.AI_PROVIDER || 'openrouter' },
    { key: 'ai_model_generation', value: process.env.AI_MODEL_GENERATION || 'google/gemini-2.0-flash-001' },
    { key: 'ai_model_grading', value: process.env.AI_MODEL_GRADING || 'google/gemini-2.0-flash-001' },
    { key: 'app_name', value: 'TestsGen' },
    { key: 'openrouter_models', value: process.env.OPENROUTER_MODELS || 'google/gemini-2.0-flash-001,anthropic/claude-3.5-haiku,meta-llama/llama-3.3-70b-instruct,deepseek/deepseek-chat-v3-0324,mistralai/mistral-small-3.1-24b-instruct' },
  ]

  for (const setting of defaultSettings) {
    const existing = await prisma.systemSetting.findUnique({
      where: { key: setting.key },
    })
    if (!existing) {
      await prisma.systemSetting.create({ data: setting })
    }
  }
}

async function main() {
  await runMigrations()
  await seedAdmin()
  await prisma.$disconnect()
  console.log('🚀 Startup complete — starting Next.js server...')
}

main().catch((e) => {
  console.error('Startup error:', e)
  process.exit(1)
})
