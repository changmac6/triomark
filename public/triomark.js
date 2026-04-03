// src/utils/hash.ts
var SHORT_HASH_LENGTH = 8;
var BASE62_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
var SHA256_BASE62_LENGTH = 43;
function toHex(buffer) {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}
function toBase62(value, minLength) {
  if (value === 0n) {
    const zero = "0";
    return minLength ? zero.padStart(minLength, "0") : zero;
  }
  let result = "";
  let remainder = value;
  while (remainder > 0n) {
    const digit = Number(remainder % 62n);
    result = BASE62_ALPHABET[digit] + result;
    remainder /= 62n;
  }
  return minLength ? result.padStart(minLength, "0") : result;
}
function bufferToBase62(buffer, minLength) {
  const bytes = new Uint8Array(buffer);
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) + BigInt(byte);
  }
  return toBase62(value, minLength);
}
function fnv1a(input) {
  let hash = 2166136261;
  for (let i = 0;i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
async function hashSha256(input) {
  if (globalThis.crypto?.subtle?.digest) {
    const data = new TextEncoder().encode(input);
    const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
    return toHex(hashBuffer);
  }
  return fnv1a(input);
}
async function hashSha256Base62(input) {
  if (globalThis.crypto?.subtle?.digest) {
    const data = new TextEncoder().encode(input);
    const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
    return bufferToBase62(hashBuffer, SHA256_BASE62_LENGTH);
  }
  const fallbackHex = fnv1a(input);
  return toBase62(BigInt(`0x${fallbackHex}`));
}
async function hashShort(input, length = SHORT_HASH_LENGTH) {
  const fullHash = await hashSha256Base62(input);
  return fullHash.padStart(length, "0").slice(0, length);
}

// src/utils/stableStringify.ts
function normalize(value) {
  if (value === undefined) {
    return null;
  }
  if (value === null) {
    return null;
  }
  if (typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalize(item));
  }
  if (value instanceof Set) {
    return Array.from(value).map((item) => normalize(item));
  }
  if (value instanceof Map) {
    const entries = Array.from(value.entries()).map(([key, val]) => [String(key), normalize(val)]);
    entries.sort(([a], [b]) => a > b ? 1 : a < b ? -1 : 0);
    const result = {};
    for (const [key, val] of entries) {
      result[key] = val;
    }
    return result;
  }
  if (typeof value === "object") {
    const record = value;
    const keys = Object.keys(record).sort();
    const result = {};
    for (const key of keys) {
      result[key] = normalize(record[key]);
    }
    return result;
  }
  return String(value);
}
function stableStringify(value) {
  return JSON.stringify(normalize(value));
}

// src/utils/component.ts
async function buildComponentResult(id, data, options = {}) {
  const value = stableStringify(data);
  const hash = await hashShort(value);
  return {
    id,
    value,
    hash,
    unstable: options.unstable ?? false
  };
}

// src/components/applePay.ts
async function getApplePayFingerprint() {
  const data = collectApplePay();
  return buildComponentResult("applePay", data);
}
function collectApplePay() {
  if (typeof window === "undefined") {
    return { supported: false, reason: "window-unavailable" };
  }
  const applePaySession = window.ApplePaySession;
  if (!applePaySession?.canMakePayments) {
    return { supported: false, reason: "apple-pay-api-unavailable" };
  }
  if (window.location.protocol !== "https:") {
    return { supported: true, available: false, reason: "insecure-context" };
  }
  try {
    return {
      supported: true,
      available: applePaySession.canMakePayments()
    };
  } catch (error) {
    return {
      supported: true,
      available: false,
      reason: error instanceof Error ? error.message : "apple-pay-error"
    };
  }
}

// src/components/architecture.ts
async function getArchitectureFingerprint() {
  const data = collectArchitecture();
  return buildComponentResult("architecture", data);
}
function collectArchitecture() {
  const f32 = new Float32Array(1);
  const u8 = new Uint8Array(f32.buffer);
  f32[0] = Number.POSITIVE_INFINITY;
  f32[0] = f32[0] - f32[0];
  return {
    supported: true,
    architecture: u8[3]
  };
}

// src/components/audio.ts
async function getAudioFingerprint() {
  const data = await collectAudioFingerprint();
  return buildComponentResult("audio", data);
}
async function collectAudioFingerprint() {
  if (typeof window === "undefined") {
    return { supported: false, reason: "window-unavailable" };
  }
  const OfflineAudioContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineAudioContext) {
    return { supported: false, reason: "offline-audio-unavailable" };
  }
  try {
    const sampleRate = 44100;
    const length = 5000;
    const context = new OfflineAudioContext(1, length, sampleRate);
    const bufferSource = context.createBufferSource();
    const oscillator = context.createOscillator();
    oscillator.type = "triangle";
    oscillator.frequency.value = 1000;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -50;
    compressor.knee.value = 40;
    compressor.ratio.value = 12;
    compressor.attack.value = 0;
    compressor.release.value = 0.2;
    oscillator.connect(compressor);
    compressor.connect(context.destination);
    oscillator.start(0);
    const samples = await renderAudio(context, 2000);
    const sampleHash = sumAbs(samples);
    return {
      supported: true,
      sampleHash,
      sampleRate,
      length,
      maxChannelCount: context.destination?.maxChannelCount ?? null,
      channelCountMode: bufferSource.channelCountMode ?? null
    };
  } catch (error) {
    return {
      supported: false,
      reason: error instanceof Error ? error.message : "audio-error"
    };
  }
}
function renderAudio(context, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("audio-timeout"));
      }
    }, timeoutMs);
    context.oncomplete = (event) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve(event.renderedBuffer.getChannelData(0));
    };
    context.startRendering().catch((error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
  });
}
function sumAbs(samples) {
  let hash = 0;
  for (let i = 0;i < samples.length; i += 1) {
    hash += Math.abs(samples[i] ?? 0);
  }
  return hash;
}

// src/components/audioBaseLatency.ts
async function getAudioBaseLatencyFingerprint() {
  const data = await collectAudioBaseLatency();
  return buildComponentResult("audioBaseLatency", data);
}
async function collectAudioBaseLatency() {
  if (typeof window === "undefined") {
    return { supported: false, reason: "window-unavailable" };
  }
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    return { supported: false, reason: "audio-context-unavailable" };
  }
  let context = null;
  try {
    context = new AudioContextCtor;
    return {
      supported: true,
      baseLatency: context.baseLatency ?? null,
      outputLatency: context.outputLatency ?? null,
      sampleRate: context.sampleRate
    };
  } catch (error) {
    return {
      supported: false,
      reason: error instanceof Error ? error.message : "audio-latency-error"
    };
  } finally {
    if (context?.close) {
      try {
        await context.close();
      } catch {}
    }
  }
}

// src/utils/commonPixels.ts
function getCommonPixels(imageDatas, width, height) {
  const channels = width * height * 4;
  const result = new Uint8ClampedArray(channels);
  for (let i = 0;i < channels; i += 1) {
    const counts = new Uint16Array(256);
    for (const data of imageDatas) {
      const value = data.data[i] ?? 0;
      counts[value] = (counts[value] ?? 0) + 1;
    }
    let bestValue = 0;
    let bestCount = -1;
    for (let value = 0;value < counts.length; value += 1) {
      const count = counts[value] ?? 0;
      if (count > bestCount) {
        bestCount = count;
        bestValue = value;
      }
    }
    result[i] = bestValue;
  }
  return result;
}

// src/components/canvas.ts
var COMMON_PIXEL_RUNS = 3;
var COMMON_PIXEL_WIDTH = 280;
var COMMON_PIXEL_HEIGHT = 20;
async function getCanvasFingerprint() {
  const data = collectCanvasFingerprint();
  return buildComponentResult("canvas", data);
}
function collectCanvasFingerprint() {
  if (typeof document === "undefined") {
    return { supported: false, reason: "document-unavailable" };
  }
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    return { supported: false, reason: "canvas-unavailable" };
  }
  const winding = doesSupportWinding(context);
  const textImage = renderTextImage(canvas, context);
  const textImageAgain = renderTextImage(canvas, context);
  const textStable = textImage === textImageAgain;
  const geometryImage = renderGeometryImage(canvas, context);
  const commonPixelsHash = hashCommonPixels(context);
  return {
    supported: true,
    winding,
    text: textStable ? textImage : "unstable",
    geometry: textStable ? geometryImage : "unstable",
    commonPixelsHash
  };
}
function doesSupportWinding(context) {
  context.rect(0, 0, 10, 10);
  context.rect(2, 2, 6, 6);
  return !context.isPointInPath(5, 5, "evenodd");
}
function renderTextImage(canvas, context) {
  canvas.width = 240;
  canvas.height = 60;
  context.textBaseline = "alphabetic";
  context.fillStyle = "#f60";
  context.fillRect(100, 1, 62, 20);
  context.fillStyle = "#069";
  context.font = '11pt "Times New Roman"';
  const printedText = `Cwm fjordbank gly ${String.fromCharCode(55357, 56835)}`;
  context.fillText(printedText, 2, 15);
  context.fillStyle = "rgba(102, 204, 0, 0.2)";
  context.font = "18pt Arial";
  context.fillText(printedText, 4, 45);
  return canvas.toDataURL();
}
function renderGeometryImage(canvas, context) {
  canvas.width = 122;
  canvas.height = 110;
  context.globalCompositeOperation = "multiply";
  for (const [color, x, y] of [
    ["#f2f", 40, 40],
    ["#2ff", 80, 40],
    ["#ff2", 60, 80]
  ]) {
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, 40, 0, Math.PI * 2, true);
    context.closePath();
    context.fill();
  }
  context.fillStyle = "#f9c";
  context.arc(60, 60, 60, 0, Math.PI * 2, true);
  context.arc(60, 60, 20, 0, Math.PI * 2, true);
  context.fill("evenodd");
  return canvas.toDataURL();
}
function hashCommonPixels(context) {
  const imageDatas = [];
  for (let i = 0;i < COMMON_PIXEL_RUNS; i += 1) {
    imageDatas.push(renderCommonPixelImage(context));
  }
  const commonPixels = getCommonPixels(imageDatas, COMMON_PIXEL_WIDTH, COMMON_PIXEL_HEIGHT);
  return Array.from(commonPixels).join(",");
}
function renderCommonPixelImage(context) {
  const canvas = context.canvas;
  canvas.width = COMMON_PIXEL_WIDTH;
  canvas.height = COMMON_PIXEL_HEIGHT;
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "red");
  gradient.addColorStop(1 / 6, "orange");
  gradient.addColorStop(2 / 6, "yellow");
  gradient.addColorStop(3 / 6, "green");
  gradient.addColorStop(4 / 6, "blue");
  gradient.addColorStop(5 / 6, "indigo");
  gradient.addColorStop(1, "violet");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const text = "Random Text WMwmil10Oo";
  context.font = "23.123px Arial";
  context.fillStyle = "black";
  context.fillText(text, -5, 15);
  context.fillStyle = "rgba(0, 0, 255, 0.5)";
  context.fillText(text, -3.3, 17.7);
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(canvas.width * 2 / 7, canvas.height);
  context.strokeStyle = "white";
  context.lineWidth = 2;
  context.stroke();
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

