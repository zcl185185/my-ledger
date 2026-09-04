import type { Account, Category } from '../types';
import type { EntryDraft } from '../store/ui';

const BANK_NAMES = [
  '中国工商银行', '工商银行', '中国农业银行', '农业银行', '中国建设银行', '建设银行',
  '中国银行', '交通银行', '招商银行', '邮储银行', '中国邮政储蓄银行', '浦发银行',
  '中信银行', '光大银行', '民生银行', '兴业银行', '平安银行', '广发银行', '华夏银行',
  '北京银行', '上海银行', '微信', '支付宝', '余额宝', '现金',
];

const CATEGORY_HINTS: Array<{ names: string[]; words: string[] }> = [
  { names: ['餐饮', '吃饭', '饮食'], words: ['外卖', '餐厅', '饭店', '奶茶', '咖啡', '美团', '饿了么', '肯德基', '麦当劳', '瑞幸', '星巴克', '霸王茶姬'] },
  { names: ['交通', '出行'], words: ['滴滴', '打车', '地铁', '公交', '高铁', '火车', '机票', '加油', '停车', '高速'] },
  { names: ['购物'], words: ['淘宝', '天猫', '京东', '拼多多', '超市', '便利店', '商场', '购物'] },
  { names: ['娱乐'], words: ['电影', '影院', '游戏', 'KTV', '娱乐'] },
  { names: ['住房', '居住'], words: ['房租', '物业', '水费', '电费', '燃气'] },
  { names: ['通讯', '话费'], words: ['话费', '移动', '联通', '电信', '宽带'] },
  { names: ['医疗', '健康'], words: ['医院', '药店', '医疗', '挂号'] },
  { names: ['工资'], words: ['工资', '薪资', '薪酬'] },
];

function cleanText(value: string) {
  // “打开 URL”在部分 iOS 版本中会把已经 URL 编码的变量再编码一次。
  // URLSearchParams 只解一层，这里最多再解两层，直到恢复成 OCR 原文。
  let decoded = value;
  for (let i = 0; i < 2 && /%[0-9a-f]{2}/i.test(decoded); i += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  // OCR 可能返回全角数字、中文标点或不可见空格，先统一，后面的规则才能稳定工作。
  const normalized = decoded
    // 某些快捷指令版本会把换行保留成字面量“\\n”。
    .replace(/\\r?\\n/g, '\n')
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[＋﹢]/g, '+')
    .replace(/[－﹣−–—]/g, '-')
    .replace(/[，]/g, ',')
    .replace(/[。．]/g, '.')
    .replace(/(\d)[·•](\d)/g, '$1.$2')
    // OCR 可能把金额拆成 “- 0 . 19” 或 “￥ 3 . 84”，统一去掉数字周围的空格。
    .replace(/(\d)\s*[.,]\s*(\d)/g, '$1.$2')
    .replace(/([¥￥+-])\s+(?=\d)/g, '$1')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '');
  return normalized.replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
}

/**
 * 快捷指令推荐用 Base64 传 OCR 原文，比百分号编码短很多，也不容易被“打开 URL”二次编码。
 * URLSearchParams 会把 Base64 中的 + 读成空格；这里同时兼容标准/Base64URL 和换行。
 */
export function decodeQuickEntryData(value: string): string | undefined {
  try {
    let encoded = value.trim();
    for (let i = 0; i < 2 && /%[0-9a-f]{2}/i.test(encoded); i += 1) {
      const next = decodeURIComponent(encoded);
      if (next === encoded) break;
      encoded = next;
    }
    let base64 = encoded.replace(/[\r\n\t]/g, '').replace(/ /g, '+').replace(/-/g, '+').replace(/_/g, '/');
    base64 = base64.replace(/[^A-Za-z0-9+/=]/g, '');
    base64 = base64.replace(/=+$/, '');
    base64 += '='.repeat((4 - (base64.length % 4)) % 4);
    if (!base64) return undefined;
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return decoded.trim() ? decoded : undefined;
  } catch {
    return undefined;
  }
}

