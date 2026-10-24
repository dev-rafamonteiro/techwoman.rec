import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_URI = "mongodb://localhost:27017/?directConnection=true";

/** Lê só MONGODB_URI_TEST do .env da raiz; nunca toca em MONGODB_URI. */
export function getTestMongoUri(): string {
  let uri = process.env.MONGODB_URI_TEST;
  if (!uri) {
    try {
      const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
      const line = readFileSync(resolve(root, ".env"), "utf8")
        .split("\n")
        .find((l) => l.startsWith("MONGODB_URI_TEST="));
      uri = line?.slice("MONGODB_URI_TEST=".length).trim().replace(/^["']|["']$/g, "");
    } catch {
      /* sem .env: usa o padrão local */
    }
  }
  uri = uri || DEFAULT_URI;
  if (/mongodb\+srv:|mongodb\.net/i.test(uri)) {
    throw new Error("MONGODB_URI_TEST aponta para Atlas; testes só rodam no mongo-local");
  }
  return uri;
}
