export function writeJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data, null, 2));
}

export function writeText(res, statusCode, contentType, body) {
  res.statusCode = statusCode;
  res.setHeader('content-type', contentType);
  res.end(body);
}

export function safeJsonParse(text) {
  try {
    return { value: JSON.parse(text), error: null };
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function readBodyBuffer(req, options = {}) {
  const maxBytes = Number.isFinite(options.maxBytes) ? options.maxBytes : 1024 * 1024;
  if (req.method === 'GET' || req.method === 'HEAD') {
    return Buffer.alloc(0);
  }
  return await new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error(`request body exceeded ${maxBytes} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
