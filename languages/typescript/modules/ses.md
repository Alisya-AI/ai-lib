---
id: ses
display: Amazon SES
version: 1.0.0
updated: 2026-04-21
language: typescript
slot: email_provider
requires: []
conflicts_with: [sendgrid, mailgun, postmark]
---

# Amazon SES Conventions

- Keep sender identity/domain verification and mailbox settings managed via infrastructure code.
- Centralize email template rendering and keep transport logic separate from business orchestration.
- Prefer structured template data over raw HTML concatenation.
- Validate recipient/sender inputs and handle bounce/complaint workflows where relevant.
- For critical emails, log message IDs and correlate them with domain events.
- Treat email send failures as recoverable integration failures with explicit retry/error policy.
