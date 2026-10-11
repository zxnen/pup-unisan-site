import { mkdirSync, writeFileSync } from "node:fs";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  process.exit(1);
}

mkdirSync("js", { recursive: true });
writeFileSync(
  "js/config.js",
  `window.APP_CONFIG = ${JSON.stringify({ supabaseUrl: url, supabaseAnonKey: anonKey })};\n`
);
console.log("Wrote js/config.js");