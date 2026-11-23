export interface DecodeResult {
  text: string
  encoding: string
  confidence: number
}

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff]/
const CN_PUNCT_RE = /[，。！？：；、（）「」『』《》“”‘’…—]/
const ASCII_RE = /[A-Za-z0-9]/
const BAD_RE = /[\ufffd\u0000-\u0008\u000b\u000c\u000e-\u001f]/

/** 采样打分：汉字权重最高，替换符重罚 */
function scoreText(text: string): number {
  if (!text) return 0
  let cjk = 0
  let punct = 0
  let ascii = 0
  let bad = 0
  const len = Math.min(text.length, 40000)
  for (let i = 0; i < len; i += 1) {
    const ch = text[i]
    if (CJK_RE.test(ch)) cjk += 1
    else if (CN_PUNCT_RE.test(ch)) punct += 1
    else if (ASCII_RE.test(ch)) ascii += 1
    else if (BAD_RE.test(ch)) bad += 1
  }
  return (cjk * 3 + punct * 2 + ascii * 0.2 - bad * 25) / Math.max(1, len)
}

function decodeWith(name: string, buf: Buffer): string {
  try {
    return new TextDecoder(name, { fatal: false }).decode(buf)
  } catch {
    return ''
  }
}

export function decodeBuffer(buf: Buffer): DecodeResult {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return {
      text: new TextDecoder('utf-8').decode(buf.subarray(3)),
      encoding: 'UTF-8',
      confidence: 1
    }
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return {
      text: new TextDecoder('utf-16le').decode(buf.subarray(2)),
      encoding: 'UTF-16LE',
      confidence: 1
    }
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const body = Buffer.from(buf.subarray(2))
    body.swap16()
    return {
      text: new TextDecoder('utf-16le').decode(body),
      encoding: 'UTF-16BE',
      confidence: 1
    }
  }

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buf)
    return { text, encoding: 'UTF-8', confidence: 0.99 }
  } catch {
    // 落到多候选打分
  }

  const sample = buf.subarray(0, 65536)
  const candidates = ['gb18030', 'big5'].map((name) => ({
    name,
    score: scoreText(decodeWith(name, sample))
  }))
  candidates.sort((a, b) => b.score - a.score)

  const best = candidates[0]
  const second = candidates[1]
  const gap = best.score > 0 ? Math.max(0, best.score - second.score) / best.score : 0
  const confidence = Math.min(0.95, 0.5 + gap * 1.2)
  const text = decodeWith(best.name, buf)

  return {
    text,
    encoding: best.name.toUpperCase() === 'GB18030' ? 'GB18030' : 'Big5',
    confidence
  }
}
