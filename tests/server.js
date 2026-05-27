const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 4321;
const FIXTURES = path.join(__dirname, "fixtures");

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

http.createServer((req, res) => {
  const url = req.url === "/" ? "/verge-article.html" : req.url;
  const filePath = path.join(FIXTURES, url);
  const ext = path.extname(filePath);

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "text/plain" });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found: " + url);
  }
}).listen(PORT, () => {
  console.log(`Fixture server: http://localhost:${PORT}`);
});
