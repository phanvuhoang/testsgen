import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.mailgun.org',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: (process.env.SMTP_PORT || '465') === '465',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

export interface EmailResultOptions {
  to: string
  studentName: string
  quizTitle: string
  scoreType: 'score' | 'analytics' | 'comprehensive'
  score: number
  maxScore: number
  pct: number
  passed: boolean | null
  passMark: number
  answers?: Array<{
    stem: string
    answer: string
    isCorrect: boolean | null
    correctAnswer: string
    explanation: string | null
    marksAwarded: number | null
  }>
}

function buildEmailHtml(opts: EmailResultOptions): string {
  const { studentName, quizTitle, scoreType, score, maxScore, pct, passed, passMark, answers } = opts
  const passedText = passed === true ? '✅ PASSED' : passed === false ? '❌ FAILED' : ''
  const colorGreen = '#028a39'

  let body = `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px;">
      <div style="background: ${colorGreen}; color: white; padding: 20px 24px; border-radius: 8px 8px 0 0;">
        <h1 style="margin:0;font-size:20px;">📋 Quiz Result: ${quizTitle}</h1>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
        <p style="color:#374151;">Dear <strong>${studentName}</strong>,</p>
        <p>Here are your results for <strong>${quizTitle}</strong>:</p>
        <div style="background:#f9fafb;border-radius:8px;padding:16px;margin:16px 0;">
          <p style="margin:0;font-size:28px;font-weight:bold;color:${colorGreen};">${pct}%</p>
          <p style="margin:4px 0;color:#6b7280;font-size:14px;">Score: ${score}/${maxScore} | Pass mark: ${passMark}%</p>
          ${passedText ? `<p style="margin:8px 0;font-size:18px;font-weight:bold;">${passedText}</p>` : ''}
        </div>
  `

  if ((scoreType === 'analytics' || scoreType === 'comprehensive') && answers && answers.length > 0) {
    body += `<h3 style="color:#374151;margin-top:24px;">Question-by-Question Breakdown</h3>`
    answers.forEach((ans, i) => {
      const bgColor = ans.isCorrect === true ? '#f0fdf4' : ans.isCorrect === false ? '#fef2f2' : '#f9fafb'
      const borderColor = ans.isCorrect === true ? '#86efac' : ans.isCorrect === false ? '#fca5a5' : '#e5e7eb'
      const statusText = ans.isCorrect === true ? '✅' : ans.isCorrect === false ? '❌' : '—'
      body += `
        <div style="border:1px solid ${borderColor};background:${bgColor};border-radius:6px;padding:12px;margin-bottom:8px;">
          <p style="margin:0;font-weight:600;font-size:13px;">${statusText} Q${i + 1}: ${ans.stem}</p>
          <p style="margin:4px 0;font-size:13px;color:#374151;">Your answer: <strong>${ans.answer || '(blank)'}</strong></p>
          ${scoreType === 'comprehensive' && ans.correctAnswer ? `<p style="margin:4px 0;font-size:13px;color:#059669;">Correct answer: <strong>${ans.correctAnswer}</strong></p>` : ''}
          ${scoreType === 'comprehensive' && ans.explanation ? `<p style="margin:4px 0;font-size:12px;color:#6b7280;font-style:italic;">Explanation: ${ans.explanation}</p>` : ''}
          ${ans.marksAwarded != null ? `<p style="margin:4px 0;font-size:12px;color:#6b7280;">Marks: ${ans.marksAwarded}</p>` : ''}
        </div>
      `
    })
  }

  body += `
        <p style="color:#9ca3af;font-size:12px;margin-top:24px;">This email was sent by TestsGen.</p>
      </div>
    </div>
  `
  return body
}

export async function sendResultEmail(opts: EmailResultOptions): Promise<void> {
  const html = buildEmailHtml(opts)
  const subject = `Your result for "${opts.quizTitle}" — ${opts.pct}% ${opts.passed === true ? '(Passed)' : opts.passed === false ? '(Failed)' : ''}`

  await transporter.sendMail({
    from: process.env.SMTP_USER || 'noreply@testsgen.com',
    to: opts.to,
    subject,
    html,
  })
}
