// Veille IA & Robotique — générateur de site statique
// Usage : node build.js  → récupère les flux RSS et régénère site/index.html

const fs = require("fs");
const path = require("path");

const FEEDS = [
  { name: "Numerama",        url: "https://www.numerama.com/feed/",                                lang: "FR", cat: "Tech" },
  { name: "ActuIA",          url: "https://www.actuia.com/feed/",                                  lang: "FR", cat: "IA" },
  { name: "TechCrunch AI",   url: "https://techcrunch.com/category/artificial-intelligence/feed/", lang: "EN", cat: "IA" },
  { name: "The Verge",       url: "https://www.theverge.com/rss/index.xml",                        lang: "EN", cat: "Tech" },
  { name: "MIT Tech Review", url: "https://www.technologyreview.com/feed/",                        lang: "EN", cat: "Recherche" },
  { name: "IEEE Spectrum",   url: "https://spectrum.ieee.org/feeds/topic/robotics.rss",            lang: "EN", cat: "Robotique" },
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
    items.push({ title, link: stripHtml(link), date: date.toISOString(), desc, source: feed.name, lang: feed.lang, cat: feed.cat });
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

// --- Traduction des articles anglais via l'API Claude ---
// Cache : chaque article n'est traduit qu'une seule fois (translations.json).
// Sans clé API (ANTHROPIC_API_KEY), les articles restent en anglais.

const CACHE_PATH = path.join(__dirname, "translations.json");

const TRANSLATION_SCHEMA = {
  type: "object",
  properties: {
    translations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          title: { type: "string" },
          desc: { type: "string" },
        },
        required: ["id", "title", "desc"],
        additionalProperties: false,
      },
    },
  },
  required: ["translations"],
  additionalProperties: false,
};

async function translateEnglishItems(items) {
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8")); } catch {}

  const pending = items.filter(i => i.lang === "EN" && !cache[i.link]);
  if (pending.length > 0 && !process.env.ANTHROPIC_API_KEY) {
    console.warn(`  ! ANTHROPIC_API_KEY absente — ${pending.length} articles anglais laissés en VO`);
  } else if (pending.length > 0) {
    const Anthropic = require("@anthropic-ai/sdk");
    const client = new Anthropic();
    const BATCH = 25;
    for (let start = 0; start < pending.length; start += BATCH) {
      const batch = pending.slice(start, start + BATCH);
      try {
        const response = await client.messages.create({
          model: "claude-opus-4-8",
          max_tokens: 16000,
          system:
            "Tu es traducteur pour un site d'actualité tech français. Traduis les titres (title) et descriptions (desc) d'articles de l'anglais vers le français : style journalistique, concis et naturel. Conserve tels quels les noms de produits, d'entreprises, de personnes et les termes techniques établis. Si desc est vide, renvoie une chaîne vide.",
          messages: [{
            role: "user",
            content: JSON.stringify(batch.map((i, idx) => ({ id: idx, title: i.title, desc: i.desc }))),
          }],
          output_config: { format: { type: "json_schema", schema: TRANSLATION_SCHEMA } },
        });
        if (response.stop_reason === "refusal") {
          console.warn("  ✗ Traduction refusée par l'API pour ce lot — articles laissés en VO");
          continue;
        }
        const text = response.content.find(b => b.type === "text")?.text;
        const { translations } = JSON.parse(text);
        for (const t of translations) {
          const item = batch[t.id];
          if (item) cache[item.link] = { title: t.title, desc: t.desc };
        }
        console.log(`  ✓ Traduction : ${batch.length} articles (${response.usage.input_tokens} tokens entrée / ${response.usage.output_tokens} sortie)`);
      } catch (e) {
        console.warn(`  ✗ Traduction : ${e.message} — articles laissés en VO`);
        break;
      }
    }
  }

  for (const i of items) {
    const t = cache[i.link];
    if (t) {
      i.title = t.title;
      if (t.desc) i.desc = t.desc;
      i.translated = true;
    }
  }

  // On ne garde en cache que les articles encore affichés
  const links = new Set(items.map(i => i.link));
  const pruned = Object.fromEntries(Object.entries(cache).filter(([k]) => links.has(k)));
  fs.writeFileSync(CACHE_PATH, JSON.stringify(pruned, null, 1), "utf8");
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
        <span class="lang">${i.translated ? "EN → FR" : i.lang}</span>
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
<title>Jorah — l’essentiel de l’actu IA &amp; robotique</title>
<meta name="description" content="Jorah agrège l’actualité IA, robotique et tech, mise à jour automatiquement.">
<style>
  :root {
    --bg: #0d1117; --card: #161b22; --border: #21262d;
    --text: #e6edf3; --muted: #8b949e; --accent: #58a6ff;
  }
  @media (prefers-color-scheme: light) {
    :root { --bg: #f6f8fa; --card: #ffffff; --border: #d0d7de; --text: #1f2328; --muted: #656d76; --accent: #0969da; }
  }
  * { box-sizing: border-box; margin: 0; }
  body { background: var(--bg); color: var(--text); font: 16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
  .wrap { max-width: 780px; margin: 0 auto; padding: 24px 16px 64px; }
  header { padding: 28px 0 12px; }
  header h1 { font-size: 2.1rem; letter-spacing: -0.03em; }
  header h1 .dot { color: var(--accent); }
  .tagline { font-size: 1rem; color: var(--text); margin-top: 2px; }
  .updated { color: var(--muted); font-size: 0.85rem; margin-top: 4px; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 0 26px; }
  .chip { background: var(--card); color: var(--text); border: 1px solid var(--border); border-radius: 999px;
          padding: 6px 14px; font-size: 0.85rem; cursor: pointer; }
  .chip.active { background: var(--accent); border-color: var(--accent); color: #fff; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 18px 20px; margin-bottom: 14px; }
  .card h2 { font-size: 1.08rem; line-height: 1.35; margin: 8px 0 6px; }
  .card a { color: var(--text); text-decoration: none; }
  .card a:hover { color: var(--accent); }
  .card p { color: var(--muted); font-size: 0.92rem; }
  .meta { display: flex; align-items: center; gap: 10px; font-size: 0.78rem; color: var(--muted); flex-wrap: wrap; }
  .badge { border-radius: 999px; padding: 2px 10px; font-weight: 600; background: var(--accent); color: #fff; }
  .badge-ia { background: #8957e5; } .badge-robotique { background: #d29922; color:#1f2328; }
  .badge-recherche { background: #3fb950; color:#1f2328; } .badge-tech { background: #58a6ff; }
  .lang { border: 1px solid var(--border); border-radius: 4px; padding: 0 5px; font-size: 0.7rem; }
  footer { color: var(--muted); font-size: 0.85rem; margin-top: 40px; text-align: center; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Jorah<span class="dot">.</span></h1>
    <p class="tagline">L’essentiel de l’actu IA, robotique &amp; tech</p>
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
  console.log("Traduction des articles anglais…");
  await translateEnglishItems(items);
  const html = render(items);
  fs.mkdirSync(path.join(__dirname, "site"), { recursive: true });
  const out = path.join(__dirname, "site", "index.html");
  fs.writeFileSync(out, html, "utf8");
  console.log(`\n${items.length} articles → ${out}`);
})();
