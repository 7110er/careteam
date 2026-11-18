/**
 * 健康識能閘門（藍圖 8.3、8.8）——單一來源。
 * 同一份檔案用於：後端儲存單張（Apps Script）、前端即時檢查（建置時複製）、內容包建置（Node require）。
 * 這是自動代理檢查，不是經驗證的中文可讀性公式；PEMAT-P 與 CDC CCI 須人工評分。
 * 規則方法來源登錄於 Dict_LiteracyRule（source_ids），本檔只實作檢查。
 *
 * 文字類型 type：
 *   'sentence' 一般病人端文字   'tb' 教回問句   'redflag' 求助徵兆（症狀：行動）
 *   'commit' 承諾行動          'howto' 怎麼吃（服藥時程）   'decision' 決策輔助（允許「每 100 人中約 N 人」）
 */
var LIT_MAX_WIDTH = 20;
var LIT_UNIT_WHITELIST = ['mg', 'mL', 'ml', 'kg', 'cm', 'mmHg', 'B', 'C', 'X'];
var LIT_CLOSED_Q = ['懂不懂', '懂嗎', '好不好', '對不對', '是不是', '會不會', '知道嗎', '了解嗎', '清楚嗎', '可以嗎', '明白嗎', '有沒有問題'];
var LIT_PERIOD_WORDS = ['早上', '中午', '傍晚', '睡前'];

function litWidth_(s) {
  var w = 0;
  for (var i = 0; i < s.length; i++) w += s.charCodeAt(i) < 128 ? 0.5 : 1;
  return w;
}
function litSentences_(text) {
  return String(text || '').split(/[。！？!?；;\n]/).map(function (x) { return x.trim(); }).filter(function (x) { return x.length > 0; });
}

/**
 * @param {string} text
 * @param {string} type
 * @param {{banned?:Array<{word:string,replace?:string,type?:string}>}} ctx
 * @return {{errors:string[], warnings:string[]}}
 */