// src/components/clipboard.ts
var clipboardMimeTypes = [
  "text/plain",
  "text/html",
  "text/uri-list",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/json"
].sort();
async function getClipboardFingerprint() {
  const data = await collectClipboard();
  return buildComponentResult("clipboard", data);
}
async function collectClipboard() {
  if (typeof navigator === "undefined") {
    return { supported: false, reason: "navigator-unavailable" };
  }
  const hasClipboard = typeof navigator.clipboard !== "undefined";
  const api = {
    clipboard: hasClipboard,
    read: typeof navigator.clipboard?.read === "function",
    write: typeof navigator.clipboard?.write === "function",
    readText: typeof navigator.clipboard?.readText === "function",
    writeText: typeof navigator.clipboard?.writeText === "function"
  };
  const clipboardItemAvailable = typeof ClipboardItem !== "undefined";
  const supportsMethodAvailable = clipboardItemAvailable && typeof ClipboardItem.supports === "function";
  const supportedTypes = supportsMethodAvailable ? clipboardMimeTypes.filter((type) => {
    try {
      return ClipboardItem.supports(type);
    } catch {
      return false;
    }
  }) : null;
  const permissions = {};
  if (navigator.permissions?.query) {
    try {
      const status = await navigator.permissions.query({
        name: "clipboard-read"
      });
      permissions.clipboardRead = status.state;
    } catch {
      permissions.clipboardRead = "unsupported";
    }
    try {
      const status = await navigator.permissions.query({
        name: "clipboard-write"
      });
      permissions.clipboardWrite = status.state;
    } catch {
      permissions.clipboardWrite = "unsupported";
    }
  }
  const execCommandSupported = typeof document !== "undefined" && typeof document.queryCommandSupported === "function";
  const execCommand = execCommandSupported ? {
    copy: document.queryCommandSupported("copy"),
    cut: document.queryCommandSupported("cut"),
    paste: document.queryCommandSupported("paste")
  } : null;
  const events = typeof document !== "undefined" ? {
    copy: "oncopy" in document,
    cut: "oncut" in document,
    paste: "onpaste" in document
  } : null;
  return {
    supported: true,
    api,
    permissions,
    capabilities: {
      clipboardItemAvailable,
      supportsMethodAvailable,
      supportedTypes,
      execCommand,
      events
    }
  };
}

// src/components/colorDepth.ts
async function getColorDepthFingerprint() {
  const data = collectColorDepth();
  return buildComponentResult("colorDepth", data);
}
function collectColorDepth() {
  if (typeof screen === "undefined") {
    return { supported: false, reason: "screen-unavailable" };
  }
  return {
    supported: true,
    colorDepth: screen.colorDepth,
    pixelDepth: screen.pixelDepth ?? null
  };
}

// src/components/colorGamut.ts
async function getColorGamutFingerprint() {
  const data = collectColorGamut();
  return buildComponentResult("colorGamut", data);
}
function collectColorGamut() {
  if (typeof matchMedia === "undefined") {
    return { supported: false, reason: "matchmedia-unavailable" };
  }
  const gamuts = ["rec2020", "p3", "srgb"];
  for (const gamut of gamuts) {
    if (matchMedia(`(color-gamut: ${gamut})`).matches) {
      return { supported: true, gamut };
    }
  }
  return { supported: true, gamut: null };
}

// src/components/contrast.ts
async function getContrastFingerprint() {
  const data = collectContrast();
  return buildComponentResult("contrast", data);
}
function collectContrast() {
  if (typeof matchMedia === "undefined") {
    return { supported: false, reason: "matchmedia-unavailable" };
  }
  const preferences = ["high", "more", "low", "less", "no-preference"];
  for (const preference of preferences) {
    if (matchMedia(`(prefers-contrast: ${preference})`).matches) {
      return { supported: true, preference };
    }
  }
  return { supported: true, preference: null };
}

// src/components/cookiesEnabled.ts
async function getCookiesEnabledFingerprint() {
  const data = collectCookiesEnabled();
  return buildComponentResult("cookiesEnabled", data);
}
function collectCookiesEnabled() {
  if (typeof navigator === "undefined") {
    return { supported: false, reason: "navigator-unavailable" };
  }
  if (navigator.cookieEnabled) {
    return { supported: true, enabled: true };
  }
  if (typeof document === "undefined") {
    return { supported: true, enabled: false };
  }
  try {
    document.cookie = "fp_cookie_test=1;SameSite=Strict";
    const enabled = document.cookie.indexOf("fp_cookie_test=1") !== -1;
    document.cookie = "fp_cookie_test=; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict";
    return { supported: true, enabled };
  } catch (error) {
    return {
      supported: true,
      enabled: false,
      reason: error instanceof Error ? error.message : "cookie-error"
    };
  }
}

// src/components/cpuClass.ts
async function getCpuClassFingerprint() {
  const data = collectCpuClass();
  return buildComponentResult("cpuClass", data);
}
function collectCpuClass() {
  if (typeof navigator === "undefined") {
    return { supported: false, reason: "navigator-unavailable" };
  }
  const cpuClass = navigator.cpuClass;
  return {
    supported: true,
    cpuClass: cpuClass ?? null
  };
}

// src/components/dateTimeLocale.ts
async function getDateTimeLocaleFingerprint() {
  const data = collectDateTimeLocale();
  return buildComponentResult("dateTimeLocale", data);
}
function collectDateTimeLocale() {
  const options = Intl.DateTimeFormat().resolvedOptions();
  return {
    supported: true,
    locale: options.locale ?? null,
    calendar: options.calendar ?? null,
    numberingSystem: options.numberingSystem ?? null,
    timeZone: options.timeZone ?? null
  };
}

// src/components/deviceMemory.ts
async function getDeviceMemoryFingerprint() {
  const data = collectDeviceMemory();
  return buildComponentResult("deviceMemory", data);
}
function collectDeviceMemory() {
  if (typeof navigator === "undefined") {
    return { supported: false, reason: "navigator-unavailable" };
  }
  const deviceMemory = navigator.deviceMemory;
  return {
    supported: true,
    deviceMemory: deviceMemory ?? null
  };
}

// src/components/domBlockers.ts
var blockerSelectors = [
  "ad",
  "ads",
  "adsbox",
  "ad-banner",
  "ad-container",
  "ad-slot",
  "ad-unit",
  "banner-ad",
  "doubleclick",
  "ad-placement",
  "sponsored",
  "promoted"
];
async function getDomBlockersFingerprint() {
  const data = collectDomBlockers();
  return buildComponentResult("domBlockers", data);
}
function collectDomBlockers() {
  if (typeof document === "undefined") {
    return { supported: false, reason: "document-unavailable" };
  }
  const root = document.body ?? document.documentElement;
  if (!root) {
    return { supported: false, reason: "dom-unavailable" };
  }
  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "1px";
  container.style.height = "1px";
  container.style.pointerEvents = "none";
  root.appendChild(container);
  const blocked = {};
  for (const selector of blockerSelectors) {
    const element = document.createElement("div");
    element.className = selector;
    element.style.width = "10px";
    element.style.height = "10px";
    element.textContent = "ads";
    container.appendChild(element);
    const style = window.getComputedStyle(element);
    const isBlocked = style.display === "none" || style.visibility === "hidden" || element.offsetParent === null || element.offsetHeight === 0 || element.offsetWidth === 0;
    blocked[selector] = isBlocked;
  }
  container.remove();
  return {
    supported: true,
    blocked,
    blockedCount: Object.values(blocked).filter(Boolean).length
  };
}

// src/components/domRect.ts
var EMOJI_SET = [
  "\uD83D\uDE00",
  "\uD83D\uDE03",
  "\uD83D\uDE04",
  "\uD83D\uDE01",
  "\uD83D\uDE06",
  "\uD83D\uDE05",
  "\uD83D\uDE02",
  "\uD83E\uDD23",
  "\uD83D\uDE42",
  "\uD83D\uDE43",
  "\uD83D\uDE09",
  "\uD83D\uDE0A"
];
async function getDomRectFingerprint() {
  const data = collectDomRect();
  return buildComponentResult("domRect", data, { unstable: true });
}
function collectDomRect() {
  if (typeof document === "undefined") {
    return { supported: false, reason: "document-unavailable" };
  }
  if (!document.body) {
    return { supported: false, reason: "document-body-unavailable" };
  }
  const container = document.createElement("div");
  container.style.cssText = "position:absolute;left:-9999px;top:-9999px;visibility:hidden;";
  const root = document.createElement("div");
  root.style.cssText = "position:relative;width:320px;height:240px;";
  container.appendChild(root);
  const boxes = [];
  for (const [left, top, width, height, transform] of [
    ["8px", "12px", "120.5px", "60.25px", "rotate(12.5deg)"],
    ["42px", "96px", "132.25px", "48.5px", "skewY(11deg)"],
    ["160px", "18px", "98.75px", "88.1px", "scale(1.02, 0.97)"],
    ["190px", "120px", "72.4px", "92.6px", "rotate(35deg) skewX(7deg)"]
  ]) {
    const box = document.createElement("div");
    box.style.cssText = [
      "position:absolute",
      `left:${left}`,
      `top:${top}`,
      `width:${width}`,
      `height:${height}`,
      "border:2px solid #000",
      `transform:${transform}`
    ].join(";");
    root.appendChild(box);
    boxes.push(box);
  }
  const emojiRow = document.createElement("div");
  emojiRow.style.cssText = "position:absolute;left:0;top:0;font-size:32px;font-family:'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif;";
  const emojiSpans = EMOJI_SET.map((emoji) => {
    const span = document.createElement("span");
    span.textContent = emoji;
    emojiRow.appendChild(span);
    return span;
  });
  root.appendChild(emojiRow);
  document.body.appendChild(container);
  try {
    const elementClientRects = boxes.map((box) => reduceRect(box.getClientRects()[0] ?? box.getBoundingClientRect()));
    const elementBoundingClientRects = boxes.map((box) => reduceRect(box.getBoundingClientRect()));
    const range = document.createRange();
    const rangeClientRects = boxes.map((box) => {
      range.selectNode(box);
      const rects = range.getClientRects();
      return reduceRect(rects[0] ?? range.getBoundingClientRect());
    });
    const rangeBoundingClientRects = boxes.map((box) => {
      range.selectNode(box);
      return reduceRect(range.getBoundingClientRect());
    });
    const emojiSet = new Map;
    for (const span of emojiSpans) {
      const rect = span.getBoundingClientRect();
      const key = `${round(rect.width)}x${round(rect.height)}`;
      if (!emojiSet.has(key)) {
        emojiSet.set(key, span.textContent ?? "");
      }
    }

    return {
      supported: true,
      elementClientRects,
      elementBoundingClientRects,
      rangeClientRects,
      rangeBoundingClientRects,
      emojiSet: Array.from(emojiSet.values())
    };
  } finally {
    document.body.removeChild(container);
  }
}
function reduceRect(rect) {
  if (!rect) {
    return null;
  }
  return {
    x: round(rect.x ?? rect.left),
    y: round(rect.y ?? rect.top),
    width: round(rect.width),
    height: round(rect.height),
    top: round(rect.top),
    right: round(rect.right),
    bottom: round(rect.bottom),
    left: round(rect.left)
  };
}
function round(value) {
  return Math.round(value * 1000) / 1000;
}

// src/utils/iframe.ts
async function withIframe(action, srcdoc) {
  if (typeof document === "undefined") {
    throw new Error("iframe-unavailable");
  }
  const iframe = document.createElement("iframe");
  iframe.style.position = "absolute";
  iframe.style.left = "-9999px";
  iframe.style.top = "0";
  iframe.style.width = "1px";
  iframe.style.height = "1px";
  iframe.style.border = "0";
  iframe.style.visibility = "hidden";
  iframe.setAttribute("aria-hidden", "true");
  if (srcdoc) {
    iframe.srcdoc = srcdoc;
  }
  const root = document.body ?? document.documentElement;
  if (!root) {
    throw new Error("iframe-root-unavailable");
  }
  root.appendChild(iframe);
  const iframeWindow = iframe.contentWindow;
  if (!iframeWindow) {
    iframe.remove();
    throw new Error("iframe-window-unavailable");
  }
  await new Promise((resolve) => {
    if (iframeWindow.document.readyState === "complete") {
      resolve();
      return;
    }
    iframe.addEventListener("load", () => resolve(), { once: true });
  });
  try {
    return await action(iframeWindow.document, iframeWindow);
  } finally {
    iframe.remove();
  }
}

