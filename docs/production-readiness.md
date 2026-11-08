# Higher Folio production readiness

## Decision

Ship the static local-first product only with the encryption-at-rest release and the CI release gate enabled. The product has no backend, payment processing, cloud sync, or server-side recovery path.

## Trust boundaries

| Boundary | Data | Control | Status |
| --- | --- | --- | --- |
| Browser form to rendered invoice | Customer, payment, and bookkeeping text | Text nodes and HTML escaping for dynamic markup | Verified in source review |
| Browser file selection to invoice image | Logo and QR image | PNG/JPEG/WebP allowlist, magic-byte check, 500 KB cap | Verified in source review |
| Browser storage at rest | Bills, contacts, bank/UPI/crypto details | AES-256-GCM vault with per-account password-derived key | Browser unlock/reload verified |
| Static application to network | Application assets | Same-origin CSP and `connect-src 'none'` | Browser console verified |
| Repository to GitHub Pages | Build artifact | Immutable action pins and verification gate before deploy | CI gate configured |

## Release gates

| Gate | Owner | Evidence | Required state |
| --- | --- | --- | --- |
| JavaScript syntax and security invariants | Engineering | `node scripts/verify-production.mjs` | Pass |
| Static analysis | Security engineering | Scheduled and change-triggered CodeQL JavaScript analysis | Pass |
| Secret review | Release owner | Manual review plus repository secret scanning | Pass |
| Browser regression | Engineering | Account unlock, data persistence, invoice/bookkeeping flows at desktop and 390 px | Pass |
| Pages delivery | Release operations | Successful `deploy-pages.yml` run and cache-busted production URL | Pass |
| Header enforcement for regulated use | Hosting owner | Reverse-proxy/CDN configuration | Required before regulated/high-value use |

## RACI

| Workstream | Responsible | Accountable | Consulted | Informed |
| --- | --- | --- | --- | --- |
| Secure client implementation | Application engineer | Product owner | Security reviewer | Business owner |
| Release approval | Release owner | Product owner | Security reviewer | Business owner |
| Hosting/header controls | Hosting owner | Product owner | Security reviewer | Business owner |

## Residual risks

- This is not a multi-user accounting system and has no audit trail, recovery, or tamper-evident server record.
- An unlocked browser or compromised operating-system profile can access visible data.
- Local browser data is device-specific; users should export invoices and maintain their own backup process.
