// Petit serveur statique pour prévisualiser le site en local
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "site");
const PORT = 4173;

http.createServer((req, res) => {
  const file = path.join(ROOT, req.url === "/" ? "index.html" : req.url);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(data);
  });
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
