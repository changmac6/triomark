export function getHeader(req, name) {
  const value = req.headers[name];
  if (Array.isArray(value)) return value.join(', ');
  return value ?? null;
}

export function getStringLength(value) {
  return typeof value === 'string' ? value.length : 0;
}

export function parseCsvHeader(header) {
  if (!header) return [];
  return header.split(',').map((value) => value.trim()).filter(Boolean);
}

export function parseWeightedHeader(header) {
  const items = parseCsvHeader(header);
  return items.map((item) => {
    const [valuePart, ...paramParts] = item.split(';').map((part) => part.trim());
    let q = 1;
    const params = {};
    for (const part of paramParts) {
      const [key, rawValue = ''] = part.split('=');
      if (!key) continue;
      const normalizedKey = key.trim().toLowerCase();
      const normalizedValue = rawValue.trim();
      params[normalizedKey] = normalizedValue;
      if (normalizedKey === 'q') {
        const numberValue = Number(normalizedValue);
        if (!Number.isNaN(numberValue)) q = numberValue;
      }
    }
    return { value: valuePart, q, params };
  });
}

export function parseAcceptLanguage(header) {
  const parsed = parseWeightedHeader(header).map((entry) => ({ tag: entry.value, q: entry.q }));
  return {
    primaryLanguage: parsed[0]?.tag || null,
    languageTags: parsed.map((entry) => entry.tag),
    languageTagCount: parsed.length,
    languageWeights: parsed
  };
}

export function parseCookieNames(cookieRaw) {
  if (!cookieRaw) return [];
  return cookieRaw.split(';').map((entry) => entry.split('=')[0]?.trim()).filter(Boolean);
}

export function parseContentType(header) {
  if (!header) return null;
  const [mimeTypeRaw, ...paramParts] = header.split(';').map((part) => part.trim());
  const [type = null, subtype = null] = (mimeTypeRaw || '').split('/');
  const params = {};
  for (const part of paramParts) {
    const [key, rawValue = ''] = part.split('=');
    if (!key) continue;
    params[key.trim().toLowerCase()] = rawValue.trim().replace(/^"|"$/g, '');
  }
  return {
    mimeType: mimeTypeRaw || null,
    type,
    subtype,
    params,
    charset: params.charset ?? null,
    boundary: params.boundary ?? null
  };
}

export function truncateText(value, maxLength = 512) {
  if (typeof value !== 'string') return null;
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}…`;
}
