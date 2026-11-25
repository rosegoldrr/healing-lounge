'use strict';
/* 이메일 보내기 (비밀번호 찾기용). Brevo(무료 하루 300통) 사용: 환경변수 BREVO_API_KEY, MAIL_FROM(Brevo에서 인증한 보내는 주소)
   설정이 없으면 메일을 보내지 않고 서버 로그에만 링크를 찍어요 (내 컴퓨터 테스트용). */
const enabled = () => !!(process.env.BREVO_API_KEY && process.env.MAIL_FROM);
async function send(to, subject, text) {
  if (!enabled()) { console.log('[메일 미설정] 받는 사람:', to, '\n' + subject + '\n' + text); return false; }
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST', headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { email: process.env.MAIL_FROM, name: process.env.MAIL_NAME || 'Healing Lounge' }, to: [{ email: to }], subject, textContent: text }) });
  if (!r.ok) throw new Error('메일 전송 실패 ' + r.status);
  return true;
}
module.exports = { send, enabled };
