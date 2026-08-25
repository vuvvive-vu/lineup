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

function detectDevice(ua) {
  if (!ua) return 'Неизвестное устройство';
  if (/android/i.test(ua)) return 'Android';
  if (/iphone|ipad/i.test(ua)) return 'iOS';
  if (/windows/i.test(ua)) return 'Windows';
  if (/macintosh|mac os/i.test(ua)) return 'macOS';
  if (/linux/i.test(ua)) return 'Linux';
  return 'Неизвестное устройство';
}

async function sendVerifyCode(email, code, username, device) {
  const deviceStr = device || 'Неизвестное устройство';
  return sendEmail({
    to: email,
    subject: `Код подтверждения: ${code} — togetherly`,
    html: `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:40px 20px;color:#111;">
        <p style="font-size:15px;color:#333;line-height:1.6;margin-bottom:24px;">Привет, <b>${username}</b>!</p>
        <p style="font-size:15px;color:#333;line-height:1.6;margin-bottom:8px;">Регистрация нового электронного адреса требует дальнейшей проверки.</p>
        <p style="font-size:15px;color:#333;line-height:1.6;margin-bottom:24px;">Чтобы завершить регистрацию в системе, введите шестизначный код проверки.</p>
        <p style="font-size:13px;color:#888;margin-bottom:4px;">Устройство: <b>${deviceStr}</b></p>
        <div style="font-size:14px;color:#888;margin-bottom:16px;">Код подтверждения:</div>
        <div style="font-size:42px;font-weight:700;letter-spacing:12px;text-align:center;padding:28px;background:#f5f5f5;border-radius:12px;margin-bottom:28px;color:#111;">${code}</div>
        <p style="font-size:13px;color:#999;line-height:1.6;margin-bottom:32px;">Если вы не пытались зарегистрироваться на сайте по адресу <a href="https://www.togetherly.online" style="color:#999;">www.togetherly.online</a> — просто проигнорируйте данное сообщение.</p>
        <p style="font-size:13px;color:#999;">Спасибо,<br>Команда Togetherly.</p>
      </div>
    `
  });
}

async function sendResetEmail(email, code, username) {
  return sendEmail({
    to: email,
    subject: `Код сброса пароля: ${code} — togetherly`,
    html: `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:40px 20px;color:#111;">
        <p style="font-size:15px;color:#333;line-height:1.6;margin-bottom:24px;">Привет, <b>${username || ''}</b>!</p>
        <p style="font-size:15px;color:#333;line-height:1.6;margin-bottom:24px;">Вы запросили сброс пароля. Введите код ниже:</p>
        <div style="font-size:14px;color:#888;margin-bottom:16px;">Код сброса:</div>
        <div style="font-size:42px;font-weight:700;letter-spacing:12px;text-align:center;padding:28px;background:#f5f5f5;border-radius:12px;margin-bottom:28px;color:#111;">${code}</div>
        <p style="font-size:13px;color:#999;line-height:1.6;margin-bottom:32px;">Код действителен в течение 1 часа. Если вы не запрашивали сброс — игнорируйте это письмо.</p>
        <p style="font-size:13px;color:#999;">Спасибо,<br>Команда Togetherly.</p>
      </div>
    `
  });
}

module.exports = { sendVerifyCode, sendResetEmail, detectDevice };
