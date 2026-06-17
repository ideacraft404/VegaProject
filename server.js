const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

require("dotenv").config({ quiet: true });

const express = require("express");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const multer = require("multer");
const nodemailer = require("nodemailer");

const app = express();
const port = Number(process.env.PORT || 8080);
const contactTo = process.env.CONTACT_TO || "swadesh@gmail.com";
const maxAttachmentBytes = 10 * 1024 * 1024;

const allowedMimeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
  "application/zip",
]);

const allowedExtensions = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx",
  ".png",
  ".jpg",
  ".jpeg",
  ".zip",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: maxAttachmentBytes,
  },
  fileFilter: (_req, file, callback) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (allowedMimeTypes.has(file.mimetype) && allowedExtensions.has(ext)) {
      callback(null, true);
      return;
    }
    callback(new Error("Unsupported document type."));
  },
});

app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});
app.get("/index.html", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});
app.get("/styles.css", (_req, res) => {
  res.sendFile(path.join(__dirname, "styles.css"));
});
app.get("/script.js", (_req, res) => {
  res.sendFile(path.join(__dirname, "script.js"));
});
app.use("/assets", express.static(path.join(__dirname, "assets"), { dotfiles: "deny" }));
app.get("/favicon.ico", (_req, res) => {
  res.status(204).end();
});

app.use(
  "/api/contact",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 8,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

const clean = (value, limit = 1000) =>
  String(value || "")
    .replace(/\0/g, "")
    .trim()
    .slice(0, limit);

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const escapeHtml = (value) =>
  clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const smtpConfigured = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const makeTransporter = () =>
  nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

const saveDevSubmission = async ({ fields, file }) => {
  const outboxDir = path.join(__dirname, ".submissions");
  await fs.promises.mkdir(outboxDir, { recursive: true });
  const id = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const attachmentName = file ? `${id}-${path.basename(file.originalname)}` : null;

  if (file) {
    await fs.promises.writeFile(path.join(outboxDir, attachmentName), file.buffer);
  }

  await fs.promises.writeFile(
    path.join(outboxDir, `${id}.json`),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        to: contactTo,
        fields,
        attachment: attachmentName,
      },
      null,
      2
    )
  );
};

app.post("/api/contact", (req, res) => {
  upload.single("document")(req, res, async (error) => {
    if (error) {
      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? "Attachment must be 10 MB or smaller."
          : error.message || "Unable to upload the document.";
      res.status(400).json({ ok: false, message });
      return;
    }

    const fields = {
      name: clean(req.body.name, 120),
      email: clean(req.body.email, 180),
      company: clean(req.body.company, 180),
      phone: clean(req.body.phone, 60),
      message: clean(req.body.message, 2500),
    };

    if (!fields.name || !fields.email || !fields.message) {
      res.status(400).json({ ok: false, message: "Name, email, and message are required." });
      return;
    }

    if (!isEmail(fields.email)) {
      res.status(400).json({ ok: false, message: "Enter a valid email address." });
      return;
    }

    const text = [
      "New Build with VEGA enquiry",
      "",
      `Name: ${fields.name}`,
      `Email: ${fields.email}`,
      `Company: ${fields.company || "Not provided"}`,
      `Phone: ${fields.phone || "Not provided"}`,
      "",
      "What are you building?",
      fields.message,
    ].join("\n");

    const html = `
      <h2>New Build with VEGA enquiry</h2>
      <p><strong>Name:</strong> ${escapeHtml(fields.name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(fields.email)}</p>
      <p><strong>Company:</strong> ${escapeHtml(fields.company || "Not provided")}</p>
      <p><strong>Phone:</strong> ${escapeHtml(fields.phone || "Not provided")}</p>
      <p><strong>What are you building?</strong></p>
      <p>${escapeHtml(fields.message).replace(/\n/g, "<br>")}</p>
    `;

    try {
      if (smtpConfigured()) {
        await makeTransporter().sendMail({
          to: contactTo,
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          replyTo: fields.email,
          subject: "Build with VEGA enquiry",
          text,
          html,
          attachments: req.file
            ? [
                {
                  filename: path.basename(req.file.originalname),
                  content: req.file.buffer,
                  contentType: req.file.mimetype,
                },
              ]
            : [],
        });

        res.json({ ok: true, message: "Thanks. Your enquiry has been sent securely." });
        return;
      }

      if (process.env.VEGA_DEV_OUTBOX === "true") {
        await saveDevSubmission({ fields, file: req.file });
        res.json({
          ok: true,
          message: "Thanks. Your enquiry was captured in the local development outbox.",
        });
        return;
      }

      res.status(503).json({
        ok: false,
        message: "Email delivery is not configured yet. Please set SMTP environment variables.",
      });
    } catch (sendError) {
      console.error(sendError);
      res.status(500).json({
        ok: false,
        message: "Something went wrong while sending. Please try again.",
      });
    }
  });
});

app.listen(port, () => {
  console.log(`VEGA Forge running at http://localhost:${port}`);
});
