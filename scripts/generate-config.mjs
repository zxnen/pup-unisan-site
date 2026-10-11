import { mkdirSync, writeFileSync } from "node:fs";

const url = process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY / SUPABASE_ANON_KEY");
  process.exit(1);
}

mkdirSync("js", { recursive: true });
writeFileSync(
  "js/config.js",
  `export const SUPABASE_URL = ${JSON.stringify(url)};
export const SUPABASE_PUBLISHABLE_KEY = ${JSON.stringify(key)};
`
);
console.log("Wrote js/config.js");