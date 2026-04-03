# clientmark

Node.js HTTPS server that reads the incoming TLS ClientHello and exposes:

- JA3
- JA4
- SNI
- ALPN
- protocol version
- cipher suites
- extensions
- the raw parsed ClientHello structure

It uses `read-tls-client-hello`, which hooks into Node's HTTPS/TLS server before the handshake completes.

## 1. Copy into WSL

Put this project at:

```bash
/home/chang/projects/clientmark
```

If you downloaded the zip from ChatGPT, unpack it there.

## 2. Install Node.js

Check versions:

```bash
node -v
npm -v
```

Use Node.js 20+ if possible.

## 3. Install dependencies

```bash
cd /home/chang/projects/clientmark
npm install
```

## 4. Generate a local self-signed certificate

```bash
npm run gen-cert
```

This creates:

- `certs/server.crt`
- `certs/server.key`

## 5. Start the HTTPS server

```bash
npm start
```

By default it listens on:

```text
https://0.0.0.0:8443
```

## 6. Test with curl

Basic request:

```bash
curl -k https://127.0.0.1:8443/
```

Raw full ClientHello payload:

```bash
curl -k https://127.0.0.1:8443/hello-raw
```

Health check:

```bash
curl -k https://127.0.0.1:8443/healthz
```

## 7. Endpoints

### `GET /`
Returns a summarized JSON payload including:

- request headers
- client IP
- JA3
- JA4
- SNI
- ALPN
- TLS protocol
- cipher suites
- extensions

### `GET /hello-raw`
Returns the full parsed `tlsClientHello` object.

## 8. Important limitation

This only works when **this Node.js server is the TLS termination point**.

If TLS is terminated before the request reaches Node.js (for example by Cloud Run, a CDN, or a load balancer), Node.js will not see the original ClientHello and therefore cannot compute full JA3/JA4.

## 9. Behind a reverse proxy

If you later put this behind a trusted proxy and want the original client IP from `X-Forwarded-For`:

```bash
TRUST_PROXY=true npm start
```

## 10. Example output keys

The response includes keys like:

- `tls.tlsClientHello.ja3`
- `tls.tlsClientHello.ja4`
- `tls.tlsClientHello.sni`
- `tls.tlsClientHello.alpn`
- `tls.tlsClientHello.cipherSuitesNamed`
- `tls.tlsClientHello.extensionsNamed`

