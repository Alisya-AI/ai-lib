---
id: stripe
display: Stripe
version: 1.0.0
updated: 2026-04-21
language: typescript
slot: payments
requires: []
conflicts_with: []
---

# Stripe Conventions

- Create checkout/payment intents on trusted backend code only; never expose secret keys client-side.
- Verify webhook signatures before parsing events and handle only known event types.
- Make payment side effects idempotent to avoid duplicate fulfillment on retries.
- Persist Stripe object IDs (`session`, `payment_intent`, `customer`) for traceability and reconciliation.
- Return stable error envelopes for payment failures and avoid leaking provider internals to clients.
- Keep Stripe versioning explicit and review API-version upgrades intentionally.