// src/components/fontPreferences.ts
var defaultText = "mmMwWLliI0fiflO&1";
var presets = {
  default: [],
  apple: [{ font: "-apple-system-body" }],
  serif: [{ fontFamily: "serif" }],
  sans: [{ fontFamily: "sans-serif" }],
  mono: [{ fontFamily: "monospace" }],
  min: [{ fontSize: "1px" }],
  system: [{ fontFamily: "system-ui" }]
};
async function getFontPreferencesFingerprint() {
  const data = await collectFontPreferences();
  return buildComponentResult("fontPreferences", data);
}
async function collectFontPreferences() {
  if (typeof document === "undefined") {
    return { supported: false, reason: "document-unavailable" };
  }
  return withIframe((iframeDocument, iframeWindow) => {
    const iframeBody = iframeDocument.body;
    iframeBody.style.width = "4000px";
    iframeBody.style.textSizeAdjust = "none";
    iframeBody.style.webkitTextSizeAdjust = "none";
    const presetKeys = Object.keys(presets);
    const sizes = {};
    const elements = {};
    for (const key of presetKeys) {
      const preset = presets[key];
      if (!preset) {
        continue;
      }
      const [style = {}, text = defaultText] = preset;
      const element = iframeDocument.createElement("span");
      element.textContent = text;
      element.style.whiteSpace = "nowrap";
      for (const styleName of Object.keys(style)) {
        const value = style[styleName];
        if (value !== undefined) {
          element.style[styleName] = value;
        }
      }
      elements[key] = element;
      iframeBody.appendChild(iframeDocument.createElement("br"));
      iframeBody.appendChild(element);
    }
    for (const key of presetKeys) {
      const element = elements[key];
      if (!element) {
        continue;
      }
      sizes[key] = element.getBoundingClientRect().width;
    }
    return {
      supported: true,
      pixelRatio: iframeWindow.devicePixelRatio,
      sizes
    };
  });
}

// src/components/fonts.ts
var testString = "mmMwWLliI0O&1";
var textSize = "48px";
var baseFonts = ["monospace", "sans-serif", "serif"];
var fontCandidates = [
  "sans-serif-thin",
  "ARNO PRO",
  "Agency FB",
  "Arabic Typesetting",
  "Arial",
  "Arial Black",
  "Arial Narrow",
  "Arial Rounded MT",
  "Arial Unicode MS",
  "Arimo",
  "Archivo",
  "AvantGarde Bk BT",
  "BankGothic Md BT",
  "Barlow",
  "Batang",
  "Bebas Neue",
  "Bitstream Vera Sans Mono",
  "Bitter",
  "Bookman",
  "Calibri",
  "Cabin",
  "Candara",
  "Century",
  "Century Gothic",
  "Clarendon",
  "Comic Sans MS",
  "Constantia",
  "Courier",
  "Courier New",
  "Crimson Text",
  "DM Mono",
  "DM Sans",
  "DM Serif Display",
  "DM Serif Text",
  "Dosis",
  "Droid Sans",
  "EUROSTILE",
  "Exo",
  "Fira Code",
  "Fira Sans",
  "Franklin Gothic",
  "Franklin Gothic Medium",
  "Futura Bk BT",
  "Futura Md BT",
  "GOTHAM",
  "Garamond",
  "Geneva",
  "Georgia",
  "Gill Sans",
  "HELV",
  "Haettenschweiler",
  "Helvetica",
  "Helvetica Neue",
  "Humanst521 BT",
  "Impact",
  "Inconsolata",
  "Indie Flower",
  "Inter",
  "Josefin Sans",
  "Karla",
  "Lato",
  "Leelawadee",
  "Letter Gothic",
  "Levenim MT",
  "Lexend",
  "Lucida Bright",
  "Lucida Console",
  "Lucida Sans",
  "Lucida Sans Unicode",
  "MS Mincho",
  "MS Outlook",
  "MS Reference Specialty",
  "MS UI Gothic",
  "MT Extra",
  "MYRIAD PRO",
  "Manrope",
  "Marlett",
  "Meiryo UI",
  "Menlo",
  "Merriweather",
  "Merriweather Sans",
  "Microsoft Uighur",
  "Minion Pro",
  "Montserrat",
  "Monotype Corsiva",
  "Myriad",
  "Noto Sans",
  "Nunito",
  "Nunito Sans",
  "Open Sans",
  "Optima",
  "Orbitron",
  "Oswald",
  "PT Sans",
  "PT Serif",
  "Pacifico",
  "Palatino",
  "Perpetua",
  "Poppins",
  "Pristina",
  "Prompt",
  "Public Sans",
  "Quicksand",
  "Rajdhani",
  "Recursive",
  "Roboto",
  "Roboto Condensed",
  "Rockwell",
  "Rubik",
  "SCRIPTINA",
  "Segoe Print",
  "Segoe Script",
  "Segoe UI",
  "Segoe UI Light",
  "Serifa",
  "SimHei",
  "Small Fonts",
  "Sora",
  "Source Sans Pro",
  "Space Mono",
  "Staccato222 BT",
  "Tahoma",
  "Taviraj",
  "Times",
  "Times New Roman",
  "Titillium Web",
  "TRAJAN PRO",
  "Trebuchet MS",
  "Ubuntu",
  "Univers CE 55 Medium",
  "Varela Round",
  "Verdana",
  "Vrinda",
  "Work Sans",
  "ZWAdobeF"
];
var fonts = Array.from(new Set(fontCandidates));
async function getFontsFingerprint() {
  const data = await detectFonts();
  return buildComponentResult("fonts", data);
}
async function detectFonts() {
  if (typeof document === "undefined") {
    return { supported: false, reason: "document-unavailable" };
  }
  return withIframe((iframeDocument) => {
    const holder = iframeDocument.body;
    holder.style.fontSize = textSize;
    const spansContainer = iframeDocument.createElement("div");
    spansContainer.style.setProperty("visibility", "hidden", "important");
    const defaultWidth = {};
    const defaultHeight = {};
    const createSpan = (fontFamily) => {
      const span = iframeDocument.createElement("span");
      const { style } = span;
      style.position = "absolute";
      style.top = "0";
      style.left = "0";
      style.fontFamily = fontFamily;
      span.textContent = testString;
      spansContainer.appendChild(span);
      return span;
    };
    const createSpanWithFonts = (fontToDetect, baseFont) => {
      return createSpan(`'${fontToDetect}',${baseFont}`);
    };
    const baseFontsSpans = baseFonts.map(createSpan);
    const fontsSpans = {};
    for (const font of fonts) {
      fontsSpans[font] = baseFonts.map((baseFont) => createSpanWithFonts(font, baseFont));
    }
    holder.appendChild(spansContainer);
    for (let index = 0;index < baseFonts.length; index += 1) {
      const font = baseFonts[index];
      const span = baseFontsSpans[index];
      if (!font || !span) {
        continue;
      }
      defaultWidth[font] = span.offsetWidth;
      defaultHeight[font] = span.offsetHeight;
    }
    const availableFonts = fonts.filter((font) => {
      const spans = fontsSpans[font];
      if (!spans) {
        return false;
      }
      return baseFonts.some((baseFont, baseFontIndex) => {
        const span = spans[baseFontIndex];
        const baseWidth = defaultWidth[baseFont];
        const baseHeight = defaultHeight[baseFont];
        if (!span || baseWidth === undefined || baseHeight === undefined) {
          return false;
        }
        return span.offsetWidth !== baseWidth || span.offsetHeight !== baseHeight;
      });
    });
    return {
      supported: true,
      count: availableFonts.length,
      fonts: availableFonts
    };
  });
}

// src/components/forcedColors.ts
async function getForcedColorsFingerprint() {
  const data = collectForcedColors();
  return buildComponentResult("forcedColors", data);
}
function collectForcedColors() {
  if (typeof matchMedia === "undefined") {
    return { supported: false, reason: "matchmedia-unavailable" };
  }
  return {
    supported: true,
    active: matchMedia("(forced-colors: active)").matches
  };
}

// src/utils/webgl.ts
function createWebGlContext() {
  if (typeof document === "undefined") {
    return null;
  }
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
  if (!gl) {
    return null;
  }
  return { canvas, gl };
}
function getWebGlBasics(gl) {
  const debugExtension = gl.getExtension("WEBGL_debug_renderer_info");
  return {
    version: String(gl.getParameter(gl.VERSION) ?? ""),
    vendor: String(gl.getParameter(gl.VENDOR) ?? ""),
    renderer: String(gl.getParameter(gl.RENDERER) ?? ""),
    shadingLanguageVersion: String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION) ?? ""),
    vendorUnmasked: debugExtension ? String(gl.getParameter(debugExtension.UNMASKED_VENDOR_WEBGL) ?? "") : "",
    rendererUnmasked: debugExtension ? String(gl.getParameter(debugExtension.UNMASKED_RENDERER_WEBGL) ?? "") : ""
  };
}
function getWebGlExtensions(gl) {
  return gl.getSupportedExtensions() ?? [];
}
function getWebGlParameters(gl) {
  const params = {};
  const paramList = [
    ["MAX_TEXTURE_SIZE", gl.MAX_TEXTURE_SIZE],
    ["MAX_CUBE_MAP_TEXTURE_SIZE", gl.MAX_CUBE_MAP_TEXTURE_SIZE],
    ["MAX_RENDERBUFFER_SIZE", gl.MAX_RENDERBUFFER_SIZE],
    ["MAX_TEXTURE_IMAGE_UNITS", gl.MAX_TEXTURE_IMAGE_UNITS],
    ["MAX_VERTEX_TEXTURE_IMAGE_UNITS", gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS],
    ["MAX_COMBINED_TEXTURE_IMAGE_UNITS", gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS],
    ["MAX_VERTEX_ATTRIBS", gl.MAX_VERTEX_ATTRIBS],
    ["MAX_VERTEX_UNIFORM_VECTORS", gl.MAX_VERTEX_UNIFORM_VECTORS],
    ["MAX_VARYING_VECTORS", gl.MAX_VARYING_VECTORS],
    ["MAX_FRAGMENT_UNIFORM_VECTORS", gl.MAX_FRAGMENT_UNIFORM_VECTORS],
    ["ALIASED_LINE_WIDTH_RANGE", gl.ALIASED_LINE_WIDTH_RANGE],
    ["ALIASED_POINT_SIZE_RANGE", gl.ALIASED_POINT_SIZE_RANGE]
  ];
  for (const [name, key] of paramList) {
    try {
      const value = gl.getParameter(key);
      params[name] = Array.isArray(value) ? value.join(",") : value;
    } catch {
      params[name] = null;
    }
  }
  return params;
}

// src/components/hardware.ts
async function getHardwareFingerprint() {
  const data = collectHardware();
  return buildComponentResult("hardware", data);
}
function collectHardware() {
  const deviceMemory = typeof navigator !== "undefined" ? navigator.deviceMemory ?? null : null;
  const memoryInfo = typeof performance !== "undefined" ? performance.memory : undefined;
  return {
    supported: true,
    deviceMemory,
    jsHeapSizeLimit: memoryInfo?.jsHeapSizeLimit ?? null,
    videoCard: getVideoCardInfo(),
    architecture: getArchitecture()
  };
}
function getVideoCardInfo() {
  const context = createWebGlContext();
  if (!context) {
    return null;
  }
  return getWebGlBasics(context.gl);
}
function getArchitecture() {
  const f32 = new Float32Array(1);
  const u8 = new Uint8Array(f32.buffer);
  f32[0] = Number.POSITIVE_INFINITY;
  f32[0] = f32[0] - f32[0];
  return u8[3];
}

// src/components/hardwareConcurrency.ts
async function getHardwareConcurrencyFingerprint() {
  const data = collectHardwareConcurrency();
  return buildComponentResult("hardwareConcurrency", data);
}
function collectHardwareConcurrency() {
  if (typeof navigator === "undefined") {
    return { supported: false, reason: "navigator-unavailable" };
  }
  return {
    supported: true,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null
  };
}

// src/components/hdr.ts
async function getHdrFingerprint() {
  const data = collectHdr();
  return buildComponentResult("hdr", data);
}
function collectHdr() {
  if (typeof matchMedia === "undefined") {
    return { supported: false, reason: "matchmedia-unavailable" };
  }
  if (matchMedia("(dynamic-range: high)").matches) {
    return { supported: true, hdr: true };
  }
  if (matchMedia("(dynamic-range: standard)").matches) {
    return { supported: true, hdr: false };
  }
  return { supported: true, hdr: null };
}

