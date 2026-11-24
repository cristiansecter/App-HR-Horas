/**
 * Deja lista una instancia nueva de Horus: configuración inicial de la empresa, feriados nacionales y el
 * primer administrador. Por defecto SOLO MUESTRA lo que haría; con --apply escribe.
 *
 *   npx tsx scripts/provision-instance.ts --company "Nombre SRL" --admin-email dueño@empresa.com \
 *       --admin-name "Nombre Apellido" --key clave.json            (simulación)
 *   npx tsx scripts/provision-instance.ts ... --apply               (escribe)
 *
 * Es seguro repetirlo: no pisa una configuración existente salvo que agregues --reset-settings, y los feriados
 * que el administrador ya editó se conservan (solo se agregan los que faltan).
 */
import { FieldValue } from "firebase-admin/firestore";
import { ARGENTINA_HOLIDAYS } from "../src/domain/holidays/argentina";
import { defaultOvertimeConfig, defaultWorkSchedule, validateOvertimeConfig, type SaturdayMode } from "../src/domain/overtime";
import { connect, parseArgs } from "./lib/admin";
import { upsertUser } from "./lib/users";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apply = args.has("apply");
  const company = args.require("company");
  const adminEmail = args.require("admin-email");
  const adminName = args.require("admin-name");
  const saturdayMode = (args.get("saturday") ?? "lct") as SaturdayMode;
  if (saturdayMode !== "lct" && saturdayMode !== "flat_50") throw new Error('--saturday debe ser "lct" o "flat_50".');

  const overtime = defaultOvertimeConfig({ saturdayMode });
  const problems = validateOvertimeConfig(overtime);
  if (problems.length) throw new Error(`La configuración de horas extra no es válida: ${problems.join("; ")}`);

  const { auth, db, projectId, usingEmulator } = connect(args);
  console.log(`Instancia: ${projectId}${usingEmulator ? " (emulador)" : ""}`);
  console.log(apply ? "MODO: se va a escribir.\n" : "MODO: simulación (no se escribe nada). Agregá --apply para aplicar.\n");

  // 1) Configuración de la empresa
  const settingsRef = db.doc("settings/main");
  const settingsExists = (await settingsRef.get()).exists;
  const writeSettings = !settingsExists || args.has("reset-settings");
  console.log(`settings/main: ${writeSettings ? (settingsExists ? "se reemplaza (--reset-settings)" : "se crea") : "ya existe, no se toca"}`);

  // 2) Feriados
  const existing = new Set((await db.collection("holidays").listDocuments()).map((d) => d.id));
  const missing = ARGENTINA_HOLIDAYS.filter((h) => !existing.has(h.date));
  console.log(`holidays: ${missing.length} para agregar, ${ARGENTINA_HOLIDAYS.length - missing.length} ya cargados`);

  // 3) Primer administrador
  console.log(`administrador: ${adminEmail} (${adminName})`);

  if (!apply) return;

  if (writeSettings) {
    await settingsRef.set({
      companyName: company,
      timezone: "America/Argentina/Buenos_Aires",
      editWindowDays: 7,
      overtime,
      defaultSchedule: { ...defaultWorkSchedule() },
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  if (missing.length) {
    const batch = db.batch();
    for (const h of missing) {
      batch.set(db.doc(`holidays/${h.date}`), { name: h.name, type: h.type, countsAsHoliday: h.countsAsHoliday, confirmation: h.confirmation });
    }
    await batch.commit();
  }
  const admin = await upsertUser(auth, db, { email: adminEmail, fullName: adminName, role: "admin", password: args.get("password") });
  console.log("\nListo.");
  console.log(`Administrador: ${adminEmail} (uid ${admin.uid})`);
  if (admin.password) console.log(`Contraseña inicial (guardala ahora, no se vuelve a mostrar): ${admin.password}`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