function literacyCheck(text, type, ctx) {
  ctx = ctx || {};
  type = type || 'sentence';
  var errors = [], warnings = [];
  var t = String(text || '');
  if (!t.trim()) return { errors: errors, warnings: warnings };

  // 每句寬度（ASCII 計 0.5）；求助徵兆以「症狀：行動」整段計
  var sents = type === 'redflag' ? t.split(/\n/).map(function (x) { return x.trim(); }).filter(Boolean) : litSentences_(t);
  var maxW = type === 'redflag' ? 32 : LIT_MAX_WIDTH;
  sents.forEach(function (s) { if (litWidth_(s) > maxW) errors.push('句子過長（' + litWidth_(s) + '，上限 ' + maxW + '）：' + s); });

  // 英文字詞（單位白名單除外）
  var eng = t.match(/[A-Za-z]{2,}/g) || [];
  eng.forEach(function (w) { if (LIT_UNIT_WHITELIST.indexOf(w) < 0) errors.push('含英文字詞：' + w); });

  // 百分比、分數
  if (/[%％]|百分之/.test(t)) errors.push('含百分比');
  if (/\d+\s*\/\s*\d+/.test(t) && type !== 'decision') errors.push('含分數或斜線數字');
  if (/[一二三四五六七八九十\d]+分之[一二三四五六七八九十\d]+/.test(t)) errors.push('含分數');
  if (type === 'decision') {
    var nums = t.match(/\d+/g) || [];
    if (nums.length && !/每\s*(100|1000|一百|一千)\s*(個)?人(中|裡)?(約|大約)?\s*\d+\s*(個)?人/.test(t)) errors.push('決策輔助數字須以「每 100 人中約 N 人」表示');
  }

  // 時鐘時間
  // 時鐘時間：「8:00」「8點」「早上八點」「九點半」「三點鐘」；不誤判「一點點」「清淡一點」「重點」
  var tClock = t.replace(/重點|一點點|點心|點滴|地點|觀點|缺點|優點|點頭|點藥|點眼|點鼻/g, '');
  if (/\d{1,2}\s*[:：]\s*\d{2}/.test(tClock) || /\d{1,2}\s*點/.test(tClock) ||
      /(上午|下午|早上|晚上|凌晨|中午|傍晚)\s*[一二三四五六七八九十兩]+\s*點/.test(tClock) || /[一二三四五六七八九十兩]+\s*點\s*(鐘|半)/.test(tClock)) errors.push('含時鐘時間，請改用早上／中午／傍晚／睡前');
  if (type === 'howto') {
    if (/一天\s*[一二三四五六七八九十\d]+\s*次|每日\s*[一二三四五六七八九十\d]+\s*次/.test(t)) errors.push('服藥時程請用早上／中午／傍晚／睡前，不用「一天幾次」');
    if (!LIT_PERIOD_WORDS.some(function (w) { return t.indexOf(w) >= 0; }) && t.indexOf('依藥袋') < 0) errors.push('怎麼吃須用四個時段詞或「依藥袋」（病人端劑量一律依藥袋）');
  }

  // 禁用詞
  (ctx.banned || []).forEach(function (b) {
    if (b.word && t.indexOf(b.word) >= 0) errors.push('含禁用詞「' + b.word + '」' + (b.replace ? '，建議改為「' + b.replace + '」' : ''));
  });

  if (type === 'tb') {
    if (!/[？?]$/.test(t.trim())) errors.push('教回問句須為問句（以？結尾）');
    LIT_CLOSED_Q.forEach(function (q) { if (t.indexOf(q) >= 0) errors.push('教回問句須為開放式，不可用「' + q + '」'); });
  }
  if (type === 'redflag') {
    var segs = t.split(/\n/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (segs.length < 1 || segs.length > 3) errors.push('求助徵兆須 1–3 段');
    segs.forEach(function (s) { if (!/^[^：:]+[：:].+$/.test(s)) errors.push('求助徵兆格式須為「症狀：行動」：' + s); });
  }
  if (type === 'commit') {
    if (!/^我/.test(t.trim())) errors.push('承諾行動須以病人為主詞（以「我」開頭）');
    if (litSentences_(t).length > 1) errors.push('承諾行動限單一行為');
  }
  // 每段 ≤ 3 句（警告）
  t.split(/\n{2,}/).forEach(function (para) { if (litSentences_(para).length > 3) warnings.push('段落超過 3 句'); });
  return { errors: errors, warnings: warnings };
}

/** 建議強度與措辭對應（藍圖 10.6 第 4 點）；wordingRows 來自 Dict_StrengthWording */
function strengthWordingCheck(text, strength, wordingRows) {
  var errors = [];
  var cls = strengthClass(strength);
  (wordingRows || []).forEach(function (r) {
    if (r['強度類別'] !== cls) return;
    String(r['禁止措辭'] || '').split(/[|｜]/).map(function (x) { return x.trim(); }).filter(Boolean).forEach(function (w) {
      if (String(text || '').indexOf(w) >= 0) errors.push('建議強度為「' + strength + '」，不可使用「' + w + '」');
    });
  });
  return errors;
}
/** 依原文建議強度字串歸類：強／有條件／反對／未分級 */
function strengthClass(strength) {
  var s = String(strength || '');
  if (!s || /未分級|未分类|ungraded/i.test(s)) return '未分級';
  if (/反對|不建議|against|Class\s*III|harm|no benefit/i.test(s)) return '反對';
  if (/有條件|弱|conditional|weak|Class\s*II[ab]|2[ABCD]|考慮/i.test(s)) return '有條件';
  if (/強|strong|Class\s*I\b|1[ABCD]|建議/i.test(s)) return '強';
  return '未分級';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { literacyCheck: literacyCheck, strengthWordingCheck: strengthWordingCheck, strengthClass: strengthClass, litWidth_: litWidth_, LIT_MAX_WIDTH: LIT_MAX_WIDTH };
}