// src/components/indexedDb.ts
async function getIndexedDbFingerprint() {
  const data = await collectIndexedDb();
  return buildComponentResult("indexedDB", data);
}
async function collectIndexedDb() {
  if (typeof window === "undefined") {
    return { supported: false, reason: "window-unavailable" };
  }
  if (!window.indexedDB) {
    return { supported: false, reason: "indexeddb-unavailable" };
  }
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open("__fp_db__", 1);
      request.onsuccess = () => {
        request.result.close();
        resolve({ supported: true });
      };
      request.onerror = () => {
        resolve({ supported: false, reason: "indexeddb-error" });
      };
    } catch (error) {
      resolve({
        supported: false,
        reason: error instanceof Error ? error.message : "indexeddb-error"
      });
    }
  });
}

// src/components/intl.ts
async function getIntlFingerprint() {
  const data = collectIntl();
  return buildComponentResult("intl", data);
}
function collectIntl() {
  if (typeof Intl === "undefined") {
    return { supported: false, reason: "intl-unavailable" };
  }
  const intl = Intl;
  const localeSet = new Set;
  for (const ctor of [
    intl.Collator,
    intl.DateTimeFormat,
    intl.DisplayNames,
    intl.ListFormat,
    intl.NumberFormat,
    intl.PluralRules,
    intl.RelativeTimeFormat
  ]) {
    if (!ctor) {
      continue;
    }
    const locale = safeLocale(ctor);
    if (locale) {
      localeSet.add(locale);
    }
  }
  const dateTimeFormat = safeCall(() => new intl.DateTimeFormat(undefined, {
    month: "long",
    timeZoneName: "long"
  }).format(963644400000));
  const displayNames = safeCall(() => intl.DisplayNames ? new intl.DisplayNames(undefined, { type: "language" }).of("en-US") : null);
  const listFormat = safeCall(() => intl.ListFormat ? new intl.ListFormat(undefined, {
    style: "long",
    type: "disjunction"
  }).format(["0", "1"]) : null);
  const numberFormat = safeCall(() => new intl.NumberFormat(undefined, {
    notation: "compact",
    compactDisplay: "long"
  }).format(21000000));
  const pluralRules = safeCall(() => new intl.PluralRules().select(1));
  const relativeTimeFormat = safeCall(() => intl.RelativeTimeFormat ? new intl.RelativeTimeFormat(undefined, {
    localeMatcher: "best fit",
    numeric: "auto",
    style: "long"
  }).format(1, "year") : null);
  return {
    supported: true,
    locales: Array.from(localeSet),
    dateTimeFormat,
    displayNames,
    listFormat,
    numberFormat,
    pluralRules,
    relativeTimeFormat
  };
}
function safeLocale(ctor) {
  try {
    const instance = new ctor;
    return instance.resolvedOptions?.().locale ?? null;
  } catch {
    return null;
  }
}
function safeCall(fn) {
  try {
    return fn();
  } catch {
    return null;
  }
}

// src/components/invertedColors.ts
async function getInvertedColorsFingerprint() {
  const data = collectInvertedColors();
  return buildComponentResult("invertedColors", data);
}
function collectInvertedColors() {
  if (typeof matchMedia === "undefined") {
    return { supported: false, reason: "matchmedia-unavailable" };
  }
  return {
    supported: true,
    inverted: matchMedia("(inverted-colors: inverted)").matches
  };
}

// src/components/languages.ts
async function getLanguagesFingerprint() {
  const data = collectLanguages();
  return buildComponentResult("languages", data, { unstable: true });
}
function collectLanguages() {
  if (typeof navigator === "undefined") {
    return { supported: false, reason: "navigator-unavailable" };
  }
  return {
    supported: true,
    language: navigator.language ?? null,
    languages: navigator.languages ?? []
  };
}

// src/components/locales.ts
async function getLocalesFingerprint() {
  const data = collectLocales();
  return buildComponentResult("locales", data, { unstable: true });
}
function collectLocales() {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? null;
  return {
    supported: true,
    language: typeof navigator !== "undefined" ? navigator.language ?? null : null,
    languages: typeof navigator !== "undefined" ? navigator.languages ?? [] : [],
    locale,
    timeZone
  };
}

// src/components/localStorage.ts
async function getLocalStorageFingerprint() {
  const data = collectLocalStorage();
  return buildComponentResult("localStorage", data);
}
function collectLocalStorage() {
  if (typeof window === "undefined") {
    return { supported: false, reason: "window-unavailable" };
  }
  try {
    const key = "__fp_local_test__";
    window.localStorage.setItem(key, "1");
    window.localStorage.removeItem(key);
    return { supported: true };
  } catch (error) {
    return {
      supported: false,
      reason: error instanceof Error ? error.message : "local-storage-error"
    };
  }
}

// src/components/math.ts
async function getMathFingerprint() {
  const data = collectMath();
  return buildComponentResult("math", data);
}
function collectMath() {
  const integrate = (fn, a, b, n) => {
    const h = (b - a) / n;
    let sum = 0;
    for (let i = 0;i < n; i += 1) {
      const x = a + (i + 0.5) * h;
      sum += fn(x);
    }
    return sum * h;
  };
  return {
    supported: true,
    acos: Math.acos(0.5),
    asin: integrate(Math.asin, -1, 1, 97),
    cos: integrate(Math.cos, 0, Math.PI, 97),
    largeCos: Math.cos(100000000000000000000),
    largeSin: Math.sin(100000000000000000000),
    largeTan: Math.tan(100000000000000000000),
    sin: integrate(Math.sin, -Math.PI, Math.PI, 97),
    tan: integrate(Math.tan, 0, 2 * Math.PI, 97)
  };
}

// src/components/mathml.ts
var BLACKBOARD_BOLD = [
  String.fromCharCode(55349, 56580),
  String.fromCharCode(55349, 56581),
  String.fromCharCode(8493),
  String.fromCharCode(55349, 56583),
  String.fromCharCode(55349, 56584),
  String.fromCharCode(55349, 56585),
  String.fromCharCode(55349, 56632),
  String.fromCharCode(55349, 56633),
  String.fromCharCode(8450),
  String.fromCharCode(55349, 56635),
  String.fromCharCode(55349, 56636),
  String.fromCharCode(55349, 56637)
];
var GREEK_SYMBOLS = [
  String.fromCharCode(946),
  String.fromCharCode(968),
  String.fromCharCode(955),
  String.fromCharCode(949),
  String.fromCharCode(950),
  String.fromCharCode(945),
  String.fromCharCode(958),
  String.fromCharCode(956),
  String.fromCharCode(961),
  String.fromCharCode(966),
  String.fromCharCode(954),
  String.fromCharCode(964),
  String.fromCharCode(951),
  String.fromCharCode(963),
  String.fromCharCode(953),
  String.fromCharCode(969),
  String.fromCharCode(947),
  String.fromCharCode(957),
  String.fromCharCode(967),
  String.fromCharCode(948),
  String.fromCharCode(952),
  String.fromCharCode(960),
  String.fromCharCode(965),
  String.fromCharCode(959)
];
async function getMathmlFingerprint() {
  const data = await collectMathml();
  return buildComponentResult("mathml", data);
}
async function collectMathml() {
  if (typeof document === "undefined") {
    return { supported: false, reason: "document-unavailable" };
  }
  return withIframe((iframeDocument) => {
    if (!isMathmlSupported(iframeDocument)) {
      return { supported: false, reason: "mathml-unavailable" };
    }
    const structures = [
      createMathML("<msubsup><mo>&#x222B;</mo><mi>a</mi><mi>b</mi></msubsup><mfrac><mrow><mi>f</mi><mo>(</mo><mi>x</mi><mo>)</mo></mrow><mrow><mi>g</mi><mo>(</mo><mi>x</mi><mo>)</mo></mrow></mfrac><mi>dx</mi>"),
      createMathML("<mfrac><mrow><mi>&#x03C0;</mi><mo>&#x00D7;</mo><msup><mi>r</mi><mn>2</mn></msup></mrow><mrow><mn>2</mn><mi>&#x03C3;</mi></mrow></mfrac>"),
      createMathML("<mo>[</mo><mtable><mtr><mtd><mi>&#x03B1;</mi></mtd><mtd><mi>&#x03B2;</mi></mtd></mtr><mtr><mtd><mi>&#x03B3;</mi></mtd><mtd><mi>&#x03B4;</mi></mtd></mtr></mtable><mo>]</mo>"),
      createComplexNestedStructure()
    ];
    const dimensions = structures.map((structure) => measureStructure(structure, iframeDocument));
    return {
      supported: true,
      dimensions,
      fontInfo: dimensions[0]?.fontInfo ?? null
    };
  });
}
function isMathmlSupported(doc) {
  try {
    const testElement = doc.createElement("math");
    testElement.innerHTML = "<mrow><mi>x</mi></mrow>";
    testElement.style.position = "absolute";
    testElement.style.visibility = "hidden";
    doc.body.appendChild(testElement);
    const rect = testElement.getBoundingClientRect();
    doc.body.removeChild(testElement);
    return rect.width > 0 && rect.height > 0;
  } catch {
    return false;
  }
}
function createMathML(content) {
  return `<math><mrow>${content}</mrow></math>`;
}
function createComplexNestedStructure() {
  let nestedContent = "<mo>&#x220F;</mo>";
  BLACKBOARD_BOLD.forEach((bbSymbol, bbIndex) => {
    const startIdx = bbIndex * 2;
    const greekSet = GREEK_SYMBOLS.slice(startIdx, startIdx + 2);
    if (greekSet.length === 2) {
      nestedContent += `<mmultiscripts><mi>${bbSymbol}</mi><none/><mi>${greekSet[1]}</mi><mprescripts></mprescripts><mi>${greekSet[0]}</mi><none/></mmultiscripts>`;
    }
  });
  return createMathML(`<munderover><mmultiscripts>${nestedContent}</mmultiscripts></munderover>`);
}
function measureStructure(mathml, doc) {
  const mathElement = doc.createElement("math");
  mathElement.innerHTML = mathml.replace(/<\/?math>/g, "");
  mathElement.style.whiteSpace = "nowrap";
  mathElement.style.position = "absolute";
  mathElement.style.visibility = "hidden";
  mathElement.style.top = "-9999px";
  doc.body.appendChild(mathElement);
  const rect = mathElement.getBoundingClientRect();
  const computedStyle = (doc.defaultView ?? window).getComputedStyle(mathElement);
  const result = {
    dimensions: {
      width: rect.width,
      height: rect.height
    },
    fontInfo: {
      fontFamily: computedStyle.fontFamily,
      fontSize: computedStyle.fontSize,
      fontWeight: computedStyle.fontWeight,
      fontStyle: computedStyle.fontStyle,
      lineHeight: computedStyle.lineHeight
    }
  };
  doc.body.removeChild(mathElement);
  return result;
}

// src/components/media.ts
var MIME_TYPES = [
  'audio/ogg; codecs="vorbis"',
  "audio/mpeg",
  "audio/mpegurl",
  'audio/wav; codecs="1"',
  "audio/x-m4a",
  "audio/aac",
  'video/ogg; codecs="theora"',
  "video/quicktime",
  'video/mp4; codecs="avc1.42E01E"',
  'video/webm; codecs="vp8"',
  'video/webm; codecs="vp9"',
  "video/x-matroska"
].sort();
async function getMediaFingerprint() {
  const data = collectMedia();
  return buildComponentResult("media", data);
}
function collectMedia() {
  if (typeof window === "undefined") {
    return { supported: false, reason: "window-unavailable" };
  }
  if (typeof document === "undefined") {
    return { supported: false, reason: "document-unavailable" };
  }
  const audio = new Audio;
  const video = document.createElement("video");
  const hasMediaSource = typeof MediaSource !== "undefined" && typeof MediaSource.isTypeSupported === "function";
  const hasMediaRecorder = typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function";
  const mimeTypes = [];
  for (const mimeType of MIME_TYPES) {
    const audioPlayType = audio.canPlayType(mimeType);
    const videoPlayType = video.canPlayType(mimeType);
    const mediaSource = hasMediaSource ? MediaSource.isTypeSupported(mimeType) : false;
    const mediaRecorder = hasMediaRecorder ? MediaRecorder.isTypeSupported(mimeType) : false;
    if (!audioPlayType && !videoPlayType && !mediaSource && !mediaRecorder) {
      continue;
    }
    mimeTypes.push({
      mimeType,
      audioPlayType,
      videoPlayType,
      mediaSource,
      mediaRecorder
    });
  }
  return { supported: true, mimeTypes };
}

