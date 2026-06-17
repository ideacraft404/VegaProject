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
CONTACT_TO=swadesh@gmail.com
SMTP_HOST=your-smtp-host
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
SMTP_FROM="VEGA Forge <no-reply@vegaforge.in>"
```

Run production mode:

```bash
npm start
```

In development, `npm run dev` sets `VEGA_DEV_OUTBOX=true`, so submissions are captured in `.submissions/` if SMTP is not configured.

## Verification

```bash
npm run test:responsive
node --check script.js
node --check server.js
npm audit --omit=dev
```
