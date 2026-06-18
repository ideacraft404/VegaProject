# VEGA Forge Landing Page

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:8080`.

## Secure Email Setup

The contact form posts to the Node backend at `/api/contact`. Email credentials stay on the server and are read from environment variables.

Create `.env` from `.env.example`, then set:

```bash
CONTACT_TO=Swadesh@thevegaforge.com
SMTP_HOST=your-smtp-host
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
SMTP_FROM="VEGA Forge <no-reply@vegaforge.in>"
```

For Gmail, use a Google App Password rather than your normal account password. Never commit `.env`; it is excluded by `.gitignore`.

Run production mode:

```bash
npm start
```

Production startup is blocked unless SMTP is configured, preventing deployment with a non-functional contact form.

In development, `npm run dev` sets `VEGA_DEV_OUTBOX=true`. If SMTP is not configured, the form clearly reports test mode and captures submissions in `.submissions/`; it does not claim that an email was delivered.

Security controls include:

- Server-side SMTP credentials
- Same-origin request verification
- Submission rate limiting
- Honeypot bot detection
- Required-field and length validation
- Attachment extension, size, MIME, and content verification
- Content Security Policy and restricted static-file serving

## Verification

```bash
npm run test:responsive
npm run test:email
node --check script.js
node --check server.js
npm audit --omit=dev
```
