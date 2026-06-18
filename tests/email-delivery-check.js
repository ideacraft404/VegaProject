const { spawn } = require("child_process");
const { SMTPServer } = require("smtp-server");

const smtpPort = 2525;
const appPort = 8081;

const waitForOutput = (process, text) =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for: ${text}`)), 10000);
    process.stdout.on("data", (chunk) => {
      if (chunk.toString().includes(text)) {
        clearTimeout(timeout);
        resolve();
      }
    });
    process.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Application exited early with code ${code}`));
    });
  });

(async () => {
  let receivedMessage = "";
  const smtpServer = new SMTPServer({
    disabledCommands: ["STARTTLS"],
    onAuth(_auth, _session, callback) {
      callback(null, { user: "test-user" });
    },
    onData(stream, _session, callback) {
      stream.on("data", (chunk) => {
        receivedMessage += chunk.toString();
      });
      stream.on("end", callback);
    },
  });

  await new Promise((resolve, reject) => {
    smtpServer.listen(smtpPort, "127.0.0.1", resolve);
    smtpServer.on("error", reject);
  });

  const app = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(appPort),
      CONTACT_TO: "Swadesh@thevegaforge.com",
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: String(smtpPort),
      SMTP_SECURE: "false",
      SMTP_USER: "test-user",
      SMTP_PASS: "test-password",
      SMTP_FROM: "VEGA Forge <no-reply@vegaforge.test>",
      VEGA_DEV_OUTBOX: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForOutput(app, `http://localhost:${appPort}`);

    const form = new FormData();
    form.append("name", "SMTP Integration Test");
    form.append("email", "founder@example.com");
    form.append("company", "VEGA Test Company");
    form.append("phone", "9999999999");
    form.append("message", "Testing secure SMTP delivery with a verified PDF attachment.");
    form.append(
      "document",
      new Blob(["%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"], {
        type: "application/pdf",
      }),
      "test-document.pdf"
    );

    const response = await fetch(`http://localhost:${appPort}/api/contact`, {
      method: "POST",
      headers: {
        Origin: `http://localhost:${appPort}`,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: form,
    });
    const result = await response.json();

    if (!response.ok || !result.ok || result.delivered !== true) {
      throw new Error(`SMTP delivery failed: ${response.status} ${JSON.stringify(result)}`);
    }

    if (
      !receivedMessage.includes("VEGA Forge contact enquiry") ||
      !receivedMessage.includes("test-document.pdf")
    ) {
      throw new Error("SMTP server did not receive the expected message and attachment.");
    }

    const requiredOnlyForm = new FormData();
    requiredOnlyForm.append("name", "Required Fields Test");
    requiredOnlyForm.append("email", "required@example.com");
    requiredOnlyForm.append("company", "Required Fields Company");
    requiredOnlyForm.append(
      "message",
      "Testing delivery with required fields only and no phone or document."
    );

    const requiredOnlyResponse = await fetch(`http://localhost:${appPort}/api/contact`, {
      method: "POST",
      headers: {
        Origin: `http://localhost:${appPort}`,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: requiredOnlyForm,
    });
    const requiredOnlyResult = await requiredOnlyResponse.json();

    if (
      !requiredOnlyResponse.ok ||
      !requiredOnlyResult.ok ||
      requiredOnlyResult.delivered !== true
    ) {
      throw new Error(
        `Required-only delivery failed: ${requiredOnlyResponse.status} ${JSON.stringify(requiredOnlyResult)}`
      );
    }

    console.log("SMTP delivery check passed with and without an attachment.");
  } finally {
    app.kill("SIGTERM");
    await new Promise((resolve) => smtpServer.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
