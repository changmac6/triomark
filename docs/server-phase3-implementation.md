# Server Phase 3 Implementation

Implemented in this phase:

- modular `src/server/*`
- IP classification fields
- URL/query normalization fields
- structured header parsing
- parsed client hints
- TLS sequence strings
- request body summary parsing
- thin root `server.js`

Compatibility preserved:

- `/healthz`
- `/hello-raw`
- `/fingerprint`
- `/fingerprint/debug`
- static `public/*`
