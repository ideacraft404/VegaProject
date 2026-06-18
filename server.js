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
const contactTo = process.env.CONTACT_TO || "Swadesh@thevegaforge.com";
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
    if (allowedExtensions.has(ext)) {
      callback(null, true);
      return;
    }
    callback(new Error("Unsupported document type."));
  },
});

app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "https://fonts.googleapis.com"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
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

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      ok: false,
      message: "Too many submissions. Please wait 15 minutes and try again.",
    });
  },
});

app.get("/api/contact/status", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    ok: true,
    emailConfigured: smtpConfigured(),
    developmentOutbox: !smtpConfigured() && process.env.VEGA_DEV_OUTBOX === "true",
  });
});

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

const validateAttachmentContents = async (file) => {
  if (!file) return;

  const ext = path.extname(file.originalname || "").toLowerCase();
  const { fileTypeFromBuffer } = await import("file-type");
  const detected = await fileTypeFromBuffer(file.buffer);

  if (!detected) {
    throw new Error("The attachment could not be verified.");
  }

  const detectedMime = detected.mime;
  const isOpenXml =
    detectedMime === "application/zip" && [".docx", ".pptx", ".xlsx", ".zip"].includes(ext);
  const isLegacyOffice =
    detectedMime === "application/x-cfb" && [".doc", ".ppt", ".xls"].includes(ext);
  const isDirectMatch = allowedMimeTypes.has(detectedMime) && file.mimetype === detectedMime;
  const isBrowserOctetStream =
    allowedMimeTypes.has(detectedMime) && file.mimetype === "application/octet-stream";

  if (!isOpenXml && !isLegacyOffice && !isDirectMatch && !isBrowserOctetStream) {
    throw new Error("The attachment contents do not match the selected file type.");
  }
};

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

app.post("/api/contact", contactLimiter, (req, res) => {
  const origin = req.get("origin");
  const requestedWith = req.get("x-requested-with");
  const expectedOrigin = `${req.protocol}://${req.get("host")}`;

  if ((origin && origin !== expectedOrigin) || requestedWith !== "XMLHttpRequest") {
    res.status(403).json({ ok: false, message: "The form request could not be verified." });
    return;
  }

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
      website: clean(req.body.website, 200),
    };

    if (fields.website) {
      res.status(400).json({ ok: false, message: "The form submission was rejected." });
      return;
    }

    if (!fields.name || !fields.email || !fields.company || !fields.message) {
      res.status(400).json({
        ok: false,
        message: "Name, work email, organisation, and project summary are required.",
      });
      return;
    }

    if (!isEmail(fields.email)) {
      res.status(400).json({ ok: false, message: "Enter a valid email address." });
      return;
    }

    if (fields.message.length < 20) {
      res.status(400).json({
        ok: false,
        message: "Please provide at least 20 characters about what you are building.",
      });
      return;
    }

    const text = [
      "New VEGA Forge contact enquiry",
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
      <h2>New VEGA Forge contact enquiry</h2>
      <p><strong>Name:</strong> ${escapeHtml(fields.name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(fields.email)}</p>
      <p><strong>Company:</strong> ${escapeHtml(fields.company || "Not provided")}</p>
      <p><strong>Phone:</strong> ${escapeHtml(fields.phone || "Not provided")}</p>
      <p><strong>What are you building?</strong></p>
      <p>${escapeHtml(fields.message).replace(/\n/g, "<br>")}</p>
    `;

    try {
      await validateAttachmentContents(req.file);
    } catch (validationError) {
      res.status(400).json({
        ok: false,
        message: validationError.message || "The attachment could not be verified.",
      });
      return;
    }

    try {
      if (smtpConfigured()) {
        const result = await makeTransporter().sendMail({
          to: contactTo,
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          replyTo: fields.email,
          subject: "VEGA Forge contact enquiry",
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

        if (!result.accepted?.length) {
          throw new Error("The mail provider did not accept the message.");
        }

        res.json({
          ok: true,
          delivered: true,
          message: "Thank you. Your enquiry has been delivered securely.",
        });
        return;
      }

      if (process.env.VEGA_DEV_OUTBOX === "true") {
        await saveDevSubmission({ fields, file: req.file });
        res.status(202).json({
          ok: true,
          delivered: false,
          message: "Thank you. Your enquiry has been received.",
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

if (process.env.NODE_ENV === "production" && !smtpConfigured()) {
  console.error("SMTP configuration is required in production.");
  process.exit(1);
}

app.listen(port, () => {
  console.log(`VEGA Forge running at http://localhost:${port}`);
});
