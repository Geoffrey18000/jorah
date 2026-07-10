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
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")  // décode d'abord les balises échappées…
    .replace(/<[^>]+>/g, " ")                      // …pour qu'elles soient bien supprimées
    .replace(/&amp;/g, "&")
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

function decodeUrl(u) {
  return u.replace(/&amp;/g, "&").replace(/&#38;/g, "&").replace(/&quot;/g, '"').trim();
}

// Extrait l'URL de l'image de l'article depuis le flux RSS.
function findImage(block) {
  let m = block.match(/<media:content[^>]+url=["']([^"']+)["'][^>]*(?:type=["']image|medium=["']image|\.(?:jpg|jpeg|png|webp))/i);
  if (m) return decodeUrl(m[1]);
  m = block.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i);
  if (m) return decodeUrl(m[1]);
  m = block.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image/i);
  if (m) return decodeUrl(m[1]);
  const unesc = block.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  m = unesc.match(/<img[^>]+src=["']?([^"'>\s]+)/i);
  if (m) {
    let url = decodeUrl(m[1]);
    if (url.startsWith("//")) url = "https:" + url;
    if (url.startsWith("http:")) url = url.replace(/^http:/, "https:"); // évite le mixed-content en HTTPS
    return url;
  }
  return "";
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
    let image = findImage(block);
    if (image.startsWith("http:")) image = image.replace(/^http:/, "https:");
    items.push({ title, link: stripHtml(link), date: date.toISOString(), desc, image, source: feed.name, cat: feed.cat });
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

const LOGO_SVG = `<svg class="logo" width="52" height="52" viewBox="0 0 72 72" fill="none" aria-hidden="true">
        <defs><linearGradient id="lg" x1="20" y1="14" x2="60" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#25C1FF"/><stop offset="1" stop-color="#1F7BF5"/>
        </linearGradient></defs>
        <path d="M33 9 L12 21 L12 45 L33 57" stroke="var(--navy-logo)" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M39 15 L60 27 L60 51 L39 63 L26 55.5" stroke="url(#lg)" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="36.5" cy="35" r="6.5" fill="url(#lg)"/>
        <path d="M36.5 39 L27.5 54.5" stroke="url(#lg)" stroke-width="5" stroke-linecap="round"/>
        <circle cx="26.5" cy="57" r="3.6" fill="url(#lg)"/>
        <path d="M40 37.5 L49 52" stroke="url(#lg)" stroke-width="5" stroke-linecap="round"/>
        <circle cx="50" cy="54" r="3.6" fill="url(#lg)"/>
      </svg>`;

const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 72 72' fill='none'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='20' y1='14' x2='60' y2='60' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%2325C1FF'/%3E%3Cstop offset='1' stop-color='%231F7BF5'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M33 9 L12 21 L12 45 L33 57' stroke='%230B1D3A' stroke-width='7.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M39 15 L60 27 L60 51 L39 63 L26 55.5' stroke='url(%23g)' stroke-width='7.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3Ccircle cx='36.5' cy='35' r='6.5' fill='url(%23g)'/%3E%3Cpath d='M36.5 39 L27.5 54.5' stroke='url(%23g)' stroke-width='5' stroke-linecap='round'/%3E%3Ccircle cx='26.5' cy='57' r='3.6' fill='url(%23g)'/%3E%3Cpath d='M40 37.5 L49 52' stroke='url(%23g)' stroke-width='5' stroke-linecap='round'/%3E%3Ccircle cx='50' cy='54' r='3.6' fill='url(%23g)'/%3E%3C/svg%3E";

function render(items) {
  const cats = [...new Set(items.map(i => i.cat))].sort();
  const updated = new Date().toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });

  const cards = items.map(i => {
    const catClass = esc(i.cat.toLowerCase().replace(/\W/g, ""));
    const thumb = i.image
      ? `<img src="${esc(i.image)}" alt="" loading="lazy" onerror="this.closest('.thumb').classList.add('no-img')">`
      : "";
    return `
    <article class="card" data-cat="${esc(i.cat)}">
      <a class="thumb thumb-${catClass}${i.image ? "" : " no-img"}" href="${esc(i.link)}" target="_blank" rel="noopener" aria-hidden="true" tabindex="-1">
        ${thumb}<span class="thumb-mark">${esc(i.cat)}</span>
      </a>
      <div class="card-body">
        <div class="meta">
          <span class="badge badge-${catClass}">${esc(i.cat)}</span>
          <span class="src">${esc(i.source)}</span>
          <time datetime="${i.date}">${relativeDate(i.date)}</time>
        </div>
        <h2><a href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.title)}</a></h2>
        ${i.desc ? `<p>${esc(i.desc)}</p>` : ""}
      </div>
    </article>`;
  }).join("\n");

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
  .nav { max-width: 1240px; margin: 0 auto; display: flex; align-items: center; gap: 12px; padding: 12px 24px; }
  .brand { display: flex; align-items: center; text-decoration: none; color: var(--ink); }
  .logo-img { height: 46px; width: auto; display: block; }
  @media (prefers-color-scheme: dark) {
    /* Le logo a un fond clair : petit socle blanc arrondi pour qu'il ressorte sur le thème sombre */
    .logo-img { background: #FFFFFF; border-radius: 10px; padding: 4px 8px; height: 54px; }
  }
  .nav .updated-top { margin-left: auto; color: var(--muted); font-size: 0.78rem; text-align: right; }

  .wrap { max-width: 1240px; margin: 0 auto; padding: 38px 24px 72px; }
  .hero h1 { font-size: 1.85rem; font-weight: 700; letter-spacing: -0.02em; line-height: 1.25; }
  .hero .sub { color: var(--muted); font-size: 1rem; margin-top: 8px; }

  .chips { display: flex; flex-wrap: wrap; gap: 9px; margin: 26px 0 30px; }
  .chip { background: var(--card); color: var(--muted); border: 1px solid var(--line); border-radius: 999px;
          padding: 7px 17px; font: 600 0.87rem "Inter", sans-serif; cursor: pointer; transition: all 0.15s; }
  .chip:hover { color: var(--ink); border-color: var(--cyan); }
  .chip.active { background: linear-gradient(90deg, var(--cyan), var(--blue)); border-color: transparent; color: #fff; }

  #feed { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 16px; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; overflow: hidden;
          display: flex; flex-direction: column;
          box-shadow: 0 1px 2px color-mix(in srgb, var(--navy) 5%, transparent);
          transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s; }
  .card:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--cyan) 45%, var(--line));
                box-shadow: 0 10px 28px color-mix(in srgb, var(--navy) 12%, transparent); }
  .thumb { display: block; position: relative; aspect-ratio: 16 / 9; overflow: hidden;
           background: var(--line); }
  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block;
               transition: transform 0.3s ease; }
  .card:hover .thumb img { transform: scale(1.04); }
  .thumb-mark { display: none; }
  /* Visuel de repli quand l'article n'a pas d'image (ou image cassée) */
  .thumb.no-img img { display: none; }
  .thumb.no-img { display: flex; align-items: center; justify-content: center; }
  .thumb.no-img .thumb-mark { display: block; font-family: "Space Grotesk", sans-serif; font-weight: 700;
           font-size: 1.15rem; letter-spacing: 0.06em; text-transform: uppercase; color: #fff; opacity: 0.95; }
  .thumb-ia { background: linear-gradient(135deg, #00B2FF, #2563FF); }
  .thumb-tech { background: linear-gradient(135deg, #2563FF, #0B1D3A); }
  .thumb-sciences { background: linear-gradient(135deg, #10B981, #0B7C63); }
  .card-body { padding: 16px 20px 20px; display: flex; flex-direction: column; }
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
    <a class="brand" href="./" aria-label="Jorah — accueil">
      <img class="logo-img" src="logo.png" alt="Jorah" width="640" height="160">
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
