# Client Phase 2 Implementation

Implemented items:
- upgraded component result schema in bundled `public/triomark.js`
- added 7 new client components:
  - userAgentHighEntropy
  - storageEstimate
  - mediaDevices
  - environment
  - automationSignals
  - webgpu
  - webrtcExtended
- added source layout under `src/client/`
- kept `collectTriomark()` and demo compatibility

Notes:
- the bundled browser file remains `public/triomark.js`
- this phase does not yet refactor every legacy component into `src/client/components/`
- server-side refactor is intentionally deferred to phase 3
