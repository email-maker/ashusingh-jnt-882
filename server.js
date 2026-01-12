import express from "express";
import nodemailer from "nodemailer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

/* ROOT */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

/* ===== CONFIG (SPEED SAME / FAST) ===== */
const HOURLY_LIMIT = 28;
const PARALLEL = 3;     // FAST (same as before)
const DELAY_MS = 120;  // FAST (same as before)

/* IN-MEMORY STATS */
let stats = {};

/* 🔁 AUTO RESET EVERY 1 HOUR */
setInterval(() => {
  stats = {};
  console.log("🧹 Hourly reset → stats cleared");
}, 60 * 60 * 1000);

/* ===== CONTENT SAFETY ===== */
function normalizeSubject(s) {
  return s
    .replace(/\s{2,}/g, " ")
    .replace(/([!?])\1+/g, "$1")
    .trim();
}

function normalizeBody(text) {
  let t = text
    .replace(/\r\n/g, "\n")
    .replace(/\s{3,}/g, "\n\n")
    .trim();

  // Soften keyword-only lines (report / price)
  const soften = [
    ["report", "the report details are shared below"],
    ["price", "the pricing details are included below"]
  ];

  soften.forEach(([w, snt]) => {
    const re = new RegExp(`(^|\\n)\\s*${w}\\s*(?=\\n|$)`, "gi");
    t = t.replace(re, `$1${snt}`);
  });

  return t;
}

/* ===== SAFE SEND (FAST, SAME SPEED) ===== */
async function sendSafely(transporter, mails) {
  let sent = 0;

  for (let i = 0; i < mails.length; i += PARALLEL) {
    const batch = mails.slice(i, i + PARALLEL);

    const results = await Promise.allSettled(
      batch.map(m => transporter.sendMail(m))
    );

    results.forEach(r => {
      if (r.status === "fulfilled") sent++;
    });

    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  return sent;
}

/* ===== SEND API ===== */
app.post("/send", async (req, res) => {
  const { senderName, gmail, apppass, to, subject, message } = req.body;

  if (!gmail || !apppass || !to || !subject || !message) {
    return res.json({ success: false, msg: "Missing Fields ❌", count: 0 });
  }

  if (!stats[gmail]) stats[gmail] = { count: 0 };
  if (stats[gmail].count >= HOURLY_LIMIT) {
    return res.json({
      success: false,
      msg: "Hourly Limit Reached ❌",
      count: stats[gmail].count
    });
  }

  const recipients = to
    .split(/,|\r?\n/)
    .map(r => r.trim())
    .filter(r => r.includes("@"));

  const remaining = HOURLY_LIMIT - stats[gmail].count;
  if (recipients.length > remaining) {
    return res.json({
      success: false,
      msg: "Mail Limit Full ❌",
      count: stats[gmail].count
    });
  }

  const finalSubject = normalizeSubject(subject);
  const finalText =
    normalizeBody(message) +
    "\n\nScanned & secured";

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: gmail, pass: apppass }
  });

  try {
    await transporter.verify();
  } catch {
    return res.json({
      success: false,
      msg: "Wrong App Password ❌",
      count: stats[gmail].count
    });
  }

  const mails = recipients.map(r => ({
    from: `"${senderName}" <${gmail}>`,
    to: r,
    subject: finalSubject,
    text: finalText,
    replyTo: gmail
  }));

  const sentCount = await sendSafely(transporter, mails);
  stats[gmail].count += sentCount;

  return res.json({
    success: true,
    sent: sentCount,
    count: stats[gmail].count
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("✅ Safe Mail Server running on port", PORT);
});
