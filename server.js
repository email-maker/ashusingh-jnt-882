require("dotenv").config();
const express = require("express");
const session = require("express-session");
const nodemailer = require("nodemailer");
const path = require("path");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 8080;

/* LOGIN (ID = PASSWORD) */
const HARD_USER = "manikantmahur882";
const HARD_PASS = "manikantmahur882";

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: "stable-session",
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 3600000 } // 1 hour
  })
);

function auth(req, res, next) {
  if (req.session.user) return next();
  return res.redirect("/");
}

/* LOGIN */
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (username === HARD_USER && password === HARD_PASS) {
    req.session.user = HARD_USER;
    return res.json({ success: true });
  }
  res.json({ success: false });
});

/* LOGOUT */
app.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

/* PAGES */
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "public/login.html"))
);

app.get("/launcher", auth, (req, res) =>
  res.sendFile(path.join(__dirname, "public/launcher.html"))
);

/* REAL SPEED CONTROL */
const wait = ms => new Promise(r => setTimeout(r, ms));

/* TRANSPORTER (NO POOL = TRUE CONTROL) */
function createTransporter(email, password) {
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: email, pass: password },
    tls: { rejectUnauthorized: false }
  });
}

/* SEND MAIL — REAL 6–7 SECONDS */
app.post("/send", auth, async (req, res) => {
  try {
    const { senderName, email, password, recipients, subject, message } = req.body;

    const list = recipients
      .split(/[\n,]+/)
      .map(v => v.trim())
      .filter(v => v.includes("@"));

    const transporter = createTransporter(email, password);

    const htmlBody = `
<pre style="font-family:Arial, Segoe UI; font-size:15px; line-height:1.6; white-space:pre-wrap;">
${message}
</pre>
    `;

    let sent = 0;

    /* 2 PARALLEL CHAINS */
    const half = Math.ceil(list.length / 2);
    const batchA = list.slice(0, half);
    const batchB = list.slice(half);

    async function sendBatch(batch) {
      for (const to of batch) {
        try {
          await transporter.sendMail({
            from: `${senderName || "User"} <${email}>`,
            to,
            subject: subject || "",
            html: htmlBody
          });
          sent++;
        } catch {}
        await wait(200); // 🎯 tuned for 6–7 sec
      }
    }

    await Promise.all([
      sendBatch(batchA),
      sendBatch(batchB)
    ]);

    res.json({
      success: true,
      message: `Mail Sent ✔ (${sent}/${list.length})`
    });

  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

app.listen(PORT, () =>
  console.log("Mail server running on port " + PORT)
);
