import { sha256Hex } from '../utils/hash.js';
import { safeJsonParse } from '../utils/json.js';
import { parseContentType, truncateText } from '../utils/text.js';

export function parseBodyData(bodyBuffer, contentTypeHeader) {
  const bodyPresent = Buffer.isBuffer(bodyBuffer) ? bodyBuffer.length > 0 : false;
  const text = bodyPresent ? bodyBuffer.toString('utf8') : '';
  const contentTypeParsed = parseContentType(contentTypeHeader);
  let jsonParsed = null;
  let jsonParseError = null;
  const shouldTryJson = Boolean(contentTypeParsed?.mimeType?.includes('json')) || /^[\[{]/.test(text.trim());
  if (bodyPresent && shouldTryJson) {
    const parsed = safeJsonParse(text);
    jsonParsed = parsed.value;
    jsonParseError = parsed.error;
  }
  return {
    bodyPresent,
    bodyByteLength: bodyPresent ? bodyBuffer.length : 0,
    bodySha256: bodyPresent ? sha256Hex(bodyBuffer) : null,
    bodyPreview: bodyPresent ? truncateText(text, 512) : null,
    jsonParsed,
    jsonParseError,
    contentTypeParsed
  };
}
