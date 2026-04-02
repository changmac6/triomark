# Schema and Field Spec v1

## Top-level shape

```json
{
  "meta": {},
  "client": {},
  "server": {},
  "derived": {}
}
```

## meta

- `collector`
- `version`
- `schemaVersion`
- `collectedAt`
- `page.href`
- `page.origin`
- `page.protocol`
- `page.host`
- `page.pathname`
- `timing.clientCollectMs`
- `timing.serverCollectMs`
- `timing.totalMs`
- `errors.client[]`
- `errors.server[]`

## client

### client.summary
- `componentCount`
- `stableComponentCount`
- `semiStableComponentCount`
- `volatileComponentCount`
- `supportedComponentCount`
- `unsupportedComponentCount`
- `errorComponentCount`
- `timeoutComponentCount`

### client.components[*]
- `id`
- `status` = `ok | unsupported | error | timeout`
- `stability` = `stable | semi_stable | volatile`
- `durationMs`
- `value`
- `hash`
- `error`

### client.groups
- `environment`
- `locale`
- `display`
- `graphics`
- `audio`
- `storage`
- `capability`
- `runtime`
- `pluginPermission`
- `networkLike`
- `ungrouped`

### client.composites
- `stableComposite`
- `semiStableComposite`
- `volatileComposite`
- `sessionComposite`
- `stableCompositeHash`
- `sessionCompositeHash`

## Frontend additions in this implementation

- `userAgentHighEntropy`
- `storageEstimate`
- `mediaDevices`
- `environment`
- `automationSignals`
- `webgpu`
- `webrtcExtended`

## server

### server.network
- `clientIp`
- `ipVersion`
- `isPrivateIp`
- `isLoopbackIp`
- `isReservedIp`
- `forwardedForChain`
- `forwardedChainHash`
- `proxyHopCount`
- `host`
- `hostParsed`
- `method`
- `url`
- `path`
- `pathHash`
- `pathSegments`
- `pathDepth`
- `queryStringRaw`
- `queryStringHash`
- `queryParamKeys`
- `sortedQueryParamKeys`
- `sortedQueryParamKeysHash`
- `queryParamEntries`
- `queryParamCount`
- `referer`
- `origin`
- `forwarded`
- `via`

### server.socket
- `remoteAddress`
- `remoteFamily`
- `remotePort`
- `localAddress`
- `localPort`
- `encrypted`
- `authorized`
- `authorizationError`

### server.http
- existing raw request fields retained
- `duplicateHeaderNames`
- `headerCasingSummary`
- `acceptParsed`
- `acceptEncodingParsed`
- `acceptLanguageParsed`
- `contentTypeParsed`

### server.clientHints
- existing raw client-hint fields retained
- `secChUaParsed`
- `secChUaFullVersionListParsed`
- `brandsNormalized`
- `platformNormalized`

### server.tls
- existing JA3 / JA4 / SNI / ALPN / cipher / extension fields retained
- `cipherSuitesSequence`
- `extensionSequence`
- `supportedGroupsSequence`
- `signatureAlgorithmsSequence`
- `tlsFingerprintText`

### server.body
- `bodyPresent`
- `bodyByteLength`
- `bodySha256`
- `bodyPreview`
- `jsonParsed`
- `jsonParseError`

## derived

### derived.client
- `stableComponentIds`
- `semiStableComponentIds`
- `volatileComponentIds`
- `stableComponentHashes`
- `semiStableComponentHashes`
- `volatileComponentHashes`

### derived.server
- `headerSequenceText`
- `tlsSequenceText`
- `normalizedClientHintsText`

### derived.combined
- `clientStableComposite`
- `clientSessionComposite`
- `serverStableComposite`
- `serverSessionComposite`
- `combinedStableComposite`
- `combinedSessionComposite`
