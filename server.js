// Gereksinim: Node.js 18 veya üstü (ek paket gerekmez)
// Çalıştırma: FACEIT_API_KEY=anahtarin node server.js
// Döviz için anahtar gerekmez. ELO için FACEIT_API_KEY gerekir.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.FACEIT_API_KEY;
const NICKNAME = process.env.FACEIT_NICKNAME || "Vortexxx77x";
const CACHE_MS = 30 * 60 * 1000; // 30 dakika

const caches = { elo: { data: null, time: 0 }, fx: { data: null, time: 0 } };

// Önbellekli getirici: 30 dakikadan eskiyse yeniler, hata olursa eski değeri korur
async function cached(name, loader) {
  const c = caches[name];
  if (c.data && Date.now() - c.time < CACHE_MS) return c.data;
  try {
    caches[name] = { data: await loader(), time: Date.now() };
  } catch (err) {
    console.error(name + " hatası:", err.message);
    if (!c.data) throw err;
  }
  return caches[name].data;
}

async function fetchElo() {
  if (!API_KEY) throw new Error("FACEIT_API_KEY tanımlı değil");
  const res = await fetch(
    "https://open.faceit.com/data/v4/players?nickname=" + encodeURIComponent(NICKNAME),
    { headers: { Authorization: "Bearer " + API_KEY } }
  );
  if (!res.ok) throw new Error("FACEIT API hatası: " + res.status);
  const p = await res.json();
  const game = (p.games && (p.games.cs2 || p.games.csgo)) || null;
  if (!game) throw new Error("Oyun verisi bulunamadı");
  return { elo: game.faceit_elo, level: game.skill_level, updated: new Date().toISOString() };
}

// Döviz: anahtarsız iki ücretsiz kaynak, biri çalışmazsa diğeri denenir
async function tryRate(from) {
  try {
    const r = await fetch("https://api.frankfurter.dev/v1/latest?base=" + from + "&symbols=TRY");
    if (!r.ok) throw new Error("frankfurter " + r.status);
    const j = await r.json();
    if (j.rates && j.rates.TRY) return j.rates.TRY;
    throw new Error("frankfurter veri yok");
  } catch (e) {
    const r = await fetch("https://open.er-api.com/v6/latest/" + from);
    if (!r.ok) throw new Error("er-api " + r.status);
    const j = await r.json();
    if (j.rates && j.rates.TRY) return j.rates.TRY;
    throw new Error("er-api veri yok");
  }
}

async function fetchFx() {
  const [usd, eur] = await Promise.all([tryRate("USD"), tryRate("EUR")]);
  return { usd, eur, updated: new Date().toISOString() };
}

function sendJson(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

http
  .createServer(async (req, res) => {
    if (req.url === "/api/elo") {
      try { sendJson(res, 200, await cached("elo", fetchElo)); }
      catch { sendJson(res, 502, { error: "ELO şu an alınamadı" }); }
      return;
    }
    if (req.url === "/api/doviz") {
      try { sendJson(res, 200, await cached("fx", fetchFx)); }
      catch { sendJson(res, 502, { error: "Kurlar şu an alınamadı" }); }
      return;
    }
    fs.readFile(path.join(__dirname, "index.html"), (err, html) => {
      if (err) { res.writeHead(500); return res.end("Hata"); }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    });
  })
  .listen(PORT, () => console.log("Site http://localhost:" + PORT + " adresinde çalışıyor"));