// src/components/monochrome.ts
async function getMonochromeFingerprint() {
  const data = collectMonochrome();
  return buildComponentResult("monochrome", data);
}
function collectMonochrome() {
  if (typeof matchMedia === "undefined") {
    return { supported: false, reason: "matchmedia-unavailable" };
  }
  for (let i = 0;i <= 10; i += 1) {
    if (matchMedia(`(monochrome: ${i})`).matches) {
      return { supported: true, monochrome: i };
    }
  }
  return { supported: true, monochrome: 0 };
}

// src/components/networkInformation.ts
async function getNetworkInformationFingerprint() {
  const data = collectNetworkInformation();
  return buildComponentResult("networkInformation", data, {
    unstable: data.supported
  });
}
function collectNetworkInformation() {
  if (typeof navigator === "undefined") {
    return { supported: false, reason: "navigator-unavailable" };
  }
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!connection) {
    return { supported: false, reason: "connection-unavailable" };
  }
  const properties = [
    "type",
    "effectiveType",
    "downlink",
    "downlinkMax",
    "rtt",
    "saveData",
    "onchange"
  ];
  const propertyInfo = {};
  for (const property of properties) {
    propertyInfo[property] = {
      exists: property in connection,
      type: property in connection ? typeof connection[property] : null
    };
  }
  const downlink = typeof connection.downlink === "number" ? Math.round(connection.downlink * 10) / 10 : null;
  const downlinkMax = typeof connection.downlinkMax === "number" ? Math.round(connection.downlinkMax * 10) / 10 : null;
  const rtt = typeof connection.rtt === "number" ? Math.round(connection.rtt / 50) * 50 : null;
  const changeEventSupported = (() => {
    if (typeof connection.addEventListener !== "function") {
      return false;
    }
    try {
      const handler = () => {};
      connection.addEventListener("change", handler);
      connection.removeEventListener?.("change", handler);
      return true;
    } catch {
      return false;
    }
  })();
  return {
    supported: true,
    properties: propertyInfo,
    capabilities: {
      changeEventSupported
    },
    currentValues: {
      type: connection.type ?? null,
      effectiveType: connection.effectiveType ?? null,
      downlink,
      downlinkMax,
      rtt,
      saveData: connection.saveData ?? null
    }
  };
}

// src/components/openDatabase.ts
async function getOpenDatabaseFingerprint() {
  const data = collectOpenDatabase();
  return buildComponentResult("openDatabase", data);
}
function collectOpenDatabase() {
  if (typeof window === "undefined") {
    return { supported: false, reason: "window-unavailable" };
  }
  const opener = window.openDatabase;
  if (!opener) {
    return { supported: false, reason: "open-database-unavailable" };
  }
  try {
    opener("__fp_db__", "1.0", "fp", 1024);
    return { supported: true };
  } catch (error) {
    return {
      supported: false,
      reason: error instanceof Error ? error.message : "open-database-error"
    };
  }
}

// src/components/osCpu.ts
async function getOsCpuFingerprint() {
  const data = collectOsCpu();
  return buildComponentResult("osCpu", data);
}
function collectOsCpu() {
  if (typeof navigator === "undefined") {
    return { supported: false, reason: "navigator-unavailable" };
  }
  const oscpu = navigator.oscpu;
  return {
    supported: true,
    oscpu: oscpu ?? null
  };
}

// src/components/pdfViewerEnabled.ts
async function getPdfViewerEnabledFingerprint() {
  const data = collectPdfViewerEnabled();
  return buildComponentResult("pdfViewerEnabled", data);
}
function collectPdfViewerEnabled() {
  if (typeof navigator === "undefined") {
    return { supported: false, reason: "navigator-unavailable" };
  }
  const pdfViewerEnabled = navigator.pdfViewerEnabled;
  if (typeof pdfViewerEnabled === "boolean") {
    return { supported: true, enabled: pdfViewerEnabled };
  }
  const mimeType = navigator.mimeTypes?.namedItem("application/pdf");
  return {
    supported: true,
    enabled: Boolean(mimeType)
  };
}

// src/components/permissions.ts
var permissionKeys = [
  "accelerometer",
  "accessibility",
  "accessibility-events",
  "ambient-light-sensor",
  "background-fetch",
  "background-sync",
  "bluetooth",
  "camera",
  "clipboard-read",
  "clipboard-write",
  "device-info",
  "display-capture",
  "gyroscope",
  "geolocation",
  "local-fonts",
  "magnetometer",
  "microphone",
  "midi",
  "nfc",
  "notifications",
  "payment-handler",
  "persistent-storage",
  "push",
  "speaker",
  "storage-access",
  "top-level-storage-access",
  "window-management"
];
async function getPermissionsFingerprint() {
  const data = await collectPermissions();
  return buildComponentResult("permissions", data);
}
async function collectPermissions() {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return { supported: false, reason: "permissions-unavailable" };
  }
  const results = {};
  for (const key of permissionKeys) {
    try {
      const status = await navigator.permissions.query({
        name: key
      });
      results[key] = status.state;
    } catch {}
  }
  return {
    supported: true,
    permissions: results
  };
}

// src/components/platform.ts
async function getPlatformFingerprint() {
  const data = collectPlatform();
  return buildComponentResult("platform", data);
}
function collectPlatform() {
  if (typeof navigator === "undefined") {
    return { supported: false, reason: "navigator-unavailable" };
  }
  const uaData = navigator.userAgentData;
  return {
    supported: true,
    platform: navigator.platform ?? null,
    uaPlatform: uaData?.platform ?? null,
    uaMobile: uaData?.mobile ?? null
  };
}

// src/components/plugins.ts
async function getPluginsFingerprint() {
  const data = collectPlugins();
  return buildComponentResult("plugins", data);
}
function collectPlugins() {
  if (typeof navigator === "undefined") {
    return { supported: false, reason: "navigator-unavailable" };
  }
  const plugins = [];
  const mimeTypes = [];
  if (navigator.plugins) {
    for (let i = 0;i < navigator.plugins.length; i += 1) {
      const plugin = navigator.plugins[i];
      if (!plugin) {
        continue;
      }
      plugins.push([plugin.name, plugin.filename, plugin.description].join("|"));
    }
  }
  if (navigator.mimeTypes) {
    for (let i = 0;i < navigator.mimeTypes.length; i += 1) {
      const mime = navigator.mimeTypes[i];
      if (!mime) {
        continue;
      }
      mimeTypes.push([mime.type, mime.description, mime.suffixes].join("|"));
    }
  }
  return {
    supported: true,
    plugins,
    mimeTypes
  };
}

// src/components/privateClickMeasurement.ts
async function getPrivateClickMeasurementFingerprint() {
  const data = collectPrivateClickMeasurement();
  return buildComponentResult("privateClickMeasurement", data);
}
function collectPrivateClickMeasurement() {
  if (typeof document === "undefined") {
    return { supported: false, reason: "document-unavailable" };
  }
  const link = document.createElement("a");
  const sourceId = link.attributionSourceId ?? link.attributionsourceid;
  return {
    supported: true,
    value: sourceId === undefined ? null : String(sourceId)
  };
}

// src/components/reducedMotion.ts
async function getReducedMotionFingerprint() {
  const data = collectReducedMotion();
  return buildComponentResult("reducedMotion", data);
}
function collectReducedMotion() {
  if (typeof matchMedia === "undefined") {
    return { supported: false, reason: "matchmedia-unavailable" };
  }
  return {
    supported: true,
    reduced: matchMedia("(prefers-reduced-motion: reduce)").matches
  };
}

// src/components/reducedTransparency.ts
async function getReducedTransparencyFingerprint() {
  const data = collectReducedTransparency();
  return buildComponentResult("reducedTransparency", data);
}
function collectReducedTransparency() {
  if (typeof matchMedia === "undefined") {
    return { supported: false, reason: "matchmedia-unavailable" };
  }
  return {
    supported: true,
    reduced: matchMedia("(prefers-reduced-transparency: reduce)").matches
  };
}

// src/components/screen.ts
async function getScreenFingerprint() {
  const data = collectScreen();
  return buildComponentResult("screen", data);
}
function collectScreen() {
  if (typeof window === "undefined" || typeof screen === "undefined") {
    return { supported: false, reason: "screen-unavailable" };
  }
  return {
    supported: true,
    width: screen.width,
    height: screen.height,
    availWidth: screen.availWidth,
    availHeight: screen.availHeight,
    colorDepth: screen.colorDepth,
    pixelRatio: window.devicePixelRatio ?? null,
    maxTouchPoints: navigator?.maxTouchPoints ?? null,
    mediaMatches: collectMediaMatches()
  };
}
function collectMediaMatches() {
  if (typeof matchMedia === "undefined") {
    return [];
  }
  const mediaQueries = {
    "prefers-contrast": [
      "high",
      "more",
      "low",
      "less",
      "custom",
      "forced",
      "no-preference"
    ],
    "prefers-reduced-data": ["reduce", "no-preference"],
    "any-hover": ["hover", "none"],
    "any-pointer": ["none", "coarse", "fine"],
    pointer: ["none", "coarse", "fine"],
    hover: ["hover", "none"],
    update: ["fast", "slow", "none"],
    "inverted-colors": ["inverted", "none"],
    "prefers-reduced-motion": ["reduce", "no-preference"],
    "prefers-reduced-transparency": ["reduce", "no-preference"],
    scripting: ["none", "initial-only", "enabled"],
    "forced-colors": ["active", "none"],
    "display-mode": [
      "browser",
      "minimal-ui",
      "standalone",
      "fullscreen",
      "window-controls-overlay"
    ],
    orientation: ["portrait", "landscape"],
    "color-gamut": ["srgb", "p3", "rec2020"],
    "dynamic-range": ["high", "standard"],
    "overflow-block": ["none", "scroll", "paged"],
    "overflow-inline": ["none", "scroll"],
    scan: ["interlace", "progressive"],
    grid: [0, 1],
    color: [1, 4, 8, 10, 12, 16, 24, 30, 48],
    "color-index": [0, 1, 2, 4, 8, 16, 256, 1024]
  };
  const results = [];
  for (const [key, values] of Object.entries(mediaQueries)) {
    for (const value of values) {
      if (matchMedia(`(${key}: ${value})`).matches) {
        results.push(`${key}: ${value}`);
      }
    }
  }
  return results;
}

