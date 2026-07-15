// Jorah — générateur de site statique
// Usage : node build.js
//   • récupère les flux RSS → page d'accueil (actus)
//   • lit content/guides/*.md → section Guides (articles originaux)

const fs = require("fs");
const path = require("path");

const FEEDS = [
  { name: "ActuIA",             url: "https://www.actuia.com/feed/",                  cat: "IA" },
  { name: "Journal du Geek",    url: "https://www.journaldugeek.com/tag/ia/feed/",    cat: "IA" },
  { name: "Numerama",           url: "https://www.numerama.com/feed/",                cat: "Tech" },
  { name: "Siècle Digital",     url: "https://siecledigital.fr/feed/",                cat: "Tech" },
  { name: "Clubic",             url: "https://www.clubic.com/feed/rss",               cat: "Tech" },
  { name: "Korben",             url: "https://korben.info/feed",                      cat: "Tech" },
  { name: "Trust My Science",   url: "https://trustmyscience.com/feed/",              cat: "Sciences" },
  { name: "Auto-Moto",          url: "https://www.auto-moto.com/feed",                cat: "Automobile" },
  { name: "Automobile Propre",  url: "https://www.automobile-propre.com/feed/",       cat: "Automobile" },
  { name: "Numerama Vroom",     url: "https://www.numerama.com/vroom/feed/",          cat: "Automobile" },
  { name: "Génération Robots",  url: "https://www.generationrobots.com/blog/fr/feed/", cat: "Robotique" },
  { name: "Numerama Robotique", url: "https://www.numerama.com/tag/robot/feed/",      cat: "Robotique" },
];

const MAX_PER_FEED = 15;   // articles récupérés par flux
const PER_CAT = 15;        // articles conservés par catégorie (garantit que chaque filtre a du contenu)

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

function frDate(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function catClass(cat) {
  return esc(cat.toLowerCase().replace(/\W/g, ""));
}

// ---------- Couvertures graphiques des guides (SVG généré) ----------

const GRADIENTS = {
  ia:         ["#00B2FF", "#2563FF"],
  tech:       ["#2563FF", "#0B1D3A"],
  sciences:   ["#10B981", "#0B7C63"],
  automobile: ["#FF8A3D", "#D64E0A"],
  robotique:  ["#A78BFA", "#6D28D9"],
};

function hexPoints(cx, cy, r) {
  const p = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    p.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return p.join(" ");
}

// Couverture d'article : dégradé de la catégorie + hexagones (rappel du logo)
// + nœuds de circuit + l'emoji du sujet dans une pastille translucide.
function coverSvg(catCls, emoji, uid) {
  const [c1, c2] = GRADIENTS[catCls] || GRADIENTS.ia;
  const id = String(uid).replace(/\W/g, "");
  return `<svg class="cover-svg" viewBox="0 0 1200 500" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
  <defs>
    <linearGradient id="cg-${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
    </linearGradient>
    <radialGradient id="gl-${id}" cx="0.5" cy="0.5" r="0.55">
      <stop offset="0" stop-color="#fff" stop-opacity="0.30"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="500" fill="url(#cg-${id})"/>
  <g fill="none" stroke="#fff" stroke-opacity="0.13" stroke-width="2.5" stroke-linejoin="round">
    <polygon points="${hexPoints(1065, 60, 155)}"/>
    <polygon points="${hexPoints(1155, 385, 105)}"/>
    <polygon points="${hexPoints(85, 445, 165)}"/>
    <polygon points="${hexPoints(35, 85, 95)}"/>
  </g>
  <g stroke="#fff" stroke-opacity="0.28" stroke-width="3" fill="#fff" fill-opacity="0.6">
    <line x1="205" y1="120" x2="335" y2="120"/><line x1="335" y1="120" x2="335" y2="215"/>
    <circle cx="205" cy="120" r="7"/><circle cx="335" cy="215" r="9"/>
    <line x1="995" y1="405" x2="900" y2="405"/><line x1="900" y1="405" x2="900" y2="315"/>
    <circle cx="995" cy="405" r="7"/><circle cx="900" cy="315" r="9"/>
  </g>
  <rect width="1200" height="500" fill="url(#gl-${id})"/>
  <circle cx="600" cy="250" r="100" fill="#fff" fill-opacity="0.16"/>
  <circle cx="600" cy="250" r="100" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="3"/>
  <text x="600" y="250" font-size="120" text-anchor="middle" dominant-baseline="central">${esc(emoji)}</text>
</svg>`;
}

// Couverture d'un guide : le visuel fourni s'il existe, sinon le SVG de marque.
function coverHtml(g, base, uidPrefix) {
  if (g.coverImage) {
    return `<img class="cover-img" src="${base}covers/${encodeURIComponent(g.coverImage)}" alt="${esc(g.title)}" loading="lazy">`;
  }
  return coverSvg(catClass(g.category), g.cover, `${uidPrefix}-${g.slug}`);
}

// ---------- Guides : lecture markdown ----------

function parseFrontmatter(raw) {
  const m = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const mm = line.match(/^(\w+):\s*(.*)$/);
    if (mm) meta[mm[1]] = mm[2].trim();
  }
  return { meta, body: m[2] };
}

