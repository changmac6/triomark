import { hashJson } from '../utils/hash.js';

const TLS_EXTENSION_NAMES = {
  0: 'server_name',
  5: 'status_request',
  10: 'supported_groups',
  11: 'ec_point_formats',
  13: 'signature_algorithms',
  16: 'alpn',
  18: 'signed_certificate_timestamp',
  21: 'padding',
  23: 'extended_master_secret',
  27: 'compress_certificate',
  35: 'session_ticket',
  41: 'pre_shared_key',
  43: 'supported_versions',
  45: 'psk_key_exchange_modes',
  51: 'key_share',
  65281: 'renegotiation_info'
};

function getExtensionIds(hello) {
  if (!hello?.extensions || !Array.isArray(hello.extensions)) return [];
  return hello.extensions.map((ext) => ext?.id).filter((value) => typeof value === 'number');
}

function getExtensionNames(extensionIds) {
  return extensionIds.map((id) => ({ id, name: TLS_EXTENSION_NAMES[id] || 'unknown' }));
}

function getExtensionMap(hello) {
  const result = {};
  if (!hello?.extensions || !Array.isArray(hello.extensions)) return result;
  for (const ext of hello.extensions) {
    if (!ext || typeof ext.id !== 'number') continue;
    result[String(ext.id)] = ext.data ?? null;
  }
  return result;
}

function isGreaseValue(value) {
  if (typeof value !== 'number') return false;
  const high = (value >> 8) & 0xff;
  const low = value & 0xff;
  return high === low && (low & 0x0f) === 0x0a;
}

function filterGrease(values) {
  if (!Array.isArray(values)) return [];
  return values.filter((value) => !isGreaseValue(value));
}

function splitJa4(ja4) {
  if (!ja4 || typeof ja4 !== 'string') {
    return { ja4Prefix: null, ja4CipherHash: null, ja4ExtensionHash: null };
  }
  const parts = ja4.split('_');
  return {
    ja4Prefix: parts[0] || null,
    ja4CipherHash: parts[1] || null,
    ja4ExtensionHash: parts[2] || null
  };
}

function getArrayCount(value) {
  return Array.isArray(value) ? value.length : 0;
}

function getFirst(value) {
  return Array.isArray(value) && value.length > 0 ? value[0] : null;
}

function getLast(value) {
  return Array.isArray(value) && value.length > 0 ? value[value.length - 1] : null;
}

function safePeerCertificate(socket) {
  try {
    const cert = socket.getPeerCertificate?.(true);
    if (!cert || Object.keys(cert).length === 0) {
      return {
        presented: false,
        subject: null,
        issuer: null,
        validFrom: null,
        validTo: null,
        fingerprint256: null
      };
    }
    return {
      presented: true,
      subject: cert.subject ?? null,
      issuer: cert.issuer ?? null,
      validFrom: cert.valid_from ?? null,
      validTo: cert.valid_to ?? null,
      fingerprint256: cert.fingerprint256 ?? null
    };
  } catch {
    return {
      presented: false,
      subject: null,
      issuer: null,
      validFrom: null,
      validTo: null,
      fingerprint256: null
    };
  }
}

function buildSequence(values) {
  return Array.isArray(values) && values.length > 0 ? values.join('-') : '';
}

