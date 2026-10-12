// The Mlandu Times: daily edition builder. Run: GNEWS_API_KEY=xxx node build.mjs
import { readFile, writeFile, mkdir } from "node:fs/promises";

const KEY = process.env.GNEWS_API_KEY;
if (!KEY) { console.error("Missing GNEWS_API_KEY"); process.exit(1); }
const LEAN = JSON.parse(await readFile(new URL("./sources.json", import.meta.url), "utf8"));
const leanOf = n => { const s = (n || "").toLowerCase(); const k = Object.keys(LEAN).find(k => !k.startsWith("_") && s.includes(k)); return k ? LEAN[k] : "unrated"; };

// Elections tab. Edit dates/facts as things change; headlines are fetched automatically.
const FACTS_AS_OF = "12 October 2026";
const ELECTIONS = [
  { id: "br", flag: "BR", name: "Brazil: presidential runoff", date: "2026-10-25",
    q: "Brazil runoff Lula Flavio Bolsonaro",
    facts: ["Flavio Bolsonaro (right) took about 47% of valid votes in the 4 October first round against about 45% for President Lula (left), per the electoral court count reported by Xinhua and Reuters.",
      "Rivals Ronaldo Caiado and Romeu Zema endorsed Bolsonaro after being knocked out (MercoPress).",
      "Campaign themes: cost of living, corruption and public security."] },
  { id: "us", flag: "US", name: "United States: midterm elections", date: "2026-11-03",
    q: "US midterm elections 2026 House Senate",
    facts: ["All 435 House seats and roughly a third of the Senate are on the ballot.",
      "The result decides who controls Congress for the second half of the presidential term."] },
  { id: "za", flag: "ZA", name: "South Africa: local government elections", date: "2026-11-04",
    q: "South Africa local government elections IEC",
    facts: ["Proclaimed for Wednesday 4 November 2026 and will set municipal councils for the next five-year term.",
      "More than 29 million people are registered, and voters can only vote at the station where they registered (IEC).",
      "Hundreds of parties are registered to contest, according to IEC figures reported in August."] }
];

const base = "https://gnews.io/api/v4";
async function get(path, params, max = "10") {
  const q = new URLSearchParams({ lang: "en", max, ...params, apikey: KEY });
  try {
    const r = await fetch(`${base}/${path}?${q}`);
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
const regions = {};
for (const [k, cs] of Object.entries(countries)) regions[k] = (await Promise.all(cs.map(c => top("general", { country: c })))).flat();
regions.za = [...regions.za, ...(await search("Springboks OR Bafana OR Proteas"))];
const elections = [];
for (const e of ELECTIONS) elections.push({ ...e, news: await search(e.q) });

// Importance ranking: group articles about the same story, rank by how many different outlets ran it.
const STOP = new Set("this that with from have will about after over into their says said what when where which while amid more than they been were would could news live update".split(" "));
const toks = t => new Set((t || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 3 && !STOP.has(w)));
const pool = [...world, ...us, ...mideast, ...Object.values(regions).flat()];
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
    score: srcs.length * 10 + (best.img ? 2 : 0) + new Date(best.at).getTime() / 1e13 };
}).sort((a, b) => b.score - a.score).slice(0, 12);

const data = { built: new Date().toISOString(), factsAsOf: FACTS_AS_OF, stories, world, mideast, sport, culture, tech, regions, elections };
const tpl = await readFile(new URL("./template.html", import.meta.url), "utf8");
await mkdir("dist", { recursive: true });
await writeFile("dist/index.html", tpl.replace("/*__DATA__*/null", JSON.stringify(data).replace(/</g, "\\u003c")));
await writeFile("dist/data.json", JSON.stringify(data, null, 2));
console.log("Built", data.built, "| stories:", stories.length, "| top outlets:", stories[0]?.n);
