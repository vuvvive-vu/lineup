const RESEND_API_KEY = process.env.EMAIL_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'onboarding@resend.dev';
const SITE_URL = process.env.SITE_URL || 'http://localhost:3000';

async function sendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    console.log(`[EMAIL] (нет API ключа) Кому: ${to} | Тема: ${subject}`);
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html })
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('[EMAIL] Ошибка:', err);
      return false;
    }
    console.log(`[EMAIL] Отправлено: ${to} | ${subject}`);
    return true;
  } catch (e) {
    console.error('[EMAIL] Ошибка отправки:', e.message);
    return false;
  }
}

async function sendVerifyCode(email, code) {
  return sendEmail({
    to: email,
    subject: `Код подтверждения: ${code} — togetherly`,
    html: `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:40px 20px;color:#111;">
        <h2 style="font-size:22px;font-weight:700;margin-bottom:16px;">Код подтверждения</h2>
        <p style="font-size:14px;color:#555;line-height:1.6;margin-bottom:24px;">Введите этот код на сайте:</p>
        <div style="font-size:36px;font-weight:700;letter-spacing:8px;text-align:center;padding:24px;background:#f5f5f5;border-radius:12px;margin-bottom:24px;">${code}</div>
        <p style="font-size:12px;color:#999;margin-top:32px;">Код действителен в течение 10 минут. Если вы не создавали аккаунт — игнорируйте это письмо.</p>
      </div>
    `
  });
}

async function sendResetEmail(email, token) {
  const code = token;
  return sendEmail({
    to: email,
    subject: `Код сброса пароля: ${code} — togetherly`,
    html: `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:40px 20px;color:#111;">
        <h2 style="font-size:22px;font-weight:700;margin-bottom:16px;">Сброс пароля</h2>
        <p style="font-size:14px;color:#555;line-height:1.6;margin-bottom:24px;">Введите этот код на сайте:</p>
        <div style="font-size:36px;font-weight:700;letter-spacing:8px;text-align:center;padding:24px;background:#f5f5f5;border-radius:12px;margin-bottom:24px;">${code}</div>
        <p style="font-size:12px;color:#999;margin-top:32px;">Код действителен в течение 1 часа. Если вы не запрашивали сброс — игнорируйте это письмо.</p>
      </div>
    `
  });
}

module.exports = { sendVerifyCode, sendResetEmail };