export function parseTlsData(req, options = {}) {
  const hello = req.socket.tlsClientHello || null;
  const extensionMap = getExtensionMap(hello);
  const extensionIds = getExtensionIds(hello);
  const extensionNames = getExtensionNames(extensionIds);
  const knownExtensionIds = extensionIds.filter((id) => TLS_EXTENSION_NAMES[id]);
  const unknownExtensionIds = extensionIds.filter((id) => !TLS_EXTENSION_NAMES[id]);
  const alpnFromExtension = extensionMap['16']?.protocols ?? null;
  const sniFromExtension = extensionMap['0']?.serverName ?? null;
  const supportedVersions = extensionMap['43']?.versions ?? null;
  const supportedGroups = extensionMap['10']?.groups ?? null;
  const signatureAlgorithms = extensionMap['13']?.algorithms ?? null;
  const ecPointFormats = extensionMap['11']?.formats ?? null;
  const pskModes = extensionMap['45']?.modes ?? null;
  const keyShare = extensionMap['51']?.entries ?? null;
  const paddingLength = extensionMap['21']?.paddingLength ?? null;
  const keyShareGroupIds = (keyShare || []).map((entry) => entry?.group).filter((value) => typeof value === 'number');
  const greaseCipherSuites = (hello?.cipherSuites || []).filter(isGreaseValue);
  const greaseExtensionIds = extensionIds.filter(isGreaseValue);
  const greaseGroupIds = (supportedGroups || []).filter(isGreaseValue);
  const greaseSupportedVersions = (supportedVersions || []).filter(isGreaseValue);
  const greaseKeyShareGroups = keyShareGroupIds.filter(isGreaseValue);
  const normalizedCipherSuites = filterGrease(hello?.cipherSuites || []);
  const normalizedExtensionIds = filterGrease(extensionIds);
  const normalizedSupportedGroups = filterGrease(supportedGroups || []);
  const normalizedSupportedVersions = filterGrease(supportedVersions || []);
  const normalizedKeyShareGroupIds = filterGrease(keyShareGroupIds);
  const hasGrease = greaseCipherSuites.length > 0 || greaseExtensionIds.length > 0 || greaseGroupIds.length > 0 || greaseSupportedVersions.length > 0 || greaseKeyShareGroups.length > 0;
  const ja4 = hello?.ja4 ?? null;
  const { ja4Prefix, ja4CipherHash, ja4ExtensionHash } = splitJa4(ja4);
  const negotiatedProtocol = req.socket.getProtocol?.() || null;
  const negotiatedAlpn = req.socket.alpnProtocol || null;
  const offeredProtocols = Array.isArray(alpnFromExtension) ? alpnFromExtension : [];
  const hostRaw = req.headers.host ?? null;
  const cipherSuitesSequence = buildSequence(normalizedCipherSuites);
  const extensionSequence = buildSequence(normalizedExtensionIds);
  const supportedGroupsSequence = buildSequence(normalizedSupportedGroups);
  const signatureAlgorithmsSequence = buildSequence(signatureAlgorithms || []);
  return {
    negotiatedProtocol,
    negotiatedCipher: req.socket.getCipher?.() || null,
    ephemeralKeyInfo: req.socket.getEphemeralKeyInfo?.() || null,
    peerCertificate: safePeerCertificate(req.socket),
    servername: req.socket.servername || null,
    alpnProtocol: negotiatedAlpn,
    ja3: hello?.ja3 ?? null,
    ja4,
    ja4Prefix,
    ja4CipherHash,
    ja4ExtensionHash,
    clientHelloVersion: hello?.version ?? null,
    cipherSuites: hello?.cipherSuites ?? null,
    cipherSuitesCount: getArrayCount(hello?.cipherSuites),
    cipherSuitesFirst: getFirst(hello?.cipherSuites),
    cipherSuitesLast: getLast(hello?.cipherSuites),
    compressionMethods: hello?.compressionMethods ?? null,
    extensionIds,
    extensionNames,
    extensionCount: getArrayCount(hello?.extensions),
    extensionsFirst: getFirst(extensionIds),
    extensionsLast: getLast(extensionIds),
    knownExtensionIds,
    knownExtensionCount: knownExtensionIds.length,
    knownExtensionRatio: extensionIds.length ? knownExtensionIds.length / extensionIds.length : null,
    unknownExtensionIds,
    unknownExtensionCount: unknownExtensionIds.length,
    unknownExtensionRatio: extensionIds.length ? unknownExtensionIds.length / extensionIds.length : null,
    sniFromExtension,
    sniLength: typeof sniFromExtension === 'string' ? sniFromExtension.length : 0,
    isSniLocalhost: sniFromExtension === 'localhost',
    alpnFromExtension,
    alpnCount: offeredProtocols.length,
    alpnHash: hashJson(offeredProtocols),
    offeredH2: offeredProtocols.includes('h2'),
    negotiatedH2: negotiatedAlpn === 'h2',
    alpnMismatch: offeredProtocols.length > 0 && negotiatedAlpn !== null && !offeredProtocols.includes(negotiatedAlpn),
    supportedVersions,
    supportedVersionsCount: getArrayCount(supportedVersions),
    supportedGroups,
    supportedGroupsCount: getArrayCount(supportedGroups),
    supportedGroupsFirst: getFirst(supportedGroups),
    supportedGroupsLast: getLast(supportedGroups),
    signatureAlgorithms,
    signatureAlgorithmsCount: getArrayCount(signatureAlgorithms),
    signatureAlgorithmsFirst: getFirst(signatureAlgorithms),
    signatureAlgorithmsLast: getLast(signatureAlgorithms),
    ecPointFormats,
    ecPointFormatsCount: getArrayCount(ecPointFormats),
    pskModes,
    keyShare,
    keyShareCount: getArrayCount(keyShare),
    keyShareGroupIds,
    keyShareGroupIdsHash: hashJson(keyShareGroupIds),
    paddingLength,
    hasGrease,
    greaseCipherSuites,
    greaseExtensionIds,
    greaseGroupIds,
    greaseSupportedVersions,
    greaseKeyShareGroups,
    normalizedCipherSuites,
    normalizedExtensionIds,
    normalizedSupportedGroups,
    normalizedSupportedVersions,
    normalizedKeyShareGroupIds,
    cipherSuitesHash: hashJson(hello?.cipherSuites || []),
    extensionIdsHash: hashJson(extensionIds),
    supportedVersionsHash: hashJson(supportedVersions || []),
    supportedGroupsHash: hashJson(supportedGroups || []),
    signatureAlgorithmsHash: hashJson(signatureAlgorithms || []),
    ecPointFormatsHash: hashJson(ecPointFormats || []),
    normalizedCipherSuitesHash: hashJson(normalizedCipherSuites),
    normalizedExtensionIdsHash: hashJson(normalizedExtensionIds),
    normalizedSupportedGroupsHash: hashJson(normalizedSupportedGroups),
    normalizedSupportedVersionsHash: hashJson(normalizedSupportedVersions),
    cipherSuitesSequence,
    extensionSequence,
    supportedGroupsSequence,
    signatureAlgorithmsSequence,
    tlsFingerprintText: `v=${hello?.version ?? ''}|c=${cipherSuitesSequence}|e=${extensionSequence}|g=${supportedGroupsSequence}|s=${signatureAlgorithmsSequence}`,
    hostRaw,
    rawClientHello: options.debug ? hello : undefined
  };
}
