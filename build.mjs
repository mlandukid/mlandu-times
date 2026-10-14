// The Mlandu Times: daily edition builder. Run: GNEWS_API_KEY=xxx node build.mjs
import { readFile, writeFile, mkdir } from "node:fs/promises";

const KEY = process.env.GNEWS_API_KEY;
if (!KEY) { console.error("Missing GNEWS_API_KEY"); process.exit(1); }
const LEAN = JSON.parse(await readFile(new URL("./sources.json", import.meta.url), "utf8"));
const leanOf = n => { const s = (n || "").toLowerCase(); const k = Object.keys(LEAN).find(k => !k.startsWith("_") && s.includes(k)); return k ? LEAN[k] : "unrated"; };

const E = JSON.parse(await readFile(new URL("./elections.json", import.meta.url), "utf8"));
const CFG = JSON.parse(await readFile(new URL("./config.json", import.meta.url), "utf8"));
const FACTS_AS_OF = E.factsAsOf, ELECTIONS = E.elections;
const MAJOR = ["cnn","abc news","nbc news","cbs news","bbc","reuters","associated press","ap news","guardian","new york times","washington post","fox news","msnbc","ms now","sky news","al jazeera","npr","bloomberg","wall street journal","usa today","politico"];

const base = "https://gnews.io/api/v4";
// GNews free tier rejects bursts (429), so space requests out and retry politely.
let last = 0;
async function throttle() {
  const wait = Math.max(0, last + 1300 - Date.now());
  last = Date.now() + wait;
  if (wait) await new Promise(r => setTimeout(r, wait));
}
async function get(path, params, max = "10") {
  const q = new URLSearchParams({ lang: "en", max, ...params, apikey: KEY });
  try {
    let r;
    for (let tries = 0; tries < 3; tries++) {
      await throttle();
      r = await fetch(`${base}/${path}?${q}`);
      if (r.status !== 429) break;
      await new Promise(res => setTimeout(res, 4000));
    }
    if (!r.ok) throw new Error(`${r.status} ${path} ${JSON.stringify(params)}`);
    const j = await r.json();
    return (j.articles || []).map(a => ({
      title: a.title, desc: a.description, url: a.url, img: a.image || "",
      at: a.publishedAt, src: a.source?.name || "", lean: leanOf(a.source?.name)
    }));
  } catch (e) { console.warn("fetch failed:", e.message); return []; }
}
const top = (category, extra = {}) => get("top-headlines", { category, ...extra });
const search = (q) => get("search", { q, sortby: "publishedAt" });
const countries = { za: ["za"], ie: ["ie", "gb"], me: ["ae", "sa"] };

const [world, sport, culture, tech, mideast, us] = await Promise.all([
  top("world"), top("sports"), top("entertainment"), top("technology"),
  search('Palestine OR Gaza OR "West Bank"'), top("general", { country: "us" })
]);
const gen = [];
for (const c of ["gb", "au", "ca"]) gen.push(...await top("general", { country: c }));
gen.push(...await top("general"));
const regions = {};
for (const [k, cs] of Object.entries(countries)) regions[k] = (await Promise.all(cs.map(c => top("general", { country: c })))).flat();
regions.za = [...regions.za, ...(await search("Springboks OR Bafana OR Proteas"))];
const elections = [];
for (const e of ELECTIONS) elections.push({ ...e, news: await search(e.q) });

// Importance ranking: group articles about the same story, rank by how many different outlets ran it.
const STOP = new Set("this that with from have will about after over into their says said what when where which while amid more than they been were would could news live update".split(" "));
const toks = t => new Set((t || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 3 && !STOP.has(w)));
// Lead pool is global general news. Gaza/Palestine has its own section and only leads if it is genuinely the biggest story.
const pool = [...world, ...us, ...gen];
const seen = new Set(), clusters = [];
for (const a of pool) {
  if (!a.url || seen.has(a.url) || !a.title) continue; seen.add(a.url);
  const t = toks(a.title);
  const c = clusters.find(c => { let i = 0; for (const w of t) if (c.t.has(w)) i++; return i >= 3 && i / Math.min(t.size, c.t.size) >= 0.5; });
  if (c) { c.items.push(a); t.forEach(w => c.t.add(w)); } else clusters.push({ t, items: [a] });
}
const stories = clusters.map(c => {
  const srcs = [...new Set(c.items.map(a => a.src))];
  const lean = { left: 0, center: 0, right: 0, unrated: 0 };
  for (const s of srcs) lean[leanOf(s)]++;
  const best = c.items.find(a => a.img) || c.items[0];
  const rated = lean.left + lean.center + lean.right;
  const blind = rated >= 3 && lean.left / rated >= 0.8 ? "left" : rated >= 3 && lean.right / rated >= 0.8 ? "right" : "";
  return { ...best, n: srcs.length, lean, blind, outlets: srcs.slice(0, 8),
    score: srcs.length * 10 + srcs.filter(x => MAJOR.some(m => x.toLowerCase().includes(m))).length * 6 + (best.img ? 3 : 0) + (Date.now() - new Date(best.at) < 12 * 36e5 ? 8 : Date.now() - new Date(best.at) < 24 * 36e5 ? 4 : 0) };
}).sort((a, b) => b.score - a.score).slice(0, 12);

const data = { built: new Date().toISOString(), factsAsOf: FACTS_AS_OF, stories, world, mideast, sport, culture, tech, regions, elections, poll: CFG.supabaseUrl && CFG.supabaseAnonKey ? { url: CFG.supabaseUrl.replace(/\/$/, ""), key: CFG.supabaseAnonKey } : null };
const tpl = await readFile(new URL("./template.html", import.meta.url), "utf8");
await mkdir("dist", { recursive: true });
await writeFile("dist/index.html", tpl.replace("/*__DATA__*/null", JSON.stringify(data).replace(/</g, "\\u003c")));
await writeFile("dist/data.json", JSON.stringify(data, null, 2));
console.log("Built", data.built, "| stories:", stories.length, "| top outlets:", stories[0]?.n);
