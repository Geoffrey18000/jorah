const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const W = 1080, H = 1350;
const OUT = process.argv[2] || ".";
fs.mkdirSync(OUT, { recursive: true });

const FONT = "Segoe UI";
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function wrap(text, maxChars) {
  const words = text.split(" ");
  const lines = []; let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > maxChars && line) { lines.push(line); line = w; }
    else line = (line + " " + w).trim();
  }
  if (line) lines.push(line);
  return lines;
}
function tspans(lines, x, y, lh) {
  return lines.map((l, i) => `<tspan x="${x}" y="${y + i * lh}">${esc(l)}</tspan>`).join("");
}

// Marque Jorah (hexagone + mot), claire sur fond sombre/coloré
function mark(x, y, s = 1) {
  return `<g transform="translate(${x},${y}) scale(${s})">
    <g transform="scale(0.62)">
      <path d="M33 9 L12 21 L12 45 L33 57" stroke="#fff" stroke-width="7.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M39 15 L60 27 L60 51 L39 63 L26 55.5" stroke="#25C1FF" stroke-width="7.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="36.5" cy="35" r="6.5" fill="#25C1FF"/>
      <path d="M36.5 39 L27.5 54.5" stroke="#25C1FF" stroke-width="5" stroke-linecap="round"/><circle cx="26.5" cy="57" r="3.6" fill="#25C1FF"/>
      <path d="M40 37.5 L49 52" stroke="#25C1FF" stroke-width="5" stroke-linecap="round"/><circle cx="50" cy="54" r="3.6" fill="#25C1FF"/>
    </g>
    <text x="52" y="34" font-family="${FONT}" font-size="34" font-weight="700" fill="#fff">Jorah</text>
  </g>`;
}

const hexDeco = `<g fill="none" stroke="#fff" stroke-opacity="0.06" stroke-width="3">
  <polygon points="1080,120 1080,320 920,420 760,320 760,120 920,20"/>
  <polygon points="180,1230 180,1430 20,1530 -140,1430 -140,1230 20,1130"/>
</g>`;

function coverSlide({ kicker, title, subtitle, footer }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#00B2FF"/><stop offset="1" stop-color="#2563FF"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>${hexDeco}
    ${mark(90, 96, 1.15)}
    ${kicker ? `<text x="90" y="470" font-family="${FONT}" font-size="40" font-weight="700" fill="#eafaff" letter-spacing="2">${esc(kicker)}</text>` : ""}
    <text x="90" font-family="${FONT}" font-size="104" font-weight="800" fill="#fff">${tspans(wrap(title, 16), 90, 600, 122)}</text>
    ${subtitle ? `<text x="90" font-family="${FONT}" font-size="46" font-weight="400" fill="#eafaff">${tspans(wrap(subtitle, 34), 90, 600 + wrap(title,15).length*122 + 60, 60)}</text>` : ""}
    ${footer ? `<text x="90" y="1250" font-family="${FONT}" font-size="46" font-weight="700" fill="#fff">${esc(footer)}</text>` : ""}
  </svg>`;
}

function contentSlide({ n, title, prompt }) {
  const titleLines = wrap(title, 22);
  const ty = 620;
  const cardY = ty + titleLines.length * 78 + 80;
  const promptLines = wrap(prompt, 30);
  const cardH = promptLines.length * 62 + 120;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="#0B1D3A"/>${hexDeco}
    ${mark(90, 96, 1)}
    <text x="990" y="270" text-anchor="end" font-family="${FONT}" font-size="150" font-weight="800" fill="#13345c">${String(n).padStart(2, "0")} / 10</text>
    <rect x="90" y="360" width="150" height="10" rx="5" fill="#00B2FF"/>
    <text x="90" y="470" font-family="${FONT}" font-size="200" font-weight="800" fill="#00B2FF">${String(n).padStart(2, "0")}</text>
    <text x="90" font-family="${FONT}" font-size="68" font-weight="800" fill="#fff">${tspans(titleLines, 90, ty, 78)}</text>
    <rect x="90" y="${cardY}" width="900" height="${cardH}" rx="24" fill="#ffffff" fill-opacity="0.06" stroke="#00B2FF" stroke-opacity="0.5" stroke-width="2"/>
    <text x="130" y="${cardY + 40}" font-family="${FONT}" font-size="34" font-weight="700" fill="#25C1FF">LA PHRASE À COPIER</text>
    <text x="130" font-family="${FONT}" font-size="42" font-weight="400" font-style="italic" fill="#eaf1fa">${tspans(promptLines, 130, cardY + 105, 62)}</text>
    <text x="540" y="1290" text-anchor="middle" font-family="${FONT}" font-size="36" font-weight="700" fill="#5a7fb5">jorah.fr · l’IA expliquée simplement</text>
  </svg>`;
}

const slides = [
  { type: "cover", kicker: "GUIDE PRATIQUE", title: "10 choses utiles à faire avec une IA gratuite", subtitle: "Avec les phrases exactes à copier-coller.", footer: "→ Fais défiler" },
  { type: "content", n: 1, emoji: "📄", title: "Résumer un document trop long", prompt: "Résume ce texte en 10 points clés, en français simple." },
  { type: "content", n: 2, emoji: "✉️", title: "Écrire un e-mail pénible", prompt: "Écris un e-mail poli mais ferme pour relancer un client qui n’a pas payé." },
  { type: "content", n: 3, emoji: "🌍", title: "Traduire sans que ça sonne robot", prompt: "Traduis ce message en anglais, ton pro mais chaleureux." },
  { type: "content", n: 4, emoji: "📋", title: "Décoder un papier administratif", prompt: "Explique-moi ce paragraphe comme si je n’y connaissais rien." },
  { type: "content", n: 5, emoji: "💼", title: "Booster ton CV", prompt: "Voici mon CV et l’offre. Dis-moi ce qui manque et réécris mes expériences." },
  { type: "content", n: 6, emoji: "💡", title: "Trouver des idées", prompt: "Propose 15 idées de cadeau pour ma mère : jardinage + polars, budget 40 €." },
  { type: "content", n: 7, emoji: "🍳", title: "Cuisiner avec les restes du frigo", prompt: "J’ai courgettes, riz, œufs, crème. 3 recettes en moins de 30 min." },
  { type: "content", n: 8, emoji: "✈️", title: "Préparer un voyage", prompt: "Programme de 4 jours à Lisbonne en septembre, sans trop marcher." },
  { type: "content", n: 9, emoji: "📚", title: "Apprendre à ton rythme", prompt: "Explique-moi le crédit immobilier étape par étape, vérifie que j’ai compris." },
  { type: "content", n: 10, emoji: "🔒", title: "Le réflexe sécurité", prompt: "Ne colle jamais d’infos sensibles (banque, sécu). Et vérifie les faits importants." },
  { type: "cover", kicker: "", title: "Comprendre l’IA sans le jargon ?", subtitle: "Tous nos guides gratuits sur jorah.fr — lien en bio. Enregistre ce post pour l’avoir sous la main.", footer: "jorah.fr" },
];

(async () => {
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    const svg = s.type === "cover" ? coverSlide(s) : contentSlide(s);
    const name = `slide-${String(i + 1).padStart(2, "0")}.png`;
    await sharp(Buffer.from(svg)).png().toFile(path.join(OUT, name));
  }
  console.log(`${slides.length} slides générées dans ${OUT}`);
})();