function parseAmount(text: string) {
  interface Candidate {
    value: string;
    score: number;
    source: string;
    order: number;
  }

  const candidates = new Map<string, Candidate>();
  let order = 0;
  const add = (rawValue: string | undefined, score: number, source: string) => {
    if (!rawValue) return;
    let raw = rawValue.replace(/[¥￥元\s]/g, '').replace(/^[-+]/, '').trim();
    // 同时出现点和逗号时，逗号通常是千位分隔；只有逗号时，末尾 1~2 位按小数处理。
    if (raw.includes('.') && raw.includes(',')) raw = raw.replace(/,/g, '');
    else if (/^\d{1,8},\d{1,2}$/.test(raw)) raw = raw.replace(',', '.');
    else raw = raw.replace(/,/g, '');
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 99999999) return;
    const value = amount.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
    const current = candidates.get(value);
    if (!current || score > current.score) candidates.set(value, { value, score, source, order: order++ });
  };

  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const numberPattern = '(?:\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d{1,8}(?:[.,]\\d{1,2})?)';
  const amountPattern = `[¥￥]?\\s*[-+]?\\s*${numberPattern}\\s*元?`;
  const highLabels = /(?:实付金额|支付金额|付款金额|实际支付|实际付款|消费金额|支出金额|收入金额|收款金额|到账金额|本次支付|本次付款)/i;
  const mediumLabels = /(?:订单金额|商品金额|应付金额|交易金额|合计|总计)/i;
  const anyLabel = new RegExp(`(?:${highLabels.source}|${mediumLabels.source}|金额)`, 'i');
  const excludedContext = /(?:优惠|立减|折扣|红包|代金券|积分|原价|余额|剩余|退款金额|可用额度)/i;

  // 1. 优先取“实付/付款”等明确标签；订单原价与模糊的“金额”降低优先级。
  for (const [index, line] of lines.entries()) {
    const label = highLabels.test(line) ? highLabels : mediumLabels.test(line) ? mediumLabels : /金额/i.test(line) ? /金额/i : undefined;
    if (!label || (excludedContext.test(line) && !highLabels.test(line))) continue;
    const score = label === highLabels ? 145 : label === mediumLabels ? 118 : 96;
    const inline = line.match(new RegExp(`${label.source}\\s*[:：]?\\s*(${amountPattern})`, 'i'));
    if (inline) add(inline[1], score, label === highLabels ? '明确金额标签' : '金额标签');
    // OCR 有时把标签和值拆成上下两行。
    if (anyLabel.test(line) && index + 1 < lines.length) {
      const nextLine = lines[index + 1];
      const next = nextLine?.match(new RegExp(`^(${amountPattern})$`));
      if (next) add(next[1], score - 3, '金额标签下一行');
    }
  }

  // 2. 微信账单详情常把消费金额单独放一行，如“-0.19”。这是最可靠的无标签形态。
  for (const [index, line] of lines.entries()) {
    const standalone = line.match(new RegExp(`^(${amountPattern})$`));
    if (!standalone) continue;
    const raw = standalone[1];
    if (!raw) continue;
    const signed = /^[-+]/.test(raw.replace(/\s/g, ''));
    const currency = /[¥￥]/.test(raw);
    const nearby = lines.slice(Math.max(0, index - 2), index + 3).join('');
    const paymentContext = /(?:支付|付款|收款|实付|消费|交易成功|已付|已收)/.test(nearby);
    add(raw, signed ? 138 : currency ? (paymentContext ? 132 : 112) : (paymentContext ? 102 : 82), signed ? '带负号独占一行' : currency ? '货币金额独占一行' : '独占一行');
  }

  // 3. 带货币符号的金额，即使和其他文字在一行，也有较高可信度。
  const currencyPattern = new RegExp(`[¥￥]\\s*[-+]?\\s*(${numberPattern})`, 'g');
  let match: RegExpExecArray | null;
  while ((match = currencyPattern.exec(text))) {
    if (!match[1]) continue;
    const context = text.slice(Math.max(0, match.index - 12), match.index + match[0].length + 12);
    if (excludedContext.test(context) && !highLabels.test(context)) continue;
    add(match[1], /(?:支付|付款|实付|收款|消费)/.test(context) ? 125 : 100, '货币符号');
  }

  // 4. 最后才使用普通小数兜底；日期、交易单号等长数字不参与。
  const decimalPattern = /(?:^|[^\d])([-+]?\d{1,8}[.,]\d{1,2})(?=$|[^\d])/g;
  while ((match = decimalPattern.exec(text))) {
    const raw = match[1];
    if (!raw) continue;
    const start = match.index + (match[0].startsWith(raw) ? 0 : match[0].length - raw.length);
    const before = text.slice(Math.max(0, start - 8), start);
    const after = text.slice(start + raw.length, start + raw.length + 8);
    // 日期中的 2026.09、交易号中的长数字不应被当作金额。
    if (/\d$/.test(before) || /^\.\d/.test(after)) continue;
    add(raw, 20, '普通小数');
  }

  // OCR 偶尔会丢掉小数点，但仍保留付款金额前的负号，例如“已支付 -384”。
  // 只有带负号且不是长编号时才使用这个低优先级兜底，避免误把订单号当金额。
  const signedIntegerPattern = /(?:^|[^\d])-\s*(\d{1,6})(?=$|[^\d])/g;
  while ((match = signedIntegerPattern.exec(text))) {
    if (match[1]) add(match[1], 35, '负号整数');
  }

  const ranked = [...candidates.values()].sort((a, b) => b.score - a.score || a.order - b.order);
  if (!ranked.length) return {};
  const best = ranked[0];
  if (!best) return {};
  // 没有货币符号、负号或金额标签的纯整数很可能是 OCR 误读（例如把“-4.97”读成“644”）。
  // 宁可让用户确认，也不要把明显不可靠的数字直接写入账单。
  if (best.source === '独占一行' && best.score < 100) {
    return { warning: '识别到数字但无法确认付款金额，请手动确认' };
  }
  const tied = ranked.filter((item) => item.value !== best.value && item.score >= best.score - 8);
  if (tied.length && best.score < 110) {
    return { warning: '检测到多个账单金额，请在弹窗中确认' };
  }
  return { value: best.value };
}

