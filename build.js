// Jorah — générateur de site statique
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

// ---------- Récupération et parsing RSS ----------

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
      headers: { "user-agent": "Mozilla/5.0 (Jorah/1.0; +https://jorah.fr)" },
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

// ---------- Identité visuelle ----------
// Palette : navy #0B1D3A · cyan #00B2FF · bleu #2563FF · blanc #FFFFFF · gris #F2F4F7
// Typo : Space Grotesk (titres) · Inter (texte)
// Logo : double hexagone navy/cyan avec nœud de circuit

const LOGO_SVG = `<svg class="logo" width="40" height="40" viewBox="0 0 72 72" fill="none" aria-hidden="true">
        <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#00B2FF"/><stop offset="1" stop-color="#2563FF"/>
        </linearGradient></defs>
        <path d="M30 8 L11 19 L11 41 L30 52" stroke="var(--navy-logo)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M42 20 L61 31 L61 53 L42 64 L23 53 L23 42" stroke="url(#lg)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="42" cy="42" r="6" fill="url(#lg)"/>
        <path d="M42 42 L42 58" stroke="url(#lg)" stroke-width="5" stroke-linecap="round"/>
      </svg>`;

const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 72 72' fill='none'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%2300B2FF'/%3E%3Cstop offset='1' stop-color='%232563FF'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M30 8 L11 19 L11 41 L30 52' stroke='%230B1D3A' stroke-width='7' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M42 20 L61 31 L61 53 L42 64 L23 53 L23 42' stroke='url(%23g)' stroke-width='7' stroke-linecap='round' stroke-linejoin='round'/%3E%3Ccircle cx='42' cy='42' r='6' fill='url(%23g)'/%3E%3Cpath d='M42 42 L42 58' stroke='url(%23g)' stroke-width='5' stroke-linecap='round'/%3E%3C/svg%3E";

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
<link rel="icon" href="${FAVICON}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root {
    --navy: #0B1D3A; --cyan: #00B2FF; --blue: #2563FF;
    --bg: #F2F4F7; --card: #FFFFFF; --ink: #0B1D3A; --muted: #5A6B85; --line: #E2E8F2;
    --navy-logo: #0B1D3A;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #081426; --card: #0F2138; --ink: #EAF1FA; --muted: #8CA0BC; --line: #1D3556;
            --navy-logo: #EAF1FA; }
  }
  * { box-sizing: border-box; margin: 0; }
  body { background: var(--bg); color: var(--ink); font: 16px/1.6 "Inter", system-ui, sans-serif; }
  h1, h2, .brand-name { font-family: "Space Grotesk", "Inter", sans-serif; }

  .site-header { position: sticky; top: 0; z-index: 50; border-bottom: 1px solid var(--line);
                 background: color-mix(in srgb, var(--card) 85%, transparent);
                 -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); }
  .nav { max-width: 820px; margin: 0 auto; display: flex; align-items: center; gap: 12px; padding: 12px 20px; }
  .brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--ink); }
  .brand-name { font-size: 1.45rem; font-weight: 700; letter-spacing: -0.02em; }
  .nav .updated-top { margin-left: auto; color: var(--muted); font-size: 0.78rem; text-align: right; }

  .wrap { max-width: 820px; margin: 0 auto; padding: 38px 20px 72px; }
  .hero h1 { font-size: 1.85rem; font-weight: 700; letter-spacing: -0.02em; line-height: 1.25; }
  .hero .sub { color: var(--muted); font-size: 1rem; margin-top: 8px; }

  .chips { display: flex; flex-wrap: wrap; gap: 9px; margin: 26px 0 30px; }
  .chip { background: var(--card); color: var(--muted); border: 1px solid var(--line); border-radius: 999px;
          padding: 7px 17px; font: 600 0.87rem "Inter", sans-serif; cursor: pointer; transition: all 0.15s; }
  .chip:hover { color: var(--ink); border-color: var(--cyan); }
  .chip.active { background: linear-gradient(90deg, var(--cyan), var(--blue)); border-color: transparent; color: #fff; }

  .card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 20px 22px;
          margin-bottom: 14px; box-shadow: 0 1px 2px color-mix(in srgb, var(--navy) 5%, transparent);
          transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s; }
  .card:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--cyan) 45%, var(--line));
                box-shadow: 0 10px 28px color-mix(in srgb, var(--navy) 12%, transparent); }
  .card h2 { font-size: 1.08rem; line-height: 1.4; margin: 9px 0 6px; font-weight: 600; }
  .card a { color: var(--ink); text-decoration: none; }
  .card a:hover { color: var(--blue); }
  .card p { color: var(--muted); font-size: 0.92rem; }
  .meta { display: flex; align-items: center; gap: 10px; font-size: 0.76rem; color: var(--muted); flex-wrap: wrap; }
  .src { font-weight: 600; }
  .badge { border-radius: 999px; padding: 3px 11px; font-weight: 600; font-size: 0.71rem;
           text-transform: uppercase; letter-spacing: 0.04em; }
  .badge-ia { background: color-mix(in srgb, var(--cyan) 13%, transparent); color: color-mix(in srgb, var(--cyan) 70%, var(--ink)); }
  .badge-tech { background: color-mix(in srgb, var(--blue) 11%, transparent); color: color-mix(in srgb, var(--blue) 75%, var(--ink)); }
  .badge-sciences { background: color-mix(in srgb, var(--navy) 9%, transparent); color: color-mix(in srgb, var(--navy) 60%, var(--muted)); }
  @media (prefers-color-scheme: dark) {
    .badge-ia { color: var(--cyan); }
    .badge-tech { color: #7EA4FF; }
    .badge-sciences { background: color-mix(in srgb, #FFFFFF 8%, transparent); color: var(--muted); }
  }

  footer { color: var(--muted); font-size: 0.85rem; margin-top: 48px; text-align: center; }
  @media (max-width: 480px) {
    .hero h1 { font-size: 1.5rem; }
    .nav .updated-top { display: none; }
  }
</style>
</head>
<body>
<header class="site-header">
  <nav class="nav">
    <a class="brand" href="./">
      ${LOGO_SVG}
      <span class="brand-name">Jorah</span>
    </a>
    <span class="updated-top">Mis à jour automatiquement<br>${updated}</span>
  </nav>
</header>
<div class="wrap">
  <section class="hero">
    <h1>L’essentiel de l’actu IA &amp; tech, en français</h1>
    <p class="sub">Les dernières actualités de ${FEEDS.length} sources françaises de référence, réunies en un seul endroit.</p>
  </section>
  <nav class="chips">${chips}</nav>
  <main id="feed">
${cards}
  </main>
  <footer>Jorah · L’actu IA &amp; tech agrégée automatiquement depuis ${FEEDS.length} sources françaises</footer>
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

// ---------- Génération ----------

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
  const siteDir = path.join(__dirname, "site");
  fs.mkdirSync(siteDir, { recursive: true });
  // Nettoyage des anciennes pages multi-sections
  for (const f of ["outils.html", "guides.html", "comparatifs.html", "blog.html"]) {
    try { fs.unlinkSync(path.join(siteDir, f)); } catch {}
  }
  fs.writeFileSync(path.join(siteDir, "index.html"), render(items), "utf8");
  console.log(`\n${items.length} articles → site/index.html`);
})();
