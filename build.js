// Veille IA & Robotique — générateur de site statique
// Usage : node build.js  → récupère les flux RSS et régénère site/index.html

const fs = require("fs");
const path = require("path");

const FEEDS = [
  { name: "ActuIA",           url: "https://www.actuia.com/feed/",                  cat: "IA" },
  { name: "Journal du Geek",  url: "https://www.journaldugeek.com/tag/ia/feed/",    cat: "IA" },
  { name: "Numerama",         url: "https://www.numerama.com/feed/",                cat: "Tech" },
  { name: "Siècle Digital",   url: "https://siecledigital.fr/feed/",                cat: "Tech" },
  { name: "Clubic",           url: "https://www.clubic.com/feed/rss",               cat: "Tech" },
  { name: "Korben",           url: "https://korben.info/feed",                      cat: "Tech" },
  { name: "Trust My Science", url: "https://trustmyscience.com/feed/",              cat: "Sciences" },
];

const MAX_PER_FEED = 12;
const MAX_TOTAL = 60;

function stripHtml(s) {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#8217;|&rsquo;/g, "’").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pick(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1].trim() : "";
}

function parseFeed(xml, feed) {
  const items = [];
  // RSS 2.0 (<item>) et Atom (<entry>)
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const block of blocks.slice(0, MAX_PER_FEED)) {
    let link = pick(block, "link");
    if (!link || link.startsWith("<")) {
      const alt = block.match(/<link[^>]*href="([^"]+)"/i);
      link = alt ? alt[1] : "";
    }
    const title = stripHtml(pick(block, "title"));
    const dateRaw = pick(block, "pubDate") || pick(block, "published") || pick(block, "updated") || pick(block, "dc:date");
    const descRaw = pick(block, "description") || pick(block, "summary") || pick(block, "content");
    const date = new Date(dateRaw);
    if (!title || !link || isNaN(date)) continue;
    let desc = stripHtml(descRaw);
    if (desc.length > 220) desc = desc.slice(0, 217).trimEnd() + "…";
    items.push({ title, link: stripHtml(link), date: date.toISOString(), desc, source: feed.name, cat: feed.cat });
  }
  return items;
}

