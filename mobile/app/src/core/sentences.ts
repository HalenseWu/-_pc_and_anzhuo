/** 把段落切成句子（保留标点），供朗读队列使用 */
export function splitSentences(text: string, maxLen = 80): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  const parts = clean.match(/[^。！？；…!?;]+[。！？；…!?;]*/g) ?? [clean]
  const out: string[] = []
  for (const part of parts) {
    let rest = part.trim()
    while (rest.length > maxLen) {
      /* 超长句在逗号处再断一次 */
      const cut = rest.lastIndexOf('，', maxLen)
      const index = cut > 10 ? cut + 1 : maxLen
      out.push(rest.slice(0, index))
      rest = rest.slice(index)
    }
    if (rest) out.push(rest)
  }
  return out.filter(Boolean)
}

export interface Segment {
  text: string
  /** 该段包含的句子在本段内的序号 */
  sentences: number[]
}

/**
 * 把段落切成「最多约 5 行」的显示片段（用于高亮），并记录每句落在哪一片段。
 * 5 行约为 maxChars 个汉字，按句边界合并，单句超长时硬切。
 */
export function segmentParagraph(paragraph: string, maxChars = 88): Segment[] {
  const sentences = splitSentences(paragraph)
  const segments: Segment[] = []
  let text = ''
  let sentenceIds: number[] = []

  const flush = (): void => {
    if (text) {
      segments.push({ text, sentences: sentenceIds })
      text = ''
      sentenceIds = []
    }
  }

  sentences.forEach((sentence, sentenceIndex) => {
    if (text && text.length + sentence.length > maxChars) flush()
    text += sentence
    sentenceIds.push(sentenceIndex)
  })
  flush()

  if (segments.length === 0) segments.push({ text: paragraph, sentences: [0] })
  return segments
}
