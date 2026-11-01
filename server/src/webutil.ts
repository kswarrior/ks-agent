const PRIVATE_HOST_RE =
  /^(?:localhost$|127\.|0\.0\.0\.0$|\[?::1\]?$|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|169\.254\.|metadata\.google\.internal$)/i

export function isPrivateHost(hostname: string): boolean {
  let host = hostname.toLowerCase()
  try {
    host = decodeURIComponent(host).toLowerCase()
  } catch {
    // keep raw hostname
  }
  return PRIVATE_HOST_RE.test(host)
}

export function parsePublicHttpUrl(rawUrl: string): URL {
  let parsed: URL
  try {
    parsed = new URL(rawUrl.trim())
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http/https URLs are allowed')
  }
  if (isPrivateHost(parsed.hostname)) {
    throw new Error(`Refusing to fetch local/private host: ${parsed.hostname}`)
  }
  return parsed
}

export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
}

export function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
}

export function htmlToText(html: string): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<h([1-6])[^>]*>/gi, (_m, level) => `\n\n${'#'.repeat(Number(level))} `)
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|section|article|header|footer|tr|ul|ol|blockquote|pre|table)>/gi, '\n\n')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => {
      const cleanHref = String(href).trim()
      const cleanLabel = stripTags(String(label))
      return cleanHref && cleanLabel && cleanHref !== cleanLabel
        ? `${cleanLabel} (${cleanHref})`
        : cleanLabel || cleanHref
    })
    .replace(/<[^>]+>/g, '')
  return decodeEntities(text)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
