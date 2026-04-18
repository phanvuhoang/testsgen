import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

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
    { key: 'ai_provider', value: process.env.AI_PROVIDER || 'deepseek' },
    { key: 'ai_model_generation', value: process.env.AI_MODEL_GENERATION || 'deepseek-reasoner' },
    { key: 'ai_model_grading', value: process.env.AI_MODEL_GRADING || 'deepseek-reasoner' },
    { key: 'app_name', value: 'TestsGen' },
    { key: 'openrouter_models', value: process.env.OPENROUTER_MODELS || 'xiaomi/mimo-v2-pro,qwen/qwen3-plus,anthropic/claude-haiku-4-5' },
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
  await seedAdmin()
  await prisma.$disconnect()
  console.log('🚀 Startup complete — starting Next.js server...')
}

main().catch((e) => {
  console.error('Startup error:', e)
  process.exit(1)
})