function inlineMd(s) {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

// Mini-parseur markdown : titres (##, ###), paragraphes, listes (-), citations (>),
// gras (**), liens [texte](url). Suffisant pour rédiger des guides.
function mdToHtml(md) {
  const out = [];
  let para = [], list = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${inlineMd(para.join(" "))}</p>`); para = []; } };
  const flushList = () => { if (list.length) { out.push(`<ul>${list.map(li => `<li>${inlineMd(li)}</li>`).join("")}</ul>`); list = []; } };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (/^### /.test(line)) { flushPara(); flushList(); out.push(`<h3>${inlineMd(line.slice(4))}</h3>`); }
    else if (/^## /.test(line)) { flushPara(); flushList(); out.push(`<h2>${inlineMd(line.slice(3))}</h2>`); }
    else if (/^> /.test(line)) { flushPara(); flushList(); out.push(`<blockquote>${inlineMd(line.slice(2))}</blockquote>`); }
    else if (/^- /.test(line)) { flushPara(); list.push(line.slice(2)); }
    else if (line.trim() === "") { flushPara(); flushList(); }
    else { flushList(); para.push(line); }
  }
  flushPara(); flushList();
  return out.join("\n");
}

function loadGuides() {
  const dir = path.join(__dirname, "content", "guides");
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith(".md")); } catch { return []; }
  // Visuels de couverture fournis : content/guides/covers/<nom>.(jpg|png|webp)
  let coverFiles = [];
  try { coverFiles = fs.readdirSync(path.join(dir, "covers")).filter(f => /\.(jpe?g|png|webp|avif)$/i.test(f)); } catch {}
  const guides = files.map(file => {
    const raw = fs.readFileSync(path.join(dir, file), "utf8");
    const { meta, body } = parseFrontmatter(raw);
    const bodyHtml = mdToHtml(body);
    const words = body.split(/\s+/).filter(Boolean).length;
    const slug = file.replace(/\.md$/, "");
    // Priorité au champ « image » du frontmatter, sinon un fichier nommé comme le slug.
    const coverImage = meta.image || coverFiles.find(f => f.replace(/\.[^.]+$/, "") === slug) || "";
    return {
      slug,
      title: meta.title || "Sans titre",
      category: meta.category || "IA",
      date: meta.date || new Date().toISOString().slice(0, 10),
      cover: meta.cover || "✨",
      coverImage,
      excerpt: meta.excerpt || "",
      readingTime: Math.max(1, Math.round(words / 200)),
      bodyHtml,
    };
  });
  guides.sort((a, b) => new Date(b.date) - new Date(a.date));
  return guides;
}

// ---------- Identité visuelle ----------

const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 72 72' fill='none'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='20' y1='14' x2='60' y2='60' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%2325C1FF'/%3E%3Cstop offset='1' stop-color='%231F7BF5'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M33 9 L12 21 L12 45 L33 57' stroke='%230B1D3A' stroke-width='7.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M39 15 L60 27 L60 51 L39 63 L26 55.5' stroke='url(%23g)' stroke-width='7.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3Ccircle cx='36.5' cy='35' r='6.5' fill='url(%23g)'/%3E%3Cpath d='M36.5 39 L27.5 54.5' stroke='url(%23g)' stroke-width='5' stroke-linecap='round'/%3E%3Ccircle cx='26.5' cy='57' r='3.6' fill='url(%23g)'/%3E%3Cpath d='M40 37.5 L49 52' stroke='url(%23g)' stroke-width='5' stroke-linecap='round'/%3E%3Ccircle cx='50' cy='54' r='3.6' fill='url(%23g)'/%3E%3C/svg%3E";

const STYLES = `
  :root {
    --navy: #0B1D3A; --cyan: #00B2FF; --blue: #2563FF;
    --bg: #F2F4F7; --card: #FFFFFF; --ink: #0B1D3A; --muted: #5A6B85; --line: #E2E8F2;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #081426; --card: #0F2138; --ink: #EAF1FA; --muted: #8CA0BC; --line: #1D3556; }
  }
  * { box-sizing: border-box; margin: 0; }
  html { scroll-behavior: smooth; }
  body { background: var(--bg); color: var(--ink); font: 16px/1.6 "Inter", system-ui, sans-serif; }
  h1, h2, h3 { font-family: "Space Grotesk", "Inter", sans-serif; }

  .site-header { position: sticky; top: 0; z-index: 50; border-bottom: 1px solid var(--line);
                 background: color-mix(in srgb, var(--card) 85%, transparent);
                 -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); }
  .nav { max-width: 1240px; margin: 0 auto; display: flex; align-items: center; gap: 24px; padding: 12px 24px; }
  .brand { display: flex; align-items: center; text-decoration: none; color: var(--ink); flex: none; }
  .logo-img { height: 104px; width: auto; display: block; }
  @media (prefers-color-scheme: dark) {
    .logo-img { background: #FFFFFF; border-radius: 14px; padding: 6px 14px; height: 116px; }
  }
  .nav-links { margin-left: auto; display: flex; align-items: center; gap: 26px; }
  .nav-links a { position: relative; color: var(--muted); font-weight: 600; font-size: 0.95rem;
                 text-decoration: none; padding: 6px 1px; transition: color 0.15s; }
  .nav-links a::after { content: ""; position: absolute; left: 0; bottom: 0; width: 100%; height: 2px;
                        border-radius: 2px; background: linear-gradient(90deg, var(--cyan), var(--blue));
                        transform: scaleX(0); transform-origin: left; transition: transform 0.22s ease; }
  .nav-links a:hover { color: var(--ink); }
  .nav-links a:hover::after, .nav-links a.active::after { transform: scaleX(1); }
  .nav-links a.active { color: var(--ink); }

  .wrap { max-width: 1240px; margin: 0 auto; padding: 38px 24px 72px; }
  .hero h1 { font-size: 1.85rem; font-weight: 700; letter-spacing: -0.02em; line-height: 1.25; }
  .hero-title { margin: 0 0 4px; }
  .hero-img { display: block; width: 100%; max-width: 440px; height: auto; }
  .hero-fallback { display: none; font-size: 1.85rem; font-weight: 700; letter-spacing: -0.02em; line-height: 1.25; }
  @media (prefers-color-scheme: dark) {
    .hero-img { display: none; }
    .hero-fallback { display: block; }
  }
  .hero .sub { color: var(--muted); font-size: 1rem; margin-top: 8px; }
  .hero .updated { color: var(--muted); font-size: 0.82rem; margin-top: 10px; }

  .chips { display: flex; flex-wrap: wrap; gap: 9px; margin: 26px 0 30px; }
  .chip { background: var(--card); color: var(--muted); border: 1px solid var(--line); border-radius: 999px;
          padding: 7px 17px; font: 600 0.87rem "Inter", sans-serif; cursor: pointer; transition: all 0.15s; }
  .chip:hover { color: var(--ink); border-color: var(--cyan); }
  .chip.active { background: linear-gradient(90deg, var(--cyan), var(--blue)); border-color: transparent; color: #fff; }

  #feed, .guides-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 16px; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; overflow: hidden;
          display: flex; flex-direction: column;
          box-shadow: 0 1px 2px color-mix(in srgb, var(--navy) 5%, transparent);
          transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s; }
  .card:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--cyan) 45%, var(--line));
                box-shadow: 0 10px 28px color-mix(in srgb, var(--navy) 12%, transparent); }
  .thumb { display: block; position: relative; aspect-ratio: 16 / 9; overflow: hidden; background: var(--line); }
  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.3s ease; }
  .card:hover .thumb img { transform: scale(1.04); }
  .thumb-mark { display: none; }
  .thumb.no-img img { display: none; }
  .thumb.no-img { display: flex; align-items: center; justify-content: center; }
  .thumb.no-img .thumb-mark { display: block; font-family: "Space Grotesk", sans-serif; font-weight: 700;
           font-size: 1.15rem; letter-spacing: 0.06em; text-transform: uppercase; color: #fff; opacity: 0.95; }
  .thumb-emoji { display: flex; align-items: center; justify-content: center; font-size: 3.2rem; }
  .thumb-ia { background: linear-gradient(135deg, #00B2FF, #2563FF); }
  .thumb-tech { background: linear-gradient(135deg, #2563FF, #0B1D3A); }
  .thumb-sciences { background: linear-gradient(135deg, #10B981, #0B7C63); }
  .thumb-automobile { background: linear-gradient(135deg, #FF8A3D, #D64E0A); }
  .thumb-robotique { background: linear-gradient(135deg, #A78BFA, #6D28D9); }
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
  .badge-sciences { background: color-mix(in srgb, #10B981 14%, transparent); color: #0B7C63; }
  .badge-automobile { background: color-mix(in srgb, #FF6B1F 14%, transparent); color: #D64E0A; }
  .badge-robotique { background: color-mix(in srgb, #8B5CF6 15%, transparent); color: #6D28D9; }
  @media (prefers-color-scheme: dark) {
    .badge-ia { color: var(--cyan); } .badge-tech { color: #7EA4FF; } .badge-sciences { color: #34D399; }
    .badge-automobile { color: #FF9A5A; } .badge-robotique { color: #B794F6; }
  }

  /* ---- Article de guide ---- */
  .cover-svg, .cover-img { display: block; width: 100%; height: 100%; }
  .cover-img { object-fit: cover; }
  .guide-cover { aspect-ratio: 3 / 1; border-radius: 18px; overflow: hidden; margin-bottom: 8px; }
  .article { max-width: 760px; margin: 0 auto; }
  .article-meta { display: flex; align-items: center; gap: 12px; font-size: 0.8rem; color: var(--muted);
                  flex-wrap: wrap; margin: 22px 0 10px; }
  .article > h1 { font-size: 2.1rem; line-height: 1.2; letter-spacing: -0.02em; margin-bottom: 8px; }
  @media (max-width: 480px) { .article > h1 { font-size: 1.6rem; } }
  .article-body { font-size: 1.08rem; line-height: 1.75; margin-top: 20px; }
  .article-body h2 { font-size: 1.4rem; margin: 34px 0 12px; letter-spacing: -0.01em; }
  .article-body h3 { font-size: 1.15rem; margin: 24px 0 8px; }
  .article-body p { margin: 0 0 18px; }
  .article-body ul { margin: 0 0 18px; padding-left: 22px; }
  .article-body li { margin: 6px 0; }
  .article-body a { color: var(--blue); text-decoration: underline; text-underline-offset: 2px; }
  .article-body strong { font-weight: 700; }
  .article-body blockquote { margin: 24px 0; padding: 14px 20px; border-left: 4px solid var(--cyan);
           background: color-mix(in srgb, var(--cyan) 8%, transparent); border-radius: 0 10px 10px 0;
           font-size: 1.05rem; color: var(--ink); }
  .article-foot { margin-top: 40px; padding-top: 24px; border-top: 1px solid var(--line); }
  .btn { display: inline-block; background: var(--card); border: 1px solid var(--line); border-radius: 11px;
         padding: 10px 18px; font-weight: 600; font-size: 0.92rem; text-decoration: none; color: var(--ink);
         transition: border-color 0.15s; }
  .btn:hover { border-color: var(--cyan); }

  footer { color: var(--muted); font-size: 0.85rem; margin-top: 48px; text-align: center; }
  @media (max-width: 480px) {
    .hero h1 { font-size: 1.5rem; }
    .logo-img { height: 74px; }
    .nav { gap: 14px; }
    .nav-links { gap: 18px; }
  }
`;

function pageShell({ title, description, active, base = "", main, script = "" }) {
  const link = (a, href, label) =>
    `<a href="${base}${href}"${active === a ? ' class="active"' : ""}>${label}</a>`;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="icon" href="${FAVICON}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${STYLES}</style>
</head>
<body>
<header class="site-header">
  <nav class="nav">
    <a class="brand" href="${base}index.html" aria-label="Jorah — accueil">
      <img class="logo-img" src="${base}logo.png" alt="Jorah" width="640" height="160">
    </a>
    <div class="nav-links">
      ${link("actus", "index.html", "Actus")}
      ${link("guides", "guides.html", "Guides")}
    </div>
  </nav>
</header>
${main}
${script}
</body>
</html>`;
}

// ---------- Pages ----------

function renderIndex(items) {
  const cats = [...new Set(items.map(i => i.cat))].sort();
  const updated = new Date().toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });

  const cards = items.map(i => {
    const cc = catClass(i.cat);
    const thumb = i.image
      ? `<img src="${esc(i.image)}" alt="" loading="lazy" onerror="this.closest('.thumb').classList.add('no-img')">`
      : "";
    return `
    <article class="card" data-cat="${esc(i.cat)}">
      <a class="thumb thumb-${cc}${i.image ? "" : " no-img"}" href="${esc(i.link)}" target="_blank" rel="noopener" aria-hidden="true" tabindex="-1">
        ${thumb}<span class="thumb-mark">${esc(i.cat)}</span>
      </a>
      <div class="card-body">
        <div class="meta">
          <span class="badge badge-${cc}">${esc(i.cat)}</span>
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

  const main = `<div class="wrap">
  <section class="hero">
    <h1 class="hero-title">
      <img class="hero-img" src="soustitre.png" alt="L’essentiel de l’actu IA & tech, en français" width="900" height="299">
      <span class="hero-fallback">L’essentiel de l’actu IA &amp; tech, en français</span>
    </h1>
    <p class="sub">Les dernières actualités de ${FEEDS.length} sources françaises de référence, réunies en un seul endroit.</p>
    <p class="updated">Mis à jour automatiquement — ${updated}</p>
  </section>
  <nav class="chips">${chips}</nav>
  <main id="feed">
${cards}
  </main>
  <footer>Jorah · L’actu IA &amp; tech agrégée automatiquement depuis ${FEEDS.length} sources françaises</footer>
</div>`;

  const script = `<script>
  document.querySelectorAll(".chip").forEach(chip => chip.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    const f = chip.dataset.filter;
    document.querySelectorAll(".card").forEach(card => {
      card.style.display = (f === "Tout" || card.dataset.cat === f) ? "" : "none";
    });
  }));
</script>`;

  return pageShell({
    title: "Jorah — l’essentiel de l’actu IA & tech en français",
    description: "Jorah agrège l’actualité IA, tech, sciences, automobile et robotique des meilleures sources françaises, mise à jour automatiquement.",
    active: "actus", base: "", main, script,
  });
}

function renderGuidesIndex(guides) {
  const cards = guides.map(g => {
    const cc = catClass(g.category);
    return `
    <a class="card" href="guides/${esc(g.slug)}.html">
      <span class="thumb">${coverHtml(g, "", "card")}</span>
      <div class="card-body">
        <div class="meta">
          <span class="badge badge-${cc}">${esc(g.category)}</span>
          <span>${g.readingTime} min</span>
        </div>
        <h2>${esc(g.title)}</h2>
        ${g.excerpt ? `<p>${esc(g.excerpt)}</p>` : ""}
      </div>
    </a>`;
  }).join("\n");

  const main = `<div class="wrap">
  <section class="hero">
    <h1>Guides — l’IA &amp; la robotique, expliquées simplement</h1>
    <p class="sub">Comprendre, sans jargon, ce que l’intelligence artificielle et les robots changent dans votre quotidien.</p>
  </section>
  <div class="guides-grid" style="margin-top:28px">
${cards || '<p class="sub">Les premiers guides arrivent très bientôt.</p>'}
  </div>
  <footer>Jorah · Guides pour comprendre l’IA et la robotique</footer>
</div>`;

  return pageShell({
    title: "Guides IA & Robotique expliqués simplement — Jorah",
    description: "Des guides clairs et sans jargon pour comprendre l’intelligence artificielle et la robotique, même quand on débute.",
    active: "guides", base: "", main,
  });
}

function renderGuide(g) {
  const cc = catClass(g.category);
  const main = `<div class="wrap">
  <article class="article">
    <div class="guide-cover">${coverHtml(g, "../", "hero")}</div>
    <div class="article-meta">
      <span class="badge badge-${cc}">${esc(g.category)}</span>
      <time datetime="${g.date}">${frDate(g.date)}</time>
      <span>${g.readingTime} min de lecture</span>
    </div>
    <h1>${esc(g.title)}</h1>
    <div class="article-body">
${g.bodyHtml}
    </div>
    <div class="article-foot">
      <a class="btn" href="../guides.html">← Tous les guides</a>
    </div>
  </article>
  <footer>Jorah · Comprendre l’IA et la robotique simplement</footer>
</div>`;

  return pageShell({
    title: `${g.title} — Jorah`,
    description: g.excerpt,
    active: "guides", base: "../", main,
  });
}

// ---------- Génération ----------

(async () => {
  console.log("Récupération des flux…");
  const results = await Promise.all(FEEDS.map(fetchFeed));
  const byCat = {};
  for (const it of results.flat()) (byCat[it.cat] ||= []).push(it);
  const items = [];
  for (const cat of Object.keys(byCat)) {
    byCat[cat].sort((a, b) => new Date(b.date) - new Date(a.date));
    items.push(...byCat[cat].slice(0, PER_CAT));
  }
  items.sort((a, b) => new Date(b.date) - new Date(a.date));
  if (items.length === 0) {
    console.error("Aucun article récupéré — vérifie la connexion réseau.");
    process.exit(1);
  }

  const guides = loadGuides();

  const siteDir = path.join(__dirname, "site");
  fs.mkdirSync(path.join(siteDir, "guides"), { recursive: true });

  // Domaine personnalisé : indispensable dans les fichiers publiés pour que
  // GitHub Pages garde jorah.fr attaché et génère le certificat HTTPS.
  fs.writeFileSync(path.join(siteDir, "CNAME"), "jorah.fr\n", "utf8");

  // Copie des visuels de couverture fournis vers le site.
  try {
    const src = path.join(__dirname, "content", "guides", "covers");
    const dst = path.join(siteDir, "covers");
    const covers = fs.readdirSync(src);
    fs.mkdirSync(dst, { recursive: true });
    for (const f of covers) fs.copyFileSync(path.join(src, f), path.join(dst, f));
    if (covers.length) console.log(`  ${covers.length} visuel(s) de couverture copié(s)`);
  } catch {}

  fs.writeFileSync(path.join(siteDir, "index.html"), renderIndex(items), "utf8");
  fs.writeFileSync(path.join(siteDir, "guides.html"), renderGuidesIndex(guides), "utf8");
  for (const g of guides) {
    fs.writeFileSync(path.join(siteDir, "guides", `${g.slug}.html`), renderGuide(g), "utf8");
  }

  console.log(`\n${items.length} actus → site/index.html`);
  console.log(`${guides.length} guide(s) → site/guides.html${guides.length ? " + site/guides/*.html" : ""}`);
})();
