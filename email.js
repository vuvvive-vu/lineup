const RESEND_API_KEY = process.env.EMAIL_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@togetherly.online';
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

async function sendVerifyEmail(email, token) {
  const link = `${SITE_URL}/verify?token=${token}`;
  return sendEmail({
    to: email,
    subject: 'Подтвердите почту — togetherly',
    html: `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:40px 20px;color:#111;">
        <h2 style="font-size:22px;font-weight:700;margin-bottom:16px;">Добро пожаловать в togetherly!</h2>
        <p style="font-size:14px;color:#555;line-height:1.6;margin-bottom:24px;">Подтвердите свою почту, нажав кнопку ниже:</p>
        <a href="${link}" style="display:inline-block;background:#000;color:#fff;padding:14px 32px;border-radius:999px;text-decoration:none;font-weight:700;font-size:14px;">Подтвердить почту</a>
        <p style="font-size:12px;color:#999;margin-top:32px;">Если вы не создавали аккаунт — просто игнорируйте это письмо.</p>
      </div>
    `
  });
}

async function sendResetEmail(email, token) {
  const link = `${SITE_URL}/reset?token=${token}`;
  return sendEmail({
    to: email,
    subject: 'Сброс пароля — togetherly',
    html: `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:40px 20px;color:#111;">
        <h2 style="font-size:22px;font-weight:700;margin-bottom:16px;">Сброс пароля</h2>
        <p style="font-size:14px;color:#555;line-height:1.6;margin-bottom:24px;">Нажмите кнопку ниже, чтобы задать новый пароль:</p>
        <a href="${link}" style="display:inline-block;background:#000;color:#fff;padding:14px 32px;border-radius:999px;text-decoration:none;font-weight:700;font-size:14px;">Задать новый пароль</a>
        <p style="font-size:12px;color:#999;margin-top:32px;">Ссылка действительна в течение 1 часа. Если вы не запрашивали сброс — игнорируйте это письмо.</p>
      </div>
    `
  });
}

module.exports = { sendVerifyEmail, sendResetEmail };
