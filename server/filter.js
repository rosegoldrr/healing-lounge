/* 거친 말을 칭찬하는 말로 바꿔 주는 필터
   - 띄어쓰기·반복·특수문자로 피해 가는 것도 잡아요 (시 발, 시이발, 시@발)
   - 걸리면 그 부분만 칭찬 단어로 바꿔서 내보내요 */
'use strict';

/* 바꿀 말 (뿌리 글자만 적어 두면 변형도 함께 잡혀요) */
const BAD = [
  '시발', '씨발', '씨바', '시바알', '쓰발', '씨팔', '시팔', '씹', '좆', '존나', '좃나', '조낸', '졸라',
  '병신', '븅신', '빙신', '등신', '머저리', '멍청', '바보', '등신같',
  'ㅅㅂ', 'ㅄ', 'ㅂㅅ', 'ㅈㄹ', 'ㄱㅅㄲ', 'ㅆㅂ', 'ㅈㄴ', 'ㅗ',
  '개새끼', '개세끼', '새끼', '쌔끼', '개놈', '개년', '개같', '개소리', '개지랄', '지랄', '니미', '느금',
  '엄창', '애미', '애비', '늬미', '썅', '쌍놈', '쌍년', '잡놈', '잡년',
  '꺼져', '닥쳐', '뒤져', '디져', '뒈져', '죽어라', '죽을래', '패버린',
  '미친놈', '미친년', '또라이', '돌아이', '정신병자', '찐따', '루저', '한남충', '김치녀', '급식충', '맘충', '틀딱', '좀비같',
  '변태', '성추행', '강간',
  'fuck', 'fucking', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'damn', 'retard', 'idiot', 'stupid'
];

/* 바뀌어 나갈 칭찬 말 */
const PRAISE = [
  '사랑', '칭찬', '최고', '햇살', '행복', '꽃', '무지개', '천사', '보물', '복덩이',
  '반짝반짝', '다정', '멋짐', '귀여움', '고마움', '포근함', '응원', '토닥토닥', '화이팅', '수고했어'
];

/* 영어 꼼수 글자 되돌리기 (f*ck, sh1t 같은 것) */
const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i', '*': '', '＠': 'a' };

const esc = c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* '시발' → /시+[\s\W_]*발+/  : 띄어쓰기·반복·특수문자를 사이에 끼워도 잡아요 */
function toPattern(word) {
  const body = Array.from(word).map(c => esc(c) + '+').join('[\\s\\W_0-9]{0,3}');
  return new RegExp(body, 'gi');
}
const PATTERNS = BAD.map(toPattern);

/* 영어 꼼수를 되돌린 사본에서도 한 번 더 검사 */
function deLeet(s) {
  return Array.from(s).map(c => (LEET[c] !== undefined ? LEET[c] : c)).join('');
}

let pi = 0;
function praise() { pi = (pi + 1 + Math.floor(Math.random() * 3)) % PRAISE.length; return PRAISE[pi]; }

/* text → { text: 바뀐 글, changed: 바뀐 횟수 } */
function clean(text) {
  let out = String(text == null ? '' : text), changed = 0;
  for (let pass = 0; pass < 2; pass++) {
    const target = pass === 0 ? out : deLeet(out);
    if (pass === 1 && target === out) break;              // 바뀐 게 없으면 두 번째 검사 생략
    for (const re of PATTERNS) {
      re.lastIndex = 0;
      if (!re.test(target)) continue;
      re.lastIndex = 0;
      if (pass === 0) out = out.replace(re, () => { changed++; return praise(); });
      else {
        /* 꼼수 사본에서 찾았으면 같은 자리를 원문에서 지워요 */
        re.lastIndex = 0;
        let m, cut = [];
        while ((m = re.exec(target)) !== null) { cut.push([m.index, m.index + m[0].length]); if (m[0].length === 0) re.lastIndex++; }
        for (let k = cut.length - 1; k >= 0; k--) { out = out.slice(0, cut[k][0]) + praise() + out.slice(cut[k][1]); changed++; }
      }
    }
  }
  out = out.replace(/\s+/g, ' ').trim();
  return { text: out, changed };
}

module.exports = { clean, PRAISE };