// src/components/screenFrame.ts
async function getScreenFrameFingerprint() {
  const data = collectScreenFrame();
  return buildComponentResult("screenFrame", data);
}
function collectScreenFrame() {
  if (typeof screen === "undefined") {
    return { supported: false, reason: "screen-unavailable" };
  }
  const availTop = toNumber(screen.availTop);
  const availLeft = toNumber(screen.availLeft);
  const width = toNumber(screen.width);
  const height = toNumber(screen.height);
  const availWidth = toNumber(screen.availWidth);
  const availHeight = toNumber(screen.availHeight);
  const frame = [
    availTop,
    subtractIfNumber(width, availWidth, availLeft),
    subtractIfNumber(height, availHeight, availTop),
    availLeft
  ].map((value) => round2(value, 10));
  return {
    supported: true,
    frame
  };
}
function toNumber(value) {
  if (value === undefined) {
    return null;
  }
  const numberValue = typeof value === "string" ? Number.parseFloat(value) : value;
  return Number.isFinite(numberValue) ? numberValue : null;
}
function subtractIfNumber(value, subtract, subtract2) {
  if (value === null) {
    return null;
  }
  const result = value - (subtract ?? 0) - (subtract2 ?? 0);
  return Number.isFinite(result) ? result : null;
}
function round2(value, precision) {
  if (value === null) {
    return null;
  }
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

// src/components/screenResolution.ts
async function getScreenResolutionFingerprint() {
  const data = collectScreenResolution();
  return buildComponentResult("screenResolution", data);
}
function collectScreenResolution() {
  if (typeof screen === "undefined") {
    return { supported: false, reason: "screen-unavailable" };
  }
  const width = screen.width;
  const height = screen.height;
  const availWidth = screen.availWidth;
  const availHeight = screen.availHeight;
  return {
    supported: true,
    width,
    height,
    availWidth,
    availHeight,
    orientation: width && height ? `${Math.max(width, height)}x${Math.min(width, height)}` : null,
    pixelRatio: typeof window !== "undefined" ? window.devicePixelRatio : null
  };
}

// src/components/sensors.ts
var sensorTypes = [
  "Accelerometer",
  "LinearAccelerationSensor",
  "GravitySensor",
  "Gyroscope",
  "AbsoluteOrientationSensor",
  "RelativeOrientationSensor",
  "Magnetometer",
  "AmbientLightSensor"
];
async function getSensorsFingerprint() {
  const data = collectSensors();
  return buildComponentResult("sensors", data);
}
function collectSensors() {
  if (typeof window === "undefined") {
    return { supported: false, reason: "window-unavailable" };
  }
  const sensors = {};
  const windowRecord = window;
  for (const sensorType of sensorTypes) {
    const value = windowRecord[sensorType];
    sensors[sensorType] = {
      exists: typeof value !== "undefined",
      type: typeof value === "undefined" ? null : typeof value
    };
  }
  const hasDeviceMotion = typeof DeviceMotionEvent !== "undefined";
  const hasDeviceOrientation = typeof DeviceOrientationEvent !== "undefined";
  return {
    supported: true,
    sensors,
    capabilities: {
      genericSensor: typeof window.Sensor !== "undefined",
      sensorErrorEvent: typeof window.SensorErrorEvent !== "undefined"
    },
    legacy: {
      deviceMotionEvent: hasDeviceMotion,
      deviceOrientationEvent: hasDeviceOrientation,
      deviceMotionEventAcceleration: hasDeviceMotion && "acceleration" in DeviceMotionEvent.prototype,
      deviceOrientationEventAbsolute: hasDeviceOrientation && "absolute" in DeviceOrientationEvent.prototype
    },
    permissionRequests: {
      deviceMotion: hasDeviceMotion && typeof DeviceMotionEvent.requestPermission === "function",
      deviceOrientation: hasDeviceOrientation && typeof DeviceOrientationEvent.requestPermission === "function"
    }
  };
}

// src/components/sessionStorage.ts
async function getSessionStorageFingerprint() {
  const data = collectSessionStorage();
  return buildComponentResult("sessionStorage", data);
}
function collectSessionStorage() {
  if (typeof window === "undefined") {
    return { supported: false, reason: "window-unavailable" };
  }
  try {
    const key = "__fp_session_test__";
    window.sessionStorage.setItem(key, "1");
    window.sessionStorage.removeItem(key);
    return { supported: true };
  } catch (error) {
    return {
      supported: false,
      reason: error instanceof Error ? error.message : "session-storage-error"
    };
  }
}

// src/components/speech.ts
var VOICE_LOAD_TIMEOUT = 800;
async function getSpeechFingerprint() {
  const data = await collectSpeech();
  return buildComponentResult("speech", data);
}
async function collectSpeech() {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return { supported: false, reason: "speech-unavailable" };
  }
  const voices = await loadVoices();
  const voiceSignatures = voices.map((voice) => {
    const escapeValue = (value) => value.replace(/\\/g, "\\\\").replace(/,/g, "\\,");
    return [
      escapeValue(voice.voiceURI || ""),
      escapeValue(voice.name || ""),
      escapeValue(voice.lang || ""),
      voice.localService ? "1" : "0",
      voice.default ? "1" : "0"
    ].join(",");
  });
  voiceSignatures.sort();
  return {
    supported: true,
    voiceCount: voices.length,
    voices: voiceSignatures
  };
}
function loadVoices() {
  return new Promise((resolve) => {
    const immediate = window.speechSynthesis.getVoices();
    if (immediate.length > 0) {
      resolve(immediate);
      return;
    }
    const timeout = window.setTimeout(() => {
      resolve(window.speechSynthesis.getVoices());
    }, VOICE_LOAD_TIMEOUT);
    const onVoicesChanged = () => {
      clearTimeout(timeout);
      window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged);
  });
}

// src/components/svg.ts
var SVG_NS = "http://www.w3.org/2000/svg";
var EMOJI_SET2 = [
  "\uD83D\uDE00",
  "\uD83D\uDE03",
  "\uD83D\uDE04",
  "\uD83D\uDE01",
  "\uD83D\uDE06",
  "\uD83D\uDE05",
  "\uD83D\uDE02",
  "\uD83E\uDD23",
  "\uD83D\uDE42",
  "\uD83D\uDE43",
  "\uD83D\uDE09",
  "\uD83D\uDE0A"
];
async function getSvgFingerprint() {
  const data = collectSvg();
  return buildComponentResult("svg", data, { unstable: true });
}
function collectSvg() {
  if (typeof document === "undefined") {
    return { supported: false, reason: "document-unavailable" };
  }
  if (!document.body) {
    return { supported: false, reason: "document-body-unavailable" };
  }
  const container = document.createElement("div");
  container.style.cssText = "position:absolute;left:-9999px;top:-9999px;visibility:hidden;";
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "240");
  svg.setAttribute("height", "160");
  const group = document.createElementNS(SVG_NS, "g");
  group.setAttribute("style", "font-family:'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif;font-size:32px;");
  const texts = EMOJI_SET2.map((emoji, index) => {
    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("x", "0");
    text.setAttribute("y", `${40 + index * 12}`);
    text.textContent = emoji;
    group.appendChild(text);
    return text;
  });
  svg.appendChild(group);
  container.appendChild(svg);
  document.body.appendChild(container);
  try {
    const bBox = reduceRect2(safeCall2(() => group.getBBox()) ?? null);
    const primary = texts[0];
    if (!primary) {
      return { supported: false, reason: "svg-text-unavailable" };
    }
    const extentOfChar = reduceRect2(safeCall2(() => primary.getExtentOfChar(0)) ?? null);
    const subStringLength = safeCall2(() => primary.getSubStringLength(0, 2));
    const computedTextLength = safeCall2(() => primary.getComputedTextLength());
    const emojiSet = new Map;
    for (const text of texts) {
      const length = safeCall2(() => text.getComputedTextLength());
      if (length == null) {
        continue;
      }
      const key = round3(length).toFixed(3);
      if (!emojiSet.has(key)) {
        emojiSet.set(key, text.textContent ?? "");
      }
    }
    return {
      supported: true,
      bBox,
      extentOfChar,
      subStringLength,
      computedTextLength,
      emojiSet: Array.from(emojiSet.values())
    };
  } finally {
    document.body.removeChild(container);
  }
}
function reduceRect2(rect) {
  if (!rect) {
    return null;
  }
  return {
    x: round3(rect.x ?? rect.left),
    y: round3(rect.y ?? rect.top),
    width: round3(rect.width),
    height: round3(rect.height)
  };
}
function safeCall2(fn) {
  try {
    return fn();
  } catch {
    return null;
  }
}
function round3(value) {
  return Math.round(value * 1000) / 1000;
}

