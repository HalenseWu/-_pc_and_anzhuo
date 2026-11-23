export interface DecodeResult {
  text: string
  encoding: string
  confidence: number
}

/** 浏览器/WebView 内置解码器：先试 UTF-8，不合法再按 GB18030 */
export function decodeBuffer(buffer: ArrayBuffer): DecodeResult {
  const bytes = new Uint8Array(buffer)

  if (bytes.length > 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'UTF-8 BOM', confidence: 1 }
  }
  if (bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'UTF-16 LE', confidence: 1 }
  }
  if (bytes.length > 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'UTF-16 BE', confidence: 1 }
  }

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return { text, encoding: 'UTF-8', confidence: 1 }
  } catch {
    /* 不是合法 UTF-8，继续 */
  }

  try {
    const text = new TextDecoder('gb18030').decode(bytes)
    return { text, encoding: 'GB18030', confidence: 0.9 }
  } catch {
    return { text: new TextDecoder('utf-8').decode(bytes), encoding: 'UTF-8(容错)', confidence: 0.5 }
  }
}
