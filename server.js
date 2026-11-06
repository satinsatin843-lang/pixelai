const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
app.use(express.json());

const DAILY_LIMIT = 10; // ek email se roz kitni images
const EMAILS_FILE = path.join(__dirname, "emails.json");
const sessions = new Map(); // token -> email
const usage = new Map();    // email|date -> count

const today = () => new Date().toISOString().slice(0, 10);

function loadEmails() {
  try { return JSON.parse(fs.readFileSync(EMAILS_FILE, "utf8")); } catch (e) { return []; }
}
function saveEmail(email) {
  const list = loadEmails();
  if (!list.includes(email)) {
    list.push(email);
    try { fs.writeFileSync(EMAILS_FILE, JSON.stringify(list, null, 2)); } catch (e) {}
  }
}
function left(email) {
  return Math.max(0, DAILY_LIMIT - (usage.get(email + "|" + today()) || 0));
}

app.post("/api/login", (req, res) => {
  const email = String((req.body && req.body.email) || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return res.status(400).json({ error: "Sahi email daalo." });
  }
  saveEmail(email);
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, email);
  res.json({ token, email, left: left(email) });
});

app.post("/api/generate", async (req, res) => {
  const email = sessions.get(req.get("x-token"));
  if (!email) return res.status(401).json({ error: "Dobara login karo." });

  const prompt = String((req.body && req.body.prompt) || "").trim().slice(0, 300);
  if (!prompt) return res.status(400).json({ error: "Prompt likho." });
  if (left(email) <= 0) {
    return res.status(429).json({ error: "Aaj ki free limit khatam. Kal dobara aao." });
  }

  try {
    const seed = Math.floor(Math.random() * 1e9);
    const url = "https://image.pollinations.ai/prompt/" + encodeURIComponent(prompt) +
      "?width=768&height=768&nologo=true&seed=" + seed;
    const r = await fetch(url);
    if (!r.ok) throw new Error("api " + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    const key = email + "|" + today();
    usage.set(key, (usage.get(key) || 0) + 1);
    res.set("Content-Type", r.headers.get("content-type") || "image/jpeg");
    res.set("x-left", String(left(email)));
    res.send(buf);
  } catch (e) {
    res.status(502).json({ error: "Image nahi ban payi, thodi der baad try karo." });
  }
});

// Aapki email list dekhne ke liye (Render me ADMIN_KEY set karo)
app.get("/api/emails", (req, res) => {
  if (!process.env.ADMIN_KEY || req.query.key !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: "no" });
  }
  res.json(loadEmails());
});

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("PixelAI chal raha hai, port " + PORT));