// src/components/system.ts
async function getSystemFingerprint() {
  const data = collectSystem();
  return buildComponentResult("system", data);
}
function collectSystem() {
  if (typeof navigator === "undefined") {
    return { supported: false, reason: "navigator-unavailable" };
  }
  const browser = getBrowserInfo();
  return {
    supported: true,
    platform: navigator.platform ?? null,
    productSub: navigator.productSub ?? null,
    product: navigator.product ?? null,
    userAgent: navigator.userAgent ?? null,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    deviceMemory: navigator.deviceMemory ?? null,
    browser,
    mobile: isMobileUserAgent(),
    cookieEnabled: navigator.cookieEnabled ?? null
  };
}
function getBrowserInfo() {
  if (typeof navigator === "undefined") {
    return { name: "unknown", version: null };
  }
  const ua = navigator.userAgent;
  const candidates = [
    ["Edge", /Edg\/([\d.]+)/],
    ["Chrome", /Chrome\/([\d.]+)/],
    ["Firefox", /Firefox\/([\d.]+)/],
    ["Safari", /Version\/([\d.]+).*Safari/]
  ];
  for (const [name, regex] of candidates) {
    const match = ua.match(regex);
    if (match) {
      return { name, version: match[1] ?? null };
    }
  }
  return { name: "unknown", version: null };
}
function isMobileUserAgent() {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// src/components/timezone.ts
async function getTimezoneFingerprint() {
  const data = collectTimezone();
  return buildComponentResult("timezone", data);
}
function collectTimezone() {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  return {
    supported: true,
    timeZone,
    offsetMinutes: new Date().getTimezoneOffset()
  };
}

// src/components/touchSupport.ts
async function getTouchSupportFingerprint() {
  const data = collectTouchSupport();
  return buildComponentResult("touchSupport", data);
}
function collectTouchSupport() {
  if (typeof navigator === "undefined") {
    return { supported: false, reason: "navigator-unavailable" };
  }
  const maxTouchPoints = navigator.maxTouchPoints ?? 0;
  const msMaxTouchPoints = navigator.msMaxTouchPoints;
  return {
    supported: true,
    maxTouchPoints,
    msMaxTouchPoints: msMaxTouchPoints ?? null,
    ontouchstart: typeof window !== "undefined" && "ontouchstart" in window
  };
}

// src/components/userAgent.ts
async function getUserAgentFingerprint() {
  const data = collectUserAgent();
  return buildComponentResult("userAgent", data, { unstable: true });
}
function collectUserAgent() {
  if (typeof navigator === "undefined") {
    return { supported: false, reason: "navigator-unavailable" };
  }
  const uaData = navigator.userAgentData;
  return {
    supported: true,
    userAgent: navigator.userAgent ?? null,
    platform: navigator.platform ?? null,
    language: navigator.language ?? null,
    languages: navigator.languages ?? [],
    uaBrands: uaData?.brands ?? null,
    uaMobile: uaData?.mobile ?? null,
    uaPlatform: uaData?.platform ?? null
  };
}

// src/components/vendor.ts
async function getVendorFingerprint() {
  const data = collectVendor();
  return buildComponentResult("vendor", data);
}
function collectVendor() {
  if (typeof navigator === "undefined") {
    return { supported: false, reason: "navigator-unavailable" };
  }
  return {
    supported: true,
    vendor: navigator.vendor ?? null
  };
}

// src/components/vendorFlavors.ts
async function getVendorFlavorsFingerprint() {
  const data = collectVendorFlavors();
  return buildComponentResult("vendorFlavors", data);
}
function collectVendorFlavors() {
  if (typeof navigator === "undefined") {
    return { supported: false, reason: "navigator-unavailable" };
  }
  const uaData = navigator.userAgentData;
  const brands = uaData?.brands?.map((entry) => ({
    brand: entry.brand,
    version: entry.version
  })) ?? null;
  return {
    supported: true,
    brands,
    mobile: uaData?.mobile ?? null
  };
}

// src/components/webGlBasics.ts
async function getWebGlBasicsFingerprint() {
  const data = collectWebGlBasics();
  return buildComponentResult("webGlBasics", data);
}
function collectWebGlBasics() {
  const context = createWebGlContext();
  if (!context) {
    return { supported: false, reason: "webgl-unavailable" };
  }
  return {
    supported: true,
    ...getWebGlBasics(context.gl)
  };
}

// src/components/webGlExtensions.ts
async function getWebGlExtensionsFingerprint() {
  const data = collectWebGlExtensions();
  return buildComponentResult("webGlExtensions", data);
}
function collectWebGlExtensions() {
  const context = createWebGlContext();
  if (!context) {
    return { supported: false, reason: "webgl-unavailable" };
  }
  return {
    supported: true,
    extensions: getWebGlExtensions(context.gl),
    parameters: getWebGlParameters(context.gl)
  };
}

// src/components/webgl.ts
async function getWebglFingerprint() {
  const data = collectWebgl();
  return buildComponentResult("webgl", data);
}
function collectWebgl() {
  const context = createWebGlContext();
  if (!context) {
    return { supported: false, reason: "webgl-unavailable" };
  }
  const runs = isSamsungBrowser() ? 3 : 1;
  const imageDatas = [];
  for (let i = 0;i < runs; i += 1) {
    imageDatas.push(renderWebGlImage(context.canvas, context.gl));
  }
  const commonPixels = getCommonPixels(imageDatas, context.canvas.width, context.canvas.height);
  const imageHash = Array.from(commonPixels).join(",");
  return {
    supported: true,
    basics: getWebGlBasics(context.gl),
    extensions: getWebGlExtensions(context.gl),
    parameters: getWebGlParameters(context.gl),
    imageHash
  };
}
function renderWebGlImage(canvas, gl) {
  canvas.width = 200;
  canvas.height = 100;
  const vertexShaderSource = `
		attribute vec2 position;
		void main() {
			gl_Position = vec4(position, 0.0, 1.0);
		}
	`;
  const fragmentShaderSource = `
		precision mediump float;
		void main() {
			gl_FragColor = vec4(0.812, 0.195, 0.553, 0.921);
		}
	`;
  const vertexShader = gl.createShader(gl.VERTEX_SHADER);
  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  if (!vertexShader || !fragmentShader) {
    return new ImageData(1, 1);
  }
  gl.shaderSource(vertexShader, vertexShaderSource);
  gl.shaderSource(fragmentShader, fragmentShaderSource);
  gl.compileShader(vertexShader);
  gl.compileShader(fragmentShader);
  const program = gl.createProgram();
  if (!program) {
    return new ImageData(1, 1);
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.useProgram(program);
  const numSpokes = 137;
  const vertices = new Float32Array(numSpokes * 4);
  const angleIncrement = 2 * Math.PI / numSpokes;
  for (let i = 0;i < numSpokes; i += 1) {
    const angle = i * angleIncrement;
    vertices[i * 4] = 0;
    vertices[i * 4 + 1] = 0;
    vertices[i * 4 + 2] = Math.cos(angle) * (canvas.width / 2);
    vertices[i * 4 + 3] = Math.sin(angle) * (canvas.height / 2);
  }
  const vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  const positionAttribute = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(positionAttribute);
  gl.vertexAttribPointer(positionAttribute, 2, gl.FLOAT, false, 0, 0);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.LINES, 0, numSpokes * 2);
  const pixelData = new Uint8ClampedArray(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixelData);
  return new ImageData(pixelData, canvas.width, canvas.height);
}
function isSamsungBrowser() {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /SamsungBrowser/i.test(navigator.userAgent);
}

// src/components/webrtc.ts
async function getWebrtcFingerprint() {
  const data = await collectWebrtc();
  return buildComponentResult("webrtc", data);
}
async function collectWebrtc() {
  if (typeof window === "undefined") {
    return { supported: false, reason: "window-unavailable" };
  }
  const RTCPeerConnectionCtor = window.RTCPeerConnection ?? window.webkitRTCPeerConnection ?? window.mozRTCPeerConnection;
  if (!RTCPeerConnectionCtor) {
    return { supported: false, reason: "webrtc-unavailable" };
  }
  const connection = new RTCPeerConnectionCtor({
    iceServers: [],
    iceCandidatePoolSize: 1
  });
  connection.createDataChannel("fp");
  try {
    const offer = await connection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    });
    await connection.setLocalDescription(offer);
    const sdp = offer.sdp ?? "";
    const extensions = [
      ...new Set((sdp.match(/extmap:\d+ [^\n\r]+/g) || []).map((line) => line.replace(/extmap:\d+ /, "")))
    ].sort();
    const audioCodecs = parseCodecs(sdp, "audio");
    const videoCodecs = parseCodecs(sdp, "video");
    const candidateType = await collectIceCandidate(connection, 3000);
    return {
      supported: true,
      audioCodecsHash: stableStringify(audioCodecs),
      videoCodecsHash: stableStringify(videoCodecs),
      extensionsHash: stableStringify(extensions),
      audioCodecCount: audioCodecs.length,
      videoCodecCount: videoCodecs.length,
      candidateType
    };
  } catch (error) {
    return {
      supported: true,
      error: error instanceof Error ? error.message : "webrtc-error"
    };
  } finally {
    connection.close();
  }
}
function parseCodecs(sdp, mediaType) {
  const match = sdp.match(new RegExp(`m=${mediaType} [^\\s]+ [^\\s]+ ([^\\n\\r]+)`));
  const descriptors = match?.[1]?.split(" ") ?? [];
  return descriptors.map((descriptor) => {
    const matcher = new RegExp(`(rtpmap|fmtp|rtcp-fb):${descriptor} (.+)`, "g");
    const matches = [...sdp.matchAll(matcher)];
    if (!matches.length) {
      return null;
    }
    const description = {};
    for (const [, type, data] of matches) {
      if (!data) {
        continue;
      }
      const parts = data.split("/");
      if (type === "rtpmap") {
        description.mimeType = `${mediaType}/${parts[0]}`;
        description.clockRate = Number(parts[1]);
        if (mediaType === "audio") {
          description.channels = Number(parts[2] ?? 1);
        }
      } else if (type === "rtcp-fb") {
        const feedback = description.feedbackSupport;
        description.feedbackSupport = feedback ? [...feedback, data] : [data];
      } else if (type === "fmtp") {
        description.sdpFmtpLine = data;
      }
    }
    return description;
  }).filter((item) => item !== null);
}
function collectIceCandidate(connection, timeoutMs) {
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      connection.removeEventListener("icecandidate", onIceCandidate);
      resolve(null);
    }, timeoutMs);
    const onIceCandidate = (event) => {
      if (!event.candidate || !event.candidate.candidate) {
        return;
      }
      clearTimeout(timeout);
      connection.removeEventListener("icecandidate", onIceCandidate);
      resolve(event.candidate.type ?? null);
    };
    connection.addEventListener("icecandidate", onIceCandidate);
  });
}

// src/index.ts
var SERVER_MARKER = "server";
var componentRegistry = {
  applePay: getApplePayFingerprint,
  architecture: getArchitectureFingerprint,
  audio: getAudioFingerprint,
  audioBaseLatency: getAudioBaseLatencyFingerprint,
  canvas: getCanvasFingerprint,
  clipboard: getClipboardFingerprint,
  colorDepth: getColorDepthFingerprint,
  colorGamut: getColorGamutFingerprint,
  contrast: getContrastFingerprint,
  cookiesEnabled: getCookiesEnabledFingerprint,
  cpuClass: getCpuClassFingerprint,
  dateTimeLocale: getDateTimeLocaleFingerprint,
  deviceMemory: getDeviceMemoryFingerprint,
  domBlockers: getDomBlockersFingerprint,
  domRect: getDomRectFingerprint,
  fontPreferences: getFontPreferencesFingerprint,
  fonts: getFontsFingerprint,
  forcedColors: getForcedColorsFingerprint,
  hardware: getHardwareFingerprint,
  hardwareConcurrency: getHardwareConcurrencyFingerprint,
  hdr: getHdrFingerprint,
  indexedDB: getIndexedDbFingerprint,
  intl: getIntlFingerprint,
  invertedColors: getInvertedColorsFingerprint,
  languages: getLanguagesFingerprint,
  localStorage: getLocalStorageFingerprint,
  locales: getLocalesFingerprint,
  math: getMathFingerprint,
  mathml: getMathmlFingerprint,
  media: getMediaFingerprint,
  monochrome: getMonochromeFingerprint,
  networkInformation: getNetworkInformationFingerprint,
  openDatabase: getOpenDatabaseFingerprint,
  osCpu: getOsCpuFingerprint,
  pdfViewerEnabled: getPdfViewerEnabledFingerprint,
  permissions: getPermissionsFingerprint,
  platform: getPlatformFingerprint,
  plugins: getPluginsFingerprint,
  privateClickMeasurement: getPrivateClickMeasurementFingerprint,
  reducedMotion: getReducedMotionFingerprint,
  reducedTransparency: getReducedTransparencyFingerprint,
  screen: getScreenFingerprint,
  screenFrame: getScreenFrameFingerprint,
  screenResolution: getScreenResolutionFingerprint,
  sensors: getSensorsFingerprint,
  sessionStorage: getSessionStorageFingerprint,
  speech: getSpeechFingerprint,
  svg: getSvgFingerprint,
  system: getSystemFingerprint,
  timezone: getTimezoneFingerprint,
  touchSupport: getTouchSupportFingerprint,
  userAgent: getUserAgentFingerprint,
  vendor: getVendorFingerprint,
  vendorFlavors: getVendorFlavorsFingerprint,
  webGlBasics: getWebGlBasicsFingerprint,
  webGlExtensions: getWebGlExtensionsFingerprint,
  webgl: getWebglFingerprint,
  webrtc: getWebrtcFingerprint
};
async function getFingerprint(config = {}) {
  const {
    components = Object.keys(componentRegistry),
    hashComposite = false,
    delimiter = "-"
  } = config;
  const results = [];
  for (const id of components) {
    const getter = componentRegistry[id];
    if (!getter) {
      throw new Error(`Unknown fingerprint component: ${id}`);
    }
    results.push(await getter());
  }
  const stableResults = results.filter((result) => !result.unstable);
  const unstableResults = results.filter((result) => result.unstable);
  const unstableMarker = "unstable";
  const stableComposite = stableResults.map((result) => result.hash).join(delimiter);
  const unstableComposite = unstableResults.map((result) => result.hash).join(delimiter);
  const composite = [
    stableComposite,
    ...unstableResults.length > 0 ? [unstableMarker, ...unstableResults.map((result) => result.hash)] : []
  ].filter((part) => part.length > 0).join(delimiter);
  const compositeHash = hashComposite ? await hashSha256(composite) : undefined;
  const stableCompositeHash = hashComposite ? await hashSha256(stableComposite) : undefined;
  const unstableCompositeHash = hashComposite && unstableComposite ? await hashSha256(unstableComposite) : undefined;
  return {
    composite,
    stableComposite,
    unstableComposite,
    compositeHash,
    stableCompositeHash,
    unstableCompositeHash,
    components: Object.fromEntries([...stableResults, ...unstableResults].map((result) => [
      result.id,
      result
    ]))
  };
}
async function fetchServerFingerprint(request) {
  const headers = {
    "content-type": "application/json"
  };
  if (request.apiKey) {
    headers.authorization = `Bearer ${request.apiKey}`;
  }
  const response = await fetch(request.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      client_composite: request.clientComposite,
      delimiter: request.delimiter ?? "-"
    })
  });
  if (!response.ok) {
    throw new Error(`Server responded with ${response.status}.`);
  }
  return await response.json();
}

