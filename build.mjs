// The Mlandu Times: daily edition builder. Fetches news (with images) from GNews,
// then bakes everything into dist/index.html. Run: GNEWS_API_KEY=xxx node build.mjs
import { readFile, writeFile, mkdir } from "node:fs/promises";

const KEY = process.env.GNEWS_API_KEY;
if (!KEY) { console.error("Missing GNEWS_API_KEY"); process.exit(1); }

const base = "https://gnews.io/api/v4";
async function get(path, params) {
  const q = new URLSearchParams({ lang: "en", max: "8", ...params, apikey: KEY });
  try {
    const r = await fetch(`${base}/${path}?${q}`);
    if (!r.ok) throw new Error(`${r.status} ${path} ${JSON.stringify(params)}`);
    const j = await r.json();
    return (j.articles || []).map(a => ({
      title: a.title, desc: a.description, url: a.url, img: a.image || "",
      at: a.publishedAt, src: a.source?.name || "", srcUrl: a.source?.url || ""
    }));
  } catch (e) { console.warn("fetch failed:", e.message); return []; }
}
const top = (category, extra = {}) => get("top-headlines", { category, ...extra });
const countries = { za: ["za"], ie: ["ie", "gb"], me: ["ae", "sa"] };

const [world, sport, culture, tech, mideast] = await Promise.all([
  top("world"), top("sports"), top("entertainment"), top("technology"),
  get("search", { q: "Palestine OR Gaza OR \"West Bank\"", sortby: "publishedAt" })
]);
const regions = {};
for (const [k, cs] of Object.entries(countries)) {
  const lists = await Promise.all(cs.map(c => top("general", { country: c })));
  regions[k] = lists.flat();
}
// Local sports for South Africa readers
regions.za = [...regions.za, ...(await get("search", { q: "Springboks OR Bafana OR Proteas", sortby: "publishedAt" }))];

const data = { built: new Date().toISOString(), world, mideast, sport, culture, tech, regions };
const tpl = await readFile(new URL("./template.html", import.meta.url), "utf8");
const json = JSON.stringify(data).replace(/</g, "\\u003c");
await mkdir("dist", { recursive: true });
await writeFile("dist/index.html", tpl.replace("/*__DATA__*/null", json));
await writeFile("dist/data.json", JSON.stringify(data, null, 2));
console.log("Edition built:", data.built, "world:", world.length, "mideast:", mideast.length);