function parseNote(text: string) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const labels = ['收款方', '收款人', '收款商家', '商户全称', '商户名称', '商品说明', '商品名称', '商家', '交易对象', '交易对方', '付款给', '对方户名', '对方'];
  const billLabels = new Set([
    ...labels, '当前状态', '交易状态', '支付时间', '付款时间', '交易时间', '商品', '收单机构', '支付方式', '付款方式', '扣款方式',
    '交易单号', '商户单号', '订单号', '账单分类', '创建时间', '金额', '支付金额', '付款金额', '实付金额',
  ]);
  const normalizedLabel = (line: string) => line.replace(/[：:]$/, '').trim();
  const isLabel = (line: string) => billLabels.has(normalizedLabel(line));
  const looksLikeValue = (line: string) => {
    if (!line || isLabel(line)) return false;
    if (/^(?:支付成功|付款成功|交易成功|已支付|已完成|当前状态|详情|账单详情)$/.test(line)) return false;
    if (/^[¥￥]?\s*[-+]?\s*\d+(?:[.,]\d{1,2})?\s*元?$/.test(line)) return false;
    if (/^20\d{2}[年/.-]\d{1,2}[月/.-]\d{1,2}/.test(line)) return false;
    if (/^(?:\d[\s-]*){12,}$/.test(line)) return false;
    return /[\u4e00-\u9fffA-Za-z]/.test(line);
  };
  for (const label of labels) {
    const inline = lines.find((line) => line.startsWith(label) && line.length > label.length);
    if (inline) {
      const value = inline.slice(label.length).replace(/^\s*[:：]\s*/, '').trim();
      if (looksLikeValue(value)) return value.slice(0, 50);
    }
    const index = lines.findIndex((line) => line === label || line === `${label}：` || line === `${label}:`);
    const nextLine = index >= 0 ? lines[index + 1] : undefined;
    if (nextLine && looksLikeValue(nextLine)) return nextLine.slice(0, 50);

    // iOS Live Text 识别两栏页面时，常先输出左栏全部标签，再输出右栏全部值。
    // 找到该连续标签块后，用相同偏移量定位右栏值。
    if (index >= 0 && nextLine && isLabel(nextLine)) {
      let blockStart = index;
      let blockEnd = index;
      while (blockStart > 0 && isLabel(lines[blockStart - 1] ?? '')) blockStart -= 1;
      while (blockEnd + 1 < lines.length && isLabel(lines[blockEnd + 1] ?? '')) blockEnd += 1;
      const paired = lines[blockEnd + 1 + index - blockStart];
      if (paired && looksLikeValue(paired)) return paired.slice(0, 50);
    }
  }
  // 两栏账单经 Live Text 提取后，标签和值可能不在同一行；公司全称可独立兜底。
  const company = text.match(/[\u4e00-\u9fffA-Za-z0-9（）()]{2,}(?:有限责任公司|有限公司)/)?.[0];
  if (company) return company.slice(0, 50);

  // 付款成功页一般把商户放在状态或主金额附近。只在没有明确字段时做保守兜底。
  const noise = /^(?:微信支付|支付宝|零钱|零钱通|余额|余额宝|花呗|银行卡|储蓄卡|信用卡|支付成功|付款成功|交易成功|账单详情|详情|完成|返回|关闭|更多|推荐服务|对此订单有疑问|联系商家|查看账单)$/;
  const anchors = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /(?:支付成功|付款成功|交易成功)/.test(line) || /^[¥￥]?\s*[-+]\s*\d+(?:[.,]\d{1,2})?\s*元?$/.test(line));
  for (const anchor of anchors) {
    for (let distance = 1; distance <= 4; distance += 1) {
      for (const index of [anchor.index + distance, anchor.index - distance]) {
        const candidate = lines[index];
        if (candidate && looksLikeValue(candidate) && !noise.test(candidate) && candidate.length <= 50) return candidate;
      }
    }
  }
  return undefined;
}