class OpenClientIdClient {
  #endpoint;
  #apiKey;
  #delimiter;
  constructor(options) {
    this.#endpoint = options.endpoint;
    this.#apiKey = options.apiKey;
    this.#delimiter = options.delimiter ?? "-";
  }
  setApiKey(apiKey) {
    this.#apiKey = apiKey;
  }
  async fetchServerFingerprint(clientComposite) {
    return fetchServerFingerprint({
      endpoint: this.#endpoint,
      clientComposite,
      delimiter: this.#delimiter,
      apiKey: this.#apiKey
    });
  }
  async getFingerprintWithServer(config = {}) {
    return getFingerprintWithServer({
      endpoint: this.#endpoint,
      apiKey: this.#apiKey,
      delimiter: this.#delimiter
    }, config);
  }
}
function appendServerFingerprint(clientComposite, serverHash, delimiter = "-") {
  if (!clientComposite) {
    return serverHash ? [SERVER_MARKER, serverHash].join(delimiter) : "";
  }
  if (!serverHash) {
    return clientComposite;
  }
  return [clientComposite, SERVER_MARKER, serverHash].join(delimiter);
}
async function buildCombinedComposite(client, serverHash, options = {}) {
  const delimiter = options.delimiter ?? "-";
  const combinedComposite = options.combinedComposite ?? appendServerFingerprint(client.composite, serverHash, delimiter);
  const stableCombinedComposite = appendServerFingerprint(client.stableComposite, serverHash, delimiter);
  const hashComposite = options.hashComposite ?? false;
  return {
    combinedComposite,
    combinedCompositeHash: hashComposite ? await hashSha256(combinedComposite) : undefined,
    stableCombinedComposite,
    stableCombinedCompositeHash: hashComposite ? await hashSha256(stableCombinedComposite) : undefined
  };
}
async function getFingerprintWithServer(request, config = {}) {
  const delimiter = request.delimiter ?? config.delimiter ?? "-";
  const hashComposite = config.hashComposite ?? true;
  const client = await getFingerprint({
    ...config,
    delimiter,
    hashComposite
  });
  const server = await fetchServerFingerprint({
    endpoint: request.endpoint,
    clientComposite: client.composite,
    delimiter,
    apiKey: request.apiKey
  });
  const combined = await buildCombinedComposite(client, server.server.hash, {
    delimiter,
    hashComposite,
    combinedComposite: server.combined_composite ?? undefined
  });
  return { client, server, combined };
}
export {
  getFingerprintWithServer,
  getFingerprint,
  fetchServerFingerprint,
  buildCombinedComposite,
  appendServerFingerprint,
  SERVER_MARKER,
  OpenClientIdClient
};


// ---- TrioMark additions (derived from user-provided reference implementations) ----
const TRIOMARK_VERSION = "0.1.0";
const TRIOMARK_REFERENCES = {
  fingerprintjs: "uploaded FingerprintJS v5.x reference",
  openclientid: "uploaded OpenClientID client reference",
  thumbmarkjs: "uploaded ThumbmarkJS reference"
};

const COMPONENT_GROUPS = {
  environment: ["system", "userAgent", "platform", "vendor", "vendorFlavors", "cpuClass", "osCpu", "architecture"],
  locale: ["languages", "locales", "timezone", "dateTimeLocale", "intl"],
  display: ["screen", "screenResolution", "screenFrame", "colorDepth", "colorGamut", "contrast", "forcedColors", "invertedColors", "monochrome", "hdr", "reducedMotion", "reducedTransparency"],
  graphics: ["canvas", "svg", "webgl", "webGlBasics", "webGlExtensions", "domRect", "fontPreferences", "fonts", "mathml"],
  audio: ["audio", "audioBaseLatency", "speech"],
  storage: ["cookiesEnabled", "localStorage", "sessionStorage", "indexedDB", "openDatabase", "pdfViewerEnabled"],
  capability: ["touchSupport", "sensors", "media", "clipboard", "applePay", "privateClickMeasurement"],
  runtime: ["hardware", "hardwareConcurrency", "deviceMemory", "math"],
  pluginPermission: ["plugins", "permissions", "domBlockers"],
  networkLike: ["networkInformation", "webrtc"]
};

function pick(obj, keys) {
  const out = {};
  for (const key of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, key)) {
      out[key] = obj[key];
    }
  }
  return out;
}

function omit(obj, keys) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  const blocked = new Set(keys);
  for (const [k, v] of Object.entries(obj)) {
    if (!blocked.has(k)) out[k] = v;
  }
  return out;
}

function groupComponents(componentMap) {
  const grouped = {};
  const assigned = new Set();
  for (const [groupName, ids] of Object.entries(COMPONENT_GROUPS)) {
    const entries = {};
    for (const id of ids) {
      if (componentMap[id]) {
        entries[id] = componentMap[id];
        assigned.add(id);
      }
    }
    grouped[groupName] = entries;
  }
  const ungrouped = {};
  for (const [id, value] of Object.entries(componentMap)) {
    if (!assigned.has(id)) ungrouped[id] = value;
  }
  grouped.ungrouped = ungrouped;
  return grouped;
}

function selectServerStableData(server) {
  if (!server || typeof server !== 'object') return null;
  return {
    network: pick(server.network ?? {}, [
      'host', 'hostParsed', 'method', 'referer', 'origin'
    ]),
    http: pick(server.http ?? {}, [
      'headerNamesInOrder', 'headerOrderHash', 'headerNameSetHash', 'userAgent', 'accept',
      'acceptEncoding', 'acceptLanguage', 'primaryLanguage', 'languageTags', 'languageWeights',
      'cacheControl', 'pragma', 'upgradeInsecureRequests', 'secFetchSite', 'secFetchMode',
      'secFetchDest', 'secFetchUser', 'dnt', 'secGpc', 'priority', 'cookieNames', 'cookieCount',
      'contentType', 'hasSecFetch', 'hasClientHints'
    ]),
    clientHints: omit(server.clientHints ?? {}, []),
    tls: pick(server.tls ?? {}, [
      'negotiatedProtocol', 'alpnProtocol', 'ja3', 'ja4', 'ja4Prefix', 'ja4CipherHash',
      'ja4ExtensionHash', 'clientHelloVersion', 'cipherSuitesCount', 'cipherSuitesFirst',
      'cipherSuitesLast', 'extensionIds', 'extensionNames', 'extensionCount', 'knownExtensionIds',
      'knownExtensionCount', 'unknownExtensionIds', 'unknownExtensionCount', 'sniFromExtension',
      'servername', 'hostVsSniMatch', 'hostVsServernameMatch', 'servernameVsSniMatch',
      'alpnFromExtension', 'alpnCount', 'alpnHash', 'offeredH2', 'negotiatedH2', 'alpnMismatch',
      'supportedVersions', 'supportedVersionsCount', 'supportedGroups', 'supportedGroupsCount',
      'signatureAlgorithms', 'signatureAlgorithmsCount', 'ecPointFormats', 'ecPointFormatsCount',
      'pskModes', 'keyShareGroupIds', 'keyShareGroupIdsHash', 'paddingLength', 'hasGrease',
      'greaseCipherSuites', 'greaseExtensionIds', 'greaseGroupIds', 'greaseSupportedVersions',
      'greaseKeyShareGroups', 'normalizedCipherSuites', 'normalizedExtensionIds',
      'normalizedSupportedGroups', 'normalizedSupportedVersions', 'normalizedKeyShareGroupIds',
      'cipherSuitesHash', 'extensionIdsHash', 'supportedVersionsHash', 'supportedGroupsHash',
      'signatureAlgorithmsHash', 'ecPointFormatsHash', 'normalizedCipherSuitesHash',
      'normalizedExtensionIdsHash', 'normalizedSupportedGroupsHash', 'normalizedSupportedVersionsHash'
    ])
  };
}

function selectServerSessionData(server) {
  if (!server || typeof server !== 'object') return null;
  return {
    network: pick(server.network ?? {}, [
      'clientIp', 'forwardedForChain', 'proxyHopCount', 'host', 'hostParsed', 'method', 'url',
      'path', 'pathHash', 'queryStringRaw', 'queryStringHash', 'queryParamKeys', 'queryParamKeysHash',
      'queryParamCount', 'referer', 'origin', 'forwardedFor', 'xForwardedProto', 'xForwardedHost',
      'forwarded', 'via'
    ]),
    socket: pick(server.socket ?? {}, [
      'remoteAddress', 'remoteFamily', 'remotePort', 'localAddress', 'localPort', 'encrypted',
      'authorized', 'authorizationError'
    ]),
    http: omit(server.http ?? {}, ['rawHeaders', 'rawTrailers', 'trailers', 'headersDistinct']),
    clientHints: omit(server.clientHints ?? {}, []),
    tls: omit(server.tls ?? {}, ['peerCertificate', 'ephemeralKeyInfo'])
  };
}

async function hashServerProfile(server, mode = 'stable') {
  const selected = mode === 'session' ? selectServerSessionData(server) : selectServerStableData(server);
  if (!selected) return { data: null, hash: null };
  return {
    data: selected,
    hash: await hashSha256(stableStringify(selected))
  };
}

async function fetchExistingServerFingerprint(endpoint = '/fingerprint', fetchOptions = {}) {
  const response = await fetch(endpoint, {
    method: 'GET',
    credentials: fetchOptions.credentials ?? 'same-origin',
    headers: fetchOptions.headers ?? {}
  });
  if (!response.ok) {
    throw new Error(`Server fingerprint endpoint failed: ${response.status}`);
  }
  return await response.json();
}

async function buildTriomarkUnifiedResult(client, server, options = {}) {
  const delimiter = options.delimiter ?? '-';
  const hashComposite = options.hashComposite ?? true;
  const serverStable = await hashServerProfile(server, 'stable');
  const serverSession = await hashServerProfile(server, 'session');
  const stableComposite = appendServerFingerprint(client.stableComposite, serverStable.hash, delimiter);
  const sessionComposite = appendServerFingerprint(client.composite, serverSession.hash, delimiter);
  return {
    serverStableHash: serverStable.hash,
    serverSessionHash: serverSession.hash,
    stableComposite,
    stableCompositeHash: hashComposite ? await hashSha256(stableComposite) : undefined,
    sessionComposite,
    sessionCompositeHash: hashComposite ? await hashSha256(sessionComposite) : undefined,
    serverStableData: serverStable.data,
    serverSessionData: serverSession.data
  };
}

async function collectTriomarkClientOnly(options = {}) {
  const {
    components = Object.keys(componentRegistry),
    hashComposite = true,
    delimiter = '-',
    includeGroupedComponents = true
  } = options;

  const collectedAt = new Date().toISOString();
  const client = await getFingerprint({ components, hashComposite, delimiter });
  const groupedComponents = includeGroupedComponents ? groupComponents(client.components) : undefined;

  return {
    collector: 'triomark',
    version: TRIOMARK_VERSION,
    collectedAt,
    client,
    groupedComponents
  };
}

async function submitTriomarkEvaluation(endpoint = '/api/evaluate', requestBody = {}, fetchOptions = {}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    credentials: fetchOptions.credentials ?? 'same-origin',
    headers: {
      'content-type': 'application/json',
      ...(fetchOptions.headers ?? {})
    },
    body: JSON.stringify(requestBody)
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Evaluation endpoint returned non-JSON response: ${response.status}`);
  }

  if (!response.ok || data?.ok === false) {
    const message = data?.error?.message || `Evaluation endpoint failed: ${response.status}`;
    throw new Error(message);
  }

  return data;
}

async function collectTriomark(options = {}) {
  const {
    components = Object.keys(componentRegistry),
    hashComposite = true,
    delimiter = '-',
    includeServer = true,
    serverEndpoint = '/fingerprint',
    serverFetchOptions = undefined,
    includeGroupedComponents = true
  } = options;

  const collectedAt = new Date().toISOString();
  const client = await getFingerprint({ components, hashComposite, delimiter });
  const groupedComponents = includeGroupedComponents ? groupComponents(client.components) : undefined;

  let server = null;
  let unified = null;
  let serverError = null;

  if (includeServer) {
    try {
      server = await fetchExistingServerFingerprint(serverEndpoint, serverFetchOptions);
      unified = await buildTriomarkUnifiedResult(client, server, { delimiter, hashComposite });
    } catch (error) {
      serverError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    collector: 'triomark',
    version: TRIOMARK_VERSION,
    references: TRIOMARK_REFERENCES,
    collectedAt,
    options: {
      components,
      hashComposite,
      delimiter,
      includeServer,
      serverEndpoint
    },
    client,
    groupedComponents,
    server,
    serverError,
    unified
  };
}

export {
  TRIOMARK_VERSION,
  TRIOMARK_REFERENCES,
  COMPONENT_GROUPS,
  groupComponents,
  selectServerStableData,
  selectServerSessionData,
  hashServerProfile,
  fetchExistingServerFingerprint,
  buildTriomarkUnifiedResult,
  collectTriomarkClientOnly,
  submitTriomarkEvaluation,
  collectTriomark
};
