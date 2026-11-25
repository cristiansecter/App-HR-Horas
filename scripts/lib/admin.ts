import { existsSync, readFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Acceso de administración a una instancia de SG Black. Lo usa SOLO el Configurador, desde su máquina o desde
 * Codespaces, con la clave de cuenta de servicio de esa instancia. La clave nunca va al repositorio ni al chat.
 *
 * Dónde se busca la clave, en este orden:
 *   1. --key ruta/a/la/clave.json
 *   2. la variable GOOGLE_APPLICATION_CREDENTIALS
 * Con los emuladores (FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST) no hace falta clave, solo --project.
 */
export interface Args {
  flags: Map<string, string | true>;
  get: (name: string) => string | undefined;
  has: (name: string) => boolean;
  require: (name: string) => string;
}

export function parseArgs(argv: readonly string[]): Args {
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq > 0) {
      flags.set(a.slice(2, eq), a.slice(eq + 1));
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags.set(a.slice(2), next);
      i++;
    } else {
      flags.set(a.slice(2), true);
    }
  }
  const get = (name: string) => {
    const v = flags.get(name);
    return typeof v === "string" ? v : undefined;
  };
  return {
    flags,
    get,
    has: (name) => flags.has(name),
    require: (name) => {
      const v = get(name);
      if (!v) throw new Error(`Falta el parámetro --${name}.`);
      return v;
    },
  };
}

export function connect(args: Args) {
  const usingEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST);
  const keyPath = args.get("key") ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!getApps().length) {
    if (usingEmulator) {
      initializeApp({ projectId: args.get("project") ?? "sgblack-emulator" });
    } else {
      if (!keyPath) {
        throw new Error("Falta la clave de la cuenta de servicio. Pasala con --key ruta/clave.json o con GOOGLE_APPLICATION_CREDENTIALS.");
      }
      if (!existsSync(keyPath)) throw new Error(`No existe el archivo de clave: ${keyPath}`);
      const key = JSON.parse(readFileSync(keyPath, "utf8")) as { project_id?: string };
      initializeApp({ credential: cert(keyPath), projectId: args.get("project") ?? key.project_id });
    }
  }
  const app = getApps()[0]!;
  return { projectId: app.options.projectId ?? "(desconocido)", auth: getAuth(app), db: getFirestore(app), usingEmulator };
}