async function fetchFeed(feed) {
  try {
    const res = await fetch(feed.url, {
      headers: { "user-agent": "Mozilla/5.0 (VeilleIA/0.1; +https://example.com)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const items = parseFeed(xml, feed);
    console.log(`  ✓ ${feed.name}: ${items.length} articles`);
    return items;
  } catch (e) {
    console.warn(`  ✗ ${feed.name}: ${e.message}`);
    return [];
  }
}

function relativeDate(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.round(diff / 3600000);
  if (h < 1) return "à l’instant";
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "hier" : `il y a ${d} j`;
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function render(items) {
  const cats = [...new Set(items.map(i => i.cat))].sort();
  const updated = new Date().toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });

  const cards = items.map(i => `
    <article class="card" data-cat="${esc(i.cat)}">
      <div class="meta">
        <span class="badge badge-${esc(i.cat.toLowerCase().replace(/\W/g, ""))}">${esc(i.cat)}</span>
        <span class="src">${esc(i.source)}</span>
        <time datetime="${i.date}">${relativeDate(i.date)}</time>
      </div>
      <h2><a href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.title)}</a></h2>
      ${i.desc ? `<p>${esc(i.desc)}</p>` : ""}
    </article>`).join("\n");

  const chips = ["Tout", ...cats].map((c, idx) =>
    `<button class="chip${idx === 0 ? " active" : ""}" data-filter="${esc(c)}">${esc(c)}</button>`).join("\n");

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Jorah — l’essentiel de l’actu IA &amp; tech en français</title>
<meta name="description" content="Jorah agrège l’actualité IA, tech et sciences des meilleures sources françaises, mise à jour automatiquement.">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect x='3' y='3' width='58' height='58' rx='12' fill='%237C4DFF' stroke='%23141216' stroke-width='5'/%3E%3Ctext x='32' y='47' text-anchor='middle' font-family='Arial Black,Arial,sans-serif' font-size='38' font-weight='900' fill='white'%3EJ%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Space+Grotesk:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #F3EFE6; --card: #FFFFFF; --ink: #17141C; --muted: #6E6878;
    --violet: #7C4DFF; --jaune: #FFC933; --vert: #3ECF8E; --shadow: #17141C;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #17141F; --card: #232030; --ink: #F1EDE2; --muted: #9B94A8; --shadow: #000000; }
  }
  * { box-sizing: border-box; margin: 0; }
  body { background: var(--bg); color: var(--ink); font: 16px/1.55 "Space Grotesk", system-ui, sans-serif; }
  .wrap { max-width: 800px; margin: 0 auto; padding: 24px 16px 64px; }
  header { padding: 30px 0 8px; }
  .brand { display: flex; align-items: center; gap: 16px; }
  .logo { flex: none; transform: rotate(-4deg); }
  header h1 { font-family: "Archivo Black", "Space Grotesk", sans-serif; font-size: 2.4rem;
              letter-spacing: 0.02em; text-transform: uppercase; line-height: 1; }
  .tagline { font-size: 1rem; font-weight: 500; margin-top: 6px; }
  .updated { color: var(--muted); font-size: 0.82rem; margin-top: 14px; }
  .chips { display: flex; flex-wrap: wrap; gap: 10px; margin: 22px 0 30px; }
  .chip { background: var(--card); color: var(--ink); border: 2px solid var(--ink); border-radius: 10px;
          padding: 7px 16px; font: 700 0.85rem "Space Grotesk", sans-serif; cursor: pointer;
          box-shadow: 3px 3px 0 var(--shadow); transition: transform 0.1s, box-shadow 0.1s; }
  .chip:hover { transform: translate(-1px, -1px); box-shadow: 4px 4px 0 var(--shadow); }
  .chip.active { background: var(--violet); color: #fff; }
  .card { background: var(--card); border: 2px solid var(--ink); border-radius: 12px;
          padding: 18px 20px; margin-bottom: 18px; box-shadow: 5px 5px 0 var(--shadow);
          transition: transform 0.12s, box-shadow 0.12s; }
  .card:hover { transform: translate(-2px, -2px); box-shadow: 8px 8px 0 var(--shadow); }
  .card h2 { font-size: 1.12rem; line-height: 1.35; margin: 10px 0 6px; font-weight: 700; }
  .card a { color: var(--ink); text-decoration: none; }
  .card a:hover { color: var(--violet); text-decoration: underline; text-decoration-thickness: 2px; }
  .card p { color: var(--muted); font-size: 0.92rem; }
  .meta { display: flex; align-items: center; gap: 10px; font-size: 0.75rem; color: var(--muted); flex-wrap: wrap; }
  .src { font-weight: 700; color: var(--ink); }
  .badge { border: 2px solid var(--ink); border-radius: 7px; padding: 1px 9px; font-weight: 700;
           text-transform: uppercase; letter-spacing: 0.04em; box-shadow: 2px 2px 0 var(--shadow); }
  .badge-ia { background: var(--violet); color: #fff; }
  .badge-tech { background: var(--jaune); color: #17141C; }
  .badge-sciences { background: var(--vert); color: #17141C; }
  footer { color: var(--muted); font-size: 0.85rem; margin-top: 44px; text-align: center; }
  @media (max-width: 480px) {
    header h1 { font-size: 1.8rem; }
    .brand { gap: 12px; }
  }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="brand">
      <svg class="logo" width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
        <rect x="3" y="3" width="58" height="58" rx="12" fill="var(--violet)" stroke="var(--ink)" stroke-width="4"/>
        <text x="32" y="46" text-anchor="middle" font-family="'Archivo Black', 'Arial Black', sans-serif" font-size="36" fill="#fff">J</text>
      </svg>
      <div>
        <h1>Jorah</h1>
        <p class="tagline">L’essentiel de l’actu IA &amp; tech, en français</p>
      </div>
    </div>
    <p class="updated">Mis à jour automatiquement — dernière mise à jour : ${updated}</p>
  </header>
  <nav class="chips">${chips}</nav>
  <main id="feed">
${cards}
  </main>
  <footer>Jorah · Agrégé automatiquement depuis ${FEEDS.length} sources · Prototype</footer>
</div>
<script>
  document.querySelectorAll(".chip").forEach(chip => chip.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    const f = chip.dataset.filter;
    document.querySelectorAll(".card").forEach(card => {
      card.style.display = (f === "Tout" || card.dataset.cat === f) ? "" : "none";
    });
  }));
</script>
</body>
</html>`;
}

(async () => {
  console.log("Récupération des flux…");
  const results = await Promise.all(FEEDS.map(fetchFeed));
  const items = results.flat()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, MAX_TOTAL);
  if (items.length === 0) {
    console.error("Aucun article récupéré — vérifie la connexion réseau.");
    process.exit(1);
  }
  const html = render(items);
  fs.mkdirSync(path.join(__dirname, "site"), { recursive: true });
  const out = path.join(__dirname, "site", "index.html");
  fs.writeFileSync(out, html, "utf8");
  console.log(`\n${items.length} articles → ${out}`);
})();
