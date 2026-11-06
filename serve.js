import { createServer } from "node:http";
import { promises as fs, watch } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [file, port = "8787"] = process.argv.slice(2);
if (!file) {
	console.log("usage: node serve.js tree.yaml [port]");
	process.exit(1);
}
const target = resolve(file);
const root = dirname(fileURLToPath(import.meta.url));
const clients = new Set();

async function broadcast() {
	const text = await fs.readFile(target, "utf8");
	for (const res of clients) {
		res.write(`data: ${JSON.stringify(text)}\n\n`);
	}
}

let timer;
watch(dirname(target), (_, name) => {
	if (name !== undefined && resolve(dirname(target), name) !== target) {
		return;
	}
	clearTimeout(timer);
	timer = setTimeout(() => broadcast().catch(() => {}), 100);
});

const types = { ".html": "text/html", ".js": "text/javascript", ".ico": "image/x-icon", ".png": "image/png" };

createServer(async (req, res) => {
	const url = new URL(req.url, "http://localhost");
	if (url.pathname === "/file" && req.method === "GET") {
		res.writeHead(200, { "content-type": "text/yaml; charset=utf-8" });
		res.end(await fs.readFile(target, "utf8"));
		return;
	}
	if (url.pathname === "/file" && req.method === "PUT") {
		const chunks = [];
		for await (const chunk of req) {
			chunks.push(chunk);
		}
		await fs.writeFile(target, Buffer.concat(chunks));
		res.writeHead(204);
		res.end();
		return;
	}
	if (url.pathname === "/events") {
		res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
		res.write("\n");
		clients.add(res);
		req.on("close", () => clients.delete(res));
		return;
	}
	const path = url.pathname === "/" ? "/index.html" : url.pathname;
	const ext = path.slice(path.lastIndexOf("."));
	if (!(ext in types) || path.includes("..")) {
		res.writeHead(404);
		res.end();
		return;
	}
	try {
		const body = await fs.readFile(join(root, path));
		res.writeHead(200, { "content-type": types[ext] });
		res.end(body);
	} catch {
		res.writeHead(404);
		res.end();
	}
}).listen(Number(port), "127.0.0.1", () => {
	console.log(`http://localhost:${port}  <->  ${target}`);
});
