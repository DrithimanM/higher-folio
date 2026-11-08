# Security policy

Higher Folio is a local-first static web app. It does not operate a server-side account system and it never sends business, invoice, customer, payment, or bookkeeping data to Higher Folio.

## Data protection model

- The local account password is verified with Argon2id.
- Business, customer, bill, expense, vendor, and active-business records are encrypted in browser storage using AES-256-GCM.
- The encryption key is derived in memory from the account password with PBKDF2-SHA-256 (600,000 iterations) and a per-account random salt. It is not persisted.
- Existing plaintext Higher Folio records are migrated to the encrypted vault after the next successful password unlock. The plaintext copies are removed only after the encrypted vault is written successfully.
- Password recovery is intentionally unavailable. Losing the password means the encrypted local records cannot be recovered.

This protects stored application records against casual inspection of browser storage. It does not protect an unlocked browser session, browser extensions with page access, malware, or a compromised device profile.

## Reporting a vulnerability

Do not open a public issue with sensitive details. Contact the repository owner privately with a concise reproduction, affected release URL or commit, and impact. The owner should acknowledge receipt within seven days and publish a remediation decision or status update within thirty days.

## Hosting boundary

GitHub Pages serves this static application but does not provide repository-controlled HTTP response headers. The app carries a restrictive meta Content Security Policy, referrer policy, and permissions policy. For a deployment that requires HTTP-enforced CSP reporting, HSTS, `X-Content-Type-Options`, and clickjacking protection, place the static site behind a managed reverse proxy/CDN that owns those headers before handling regulated or high-value records.