function parseDate(text: string) {
  const timeLine = text.split('\n').find((line) => /(?:支付时间|付款时间|交易时间|创建时间)/.test(line));
  const source = timeLine ? `${timeLine}\n${text}` : text;
  const match = source.match(/(20\d{2})\s*[年/.\-]\s*(\d{1,2})\s*[月/.\-]\s*(\d{1,2})\s*日?/);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return undefined;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function matchAccount(text: string, accounts: Account[]) {
  const compact = text.replace(/\s/g, '').toLowerCase();
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const methodIndex = lines.findIndex((line) => /^(?:支付方式|付款方式|扣款方式)(?:\s*[:：]\s*|\s+|$)/.test(line));
  const methodLine = methodIndex >= 0 ? lines[methodIndex] ?? '' : '';
  const inlineMethod = methodLine.replace(/^(?:支付方式|付款方式|扣款方式)\s*[:：]?\s*/, '');
  const method = (methodIndex >= 0 ? inlineMethod || lines[methodIndex + 1] || '' : '').replace(/\s/g, '').toLowerCase();
  let best: { id: string; score: number } | undefined;
  for (const account of accounts) {
    const name = account.name.replace(/\s/g, '').toLowerCase();
    const hint = `${account.name}${account.note ?? ''}`.replace(/\s/g, '').toLowerCase();
    let score = name && compact.includes(name) ? 80 + name.length : 0;
    if (name && method.includes(name)) score = Math.max(score, 300 + name.length);
    for (const bank of BANK_NAMES) {
      const key = bank.toLowerCase();
      if (hint.includes(key) && compact.includes(key)) score = Math.max(score, 60 + key.length);
      if (hint.includes(key) && method.includes(key)) score = Math.max(score, 250 + key.length);
    }
    if (/微信/.test(hint) && /(?:零钱|零钱通|微信支付)/.test(method)) score = Math.max(score, 240);
    if (/支付宝/.test(hint) && /(?:支付宝|余额宝|花呗)/.test(method)) score = Math.max(score, 240);
    const accountDigits = hint.match(/\d{4}/g) ?? [];
    if (accountDigits.some((digits) => method.includes(digits))) score = Math.max(score, 400);
    if (score && (!best || score > best.score)) best = { id: account.id, score };
  }
  return best?.id;
}

function matchCategory(text: string, categories: Category[], type: 'expense' | 'income') {
  const available = categories.filter((category) => category.type === type && !category.hidden);
  const exact = available.find((category) => text.includes(category.name));
  if (exact) return exact.id;
  for (const hint of CATEGORY_HINTS) {
    if (!hint.words.some((word) => text.includes(word))) continue;
    const category = available.find((item) => hint.names.some((name) => item.name.includes(name) || name.includes(item.name)));
    if (category) return category.id;
  }
  return undefined;
}

/** 将 iOS「从图像提取文本」的结果转成待确认账单，不在这里自动入账。 */
export function parseQuickEntryText(rawText: string, categories: Category[], accounts: Account[]): EntryDraft {
  const text = cleanText(rawText).slice(0, 12000);
  const type = /(?:收款成功|收入金额|已收款|转入)/.test(text) && !/(?:付款成功|支付成功|支出)/.test(text)
    ? 'income'
    : 'expense';
  const note = parseNote(text);
  const amount = parseAmount(text);
  return {
    type,
    amount: amount.value,
    note,
    date: parseDate(text),
    accountId: matchAccount(text, accounts),
    categoryId: matchCategory(`${note ?? ''}\n${text}`, categories, type),
    source: 'shortcut',
    recognitionWarning: amount.warning,
  };
}
