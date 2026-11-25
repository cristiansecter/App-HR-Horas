import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, serverTimestamp } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const DAY = 24 * 60 * 60 * 1000;
const noon = (offsetDays: number) => {
  const d = new Date(Date.now() + offsetDays * DAY);
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(d);
  return { date: iso, dateMs: Date.parse(`${iso}T12:00:00-03:00`) };
};

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "horus-rules-test",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});
afterAll(async () => env.cleanup());

const asRole = (uid: string, role?: string) => env.authenticatedContext(uid, role ? { role } : {}).firestore();

const CONFIGURATOR = "cristiansecter@gmail.com";
/** Sesión del Configurador: su correo exacto, verificado, iniciada con Google. */
const configuratorDb = () => env.authenticatedContext("prov", { email: CONFIGURATOR, email_verified: true, firebase: { sign_in_provider: "google.com" } }).firestore();

/** Datos base: admin (ana), supervisor (sofia), empleados de sofia (emi, eze) y un empleado de otro equipo (olga). */
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const base = { active: true, email: "x@demo.example" };
    await setDoc(doc(db, "users/ana"), { ...base, fullName: "Ana", role: "admin" });
    await setDoc(doc(db, "users/sofia"), { ...base, fullName: "Sofía", role: "supervisor", supervisorId: "ana" });
    await setDoc(doc(db, "users/emi"), { ...base, fullName: "Emi", role: "employee", supervisorId: "sofia" });
    await setDoc(doc(db, "users/eze"), { ...base, fullName: "Eze", role: "employee", supervisorId: "sofia" });
    await setDoc(doc(db, "users/olga"), { ...base, fullName: "Olga", role: "employee", supervisorId: "otro" });
    await setDoc(doc(db, "employee_private/emi"), { cuil: "00-00000000-0" });
    await setDoc(doc(db, "settings/main"), { editWindowDays: 7, projectAccess: "open" });
    await setDoc(doc(db, "projects/p1"), { name: "Proyecto" });
  });
});

const newEntry = (userId: string, offsetDays = 0, extra: Record<string, unknown> = {}) => ({
  userId, projectId: "p1", ...noon(offsetDays), startTime: "08:30", endTime: "17:30", isOnCall: false, ticketRef: "", notes: "",
  status: "submitted", createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra,
});

const seedEntry = async (id: string, userId: string, status: string, offsetDays = -1, extra: Record<string, unknown> = {}) =>
  env.withSecurityRulesDisabled(async (ctx) => {
    const { createdAt: _c, updatedAt: _u, ...rest } = newEntry(userId, offsetDays, { status, ...extra });
    await setDoc(doc(ctx.firestore(), `time_entries/${id}`), rest);
  });

describe("proyectos asignados", () => {
  const mode = (m: "open" | "assigned" | null) => env.withSecurityRulesDisabled(async (ctx) => {
    if (m === null) await deleteDoc(doc(ctx.firestore(), "settings/main"));
    else await setDoc(doc(ctx.firestore(), "settings/main"), { editWindowDays: 7, projectAccess: m });
  });
  const assign = (code: string, uid: string, by: string) => ({ projectId: code, userId: uid, assignedBy: by, createdAt: serverTimestamp() });
  const seedAssignment = (code: string, uid: string) => env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), `assignments/${code}_${uid}`), { projectId: code, userId: uid, assignedBy: "ana" }); });

  it("modo asignado: sin asignación no se cargan horas; con asignación sí", async () => {
    await mode("assigned");
    const db = asRole("emi", "employee");
    await assertFails(setDoc(doc(db, "time_entries/n1"), newEntry("emi")));
    await seedAssignment("p1", "emi");
    await assertSucceeds(setDoc(doc(db, "time_entries/n1"), newEntry("emi")));
  });
  it("sin settings/main se considera modo asignado (por defecto)", async () => {
    await mode(null);
    await assertFails(setDoc(doc(asRole("emi", "employee"), "time_entries/n1"), newEntry("emi")));
  });
  it("modo abierto: cualquier proyecto sirve", async () => {
    await mode("open");
    await assertSucceeds(setDoc(doc(asRole("emi", "employee"), "time_entries/n1"), newEntry("emi", 0, { projectId: "cualquiera" })));
  });
  it("una asignación a otra persona o a otro proyecto no sirve", async () => {
    await mode("assigned");
    await seedAssignment("p1", "eze");
    await seedAssignment("p2", "emi");
    await assertFails(setDoc(doc(asRole("emi", "employee"), "time_entries/n1"), newEntry("emi", 0, { projectId: "p1" })));
  });
  it("cambiar un registro propio de proyecto exige la asignación del proyecto nuevo; corregir otros datos no", async () => {
    await mode("assigned");
    await seedAssignment("p1", "emi");
    await seedEntry("d1", "emi", "draft", -1, { projectId: "p1" });
    const db = asRole("emi", "employee");
    await assertSucceeds(updateDoc(doc(db, "time_entries/d1"), { notes: "ok", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, "time_entries/d1"), { projectId: "p9", updatedAt: serverTimestamp() }));
    // se le quita la asignación y puede seguir corrigiendo otros datos de un registro viejo
    await env.withSecurityRulesDisabled(async (ctx) => { await deleteDoc(doc(ctx.firestore(), "assignments/p1_emi")); });
    await assertSucceeds(updateDoc(doc(db, "time_entries/d1"), { notes: "otra vez", updatedAt: serverTimestamp() }));
  });
  it("el admin asigna a cualquiera, y también a sí mismo", async () => {
    await assertSucceeds(setDoc(doc(asRole("ana", "admin"), "assignments/p1_emi"), assign("p1", "emi", "ana")));
    await assertSucceeds(setDoc(doc(asRole("ana", "admin"), "assignments/p1_olga"), assign("p1", "olga", "ana")));
    await assertSucceeds(setDoc(doc(asRole("ana", "admin"), "assignments/p1_ana"), assign("p1", "ana", "ana")));
  });
  it("el supervisor asigna solo a su equipo, no a sí mismo ni a otro equipo", async () => {
    const sup = asRole("sofia", "supervisor");
    await assertSucceeds(setDoc(doc(sup, "assignments/p1_emi"), assign("p1", "emi", "sofia")));
    await assertFails(setDoc(doc(sup, "assignments/p1_olga"), assign("p1", "olga", "sofia")));
    await assertFails(setDoc(doc(sup, "assignments/p1_sofia"), assign("p1", "sofia", "sofia")));
  });
  it("un empleado no asigna: ni a sí mismo ni a otro", async () => {
    await assertFails(setDoc(doc(asRole("emi", "employee"), "assignments/p1_emi"), assign("p1", "emi", "emi")));
    await assertFails(setDoc(doc(asRole("emi", "employee"), "assignments/p1_eze"), assign("p1", "eze", "emi")));
  });
  it("valida la forma: id = proyecto_persona, 'assignedBy' propio, proyecto existente, sin campos de más", async () => {
    const admin = asRole("ana", "admin");
    await assertFails(setDoc(doc(admin, "assignments/cualquiera"), assign("p1", "emi", "ana")));
    await assertFails(setDoc(doc(admin, "assignments/p1_emi"), assign("p1", "emi", "otro")));
    await assertFails(setDoc(doc(admin, "assignments/inexistente_emi"), assign("inexistente", "emi", "ana")));
    await assertFails(setDoc(doc(admin, "assignments/p1_emi"), { ...assign("p1", "emi", "ana"), extra: 1 }));
  });
  it("quitar la asignación: admin y el supervisor de la persona sí; el empleado y otros supervisores no", async () => {
    await seedAssignment("p1", "emi");
    await assertFails(deleteDoc(doc(asRole("emi", "employee"), "assignments/p1_emi")));
    await assertFails(deleteDoc(doc(asRole("eze", "employee"), "assignments/p1_emi")));
    await assertSucceeds(deleteDoc(doc(asRole("sofia", "supervisor"), "assignments/p1_emi")));
    await seedAssignment("p1", "olga");
    await assertFails(deleteDoc(doc(asRole("sofia", "supervisor"), "assignments/p1_olga")));
    await assertSucceeds(deleteDoc(doc(asRole("ana", "admin"), "assignments/p1_olga")));
  });
  it("lectura: cada persona ve las suyas; el supervisor las de su equipo; el admin todas; nadie las de otros", async () => {
    await seedAssignment("p1", "emi"); await seedAssignment("p1", "olga");
    await assertSucceeds(getDocs(query(collection(asRole("emi", "employee"), "assignments"), where("userId", "==", "emi"))));
    await assertFails(getDocs(query(collection(asRole("emi", "employee"), "assignments"), where("userId", "==", "eze"))));
    await assertFails(getDocs(collection(asRole("emi", "employee"), "assignments")));
    await assertSucceeds(getDocs(query(collection(asRole("sofia", "supervisor"), "assignments"), where("userId", "in", ["emi", "eze"]))));
    await assertFails(getDocs(query(collection(asRole("sofia", "supervisor"), "assignments"), where("userId", "==", "olga"))));
    await assertSucceeds(getDocs(collection(asRole("ana", "admin"), "assignments")));
  });
});

describe("acceso sin rol", () => {
  it("sin sesión no lee nada", async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "users/emi")));
  });
  it("con sesión pero sin custom claim de rol no lee ni escribe", async () => {
    const db = asRole("emi");
    await assertFails(getDoc(doc(db, "users/emi")));
    await assertFails(setDoc(doc(db, "time_entries/x"), newEntry("emi")));
  });
  it("un rol inventado no sirve", async () => {
    await assertFails(getDoc(doc(asRole("emi", "superadmin"), "users/emi")));
  });
  it("las colecciones sin regla están denegadas", async () => {
    await assertFails(getDoc(doc(asRole("ana", "admin"), "otra_cosa/x")));
  });
});

describe("módulos activables (solo el Configurador)", () => {
  const cfg = () => configuratorDb();
  const features = (over: Record<string, unknown> = {}) => ({ modules: { compensation: true, performance: false, payroll: false }, payModel: "salary", ...over });

  it("el Configurador escribe y lee los módulos", async () => {
    await assertSucceeds(setDoc(doc(cfg(), "settings/features"), features({ modules: { compensation: true, performance: true, payroll: true }, payModel: "hourly" })));
    await assertSucceeds(getDoc(doc(cfg(), "settings/features")));
  });
  it("el administrador de la pyme NO puede activar módulos ni cambiar el modelo de pago", async () => {
    const admin = asRole("ana", "admin");
    await assertFails(setDoc(doc(admin, "settings/features"), features()));
    await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), "settings/features"), features()); });
    await assertFails(updateDoc(doc(admin, "settings/features"), { payModel: "hourly" }));
    await assertFails(deleteDoc(doc(admin, "settings/features")));
  });
  it("el administrador sí sigue editando el resto de la configuración", async () => {
    await assertSucceeds(setDoc(doc(asRole("ana", "admin"), "settings/main"), { editWindowDays: 7, companyName: "X" }));
  });
  it("todos los roles pueden leer qué módulos hay activos (para mostrar u ocultar pantallas)", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), "settings/features"), features()); });
    for (const [uid, role] of [["ana", "admin"], ["sofia", "supervisor"], ["emi", "employee"]] as const) await assertSucceeds(getDoc(doc(asRole(uid, role), "settings/features")));
  });
  it("sin sesión o sin rol no se lee", async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "settings/features")));
    await assertFails(getDoc(doc(asRole("emi"), "settings/features")));
  });
  it("un módulo no puede quedar activo sin su base", async () => {
    await assertFails(setDoc(doc(cfg(), "settings/features"), features({ modules: { compensation: false, performance: true, payroll: false } })));
    await assertFails(setDoc(doc(cfg(), "settings/features"), features({ modules: { compensation: false, performance: false, payroll: true } })));
  });
  it("rechaza formas inválidas: modelo de pago desconocido, módulos de más, campos extra", async () => {
    await assertFails(setDoc(doc(cfg(), "settings/features"), features({ payModel: "semanal" })));
    await assertFails(setDoc(doc(cfg(), "settings/features"), features({ modules: { compensation: true, magia: true } })));
    await assertFails(setDoc(doc(cfg(), "settings/features"), { ...features(), extra: 1 }));
    await assertFails(setDoc(doc(cfg(), "settings/features"), features({ modules: { compensation: "si" } })));
  });
  it("el Configurador no tiene acceso a los datos de la empresa", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), "time_entries/t1"), { userId: "emi" }); });
    const c = cfg();
    await assertFails(getDoc(doc(c, "time_entries/t1")));
    await assertFails(getDoc(doc(c, "users/emi")));
    await assertFails(getDoc(doc(c, "employee_private/emi")));
    await assertSucceeds(getDoc(doc(c, "settings/main"))); // solo para ver el nombre de la empresa
  });
  it("un usuario con rol no escribe módulos", async () => {
    await assertFails(setDoc(doc(asRole("ana", "admin"), "settings/features"), features()));
  });
  it("solo vale el correo exacto, verificado y con Google: cualquier otra cosa es rechazada", async () => {
    const as = (token: Record<string, unknown>) => env.authenticatedContext("x", token).firestore();
    const write = (db: ReturnType<typeof as>) => setDoc(doc(db, "settings/features"), features());
    // otra cuenta de Google
    await assertFails(write(as({ email: "otra.persona@gmail.com", email_verified: true, firebase: { sign_in_provider: "google.com" } })));
    // el mismo correo pero con contraseña (no con Google)
    await assertFails(write(as({ email: CONFIGURATOR, email_verified: true, firebase: { sign_in_provider: "password" } })));
    // el mismo correo sin verificar
    await assertFails(write(as({ email: CONFIGURATOR, email_verified: false, firebase: { sign_in_provider: "google.com" } })));
    // variantes del correo
    await assertFails(write(as({ email: CONFIGURATOR.toUpperCase(), email_verified: true, firebase: { sign_in_provider: "google.com" } })));
    await assertFails(write(as({ email: "x" + CONFIGURATOR, email_verified: true, firebase: { sign_in_provider: "google.com" } })));
    // un claim "configurator" ya no sirve de nada
    await assertFails(write(as({ configurator: true })));
    // sin sesión
    await assertFails(write(env.unauthenticatedContext().firestore()));
    // el correcto sí
    await assertSucceeds(write(as({ email: CONFIGURATOR, email_verified: true, firebase: { sign_in_provider: "google.com" } })));
  });
  it("una sesión por contraseña del mismo correo, aunque sea admin de la pyme, no activa módulos", async () => {
    const adminByPassword = env.authenticatedContext("ana", { role: "admin", email: CONFIGURATOR, email_verified: true, firebase: { sign_in_provider: "password" } }).firestore();
    await assertFails(setDoc(doc(adminByPassword, "settings/features"), features()));
  });
});

describe("sueldos en el legajo (módulo Sueldos)", () => {
  const turnOn = (on: boolean) => env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "settings/features"), { modules: { compensation: on, performance: false, payroll: false }, payModel: "salary" });
  });
  const pay = (uid = "emi", extra: Record<string, unknown> = {}) => ({ userId: uid, rates: [{ from: "2026-01-01", amount: 800000, setBy: "a@x", setAt: "2026-01-01T00:00:00Z" }], convenio: true, obraSocial: "OSDE", hijos: 1, updatedAt: serverTimestamp(), updatedBy: "a@x", ...extra });
  const seedPay = () => env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), "employee_pay/emi"), { userId: "emi", rates: [], convenio: true, obraSocial: "", hijos: 0 }); });

  it("con el módulo apagado nadie lee ni escribe sueldos, ni siquiera el admin", async () => {
    await turnOn(false); await seedPay();
    const admin = asRole("ana", "admin");
    await assertFails(getDoc(doc(admin, "employee_pay/emi")));
    await assertFails(setDoc(doc(admin, "employee_pay/emi"), pay()));
  });
  it("sin el documento de módulos tampoco (todo apagado por defecto)", async () => {
    await seedPay();
    await assertFails(getDoc(doc(asRole("ana", "admin"), "employee_pay/emi")));
  });
  it("con el módulo activo el admin lee y escribe", async () => {
    await turnOn(true); await seedPay();
    const admin = asRole("ana", "admin");
    await assertSucceeds(getDoc(doc(admin, "employee_pay/emi")));
    await assertSucceeds(setDoc(doc(admin, "employee_pay/emi"), pay()));
  });
  it("supervisor, empleado (aunque sea el dueño del dato) y Configurador no lo ven nunca", async () => {
    await turnOn(true); await seedPay();
    await assertFails(getDoc(doc(asRole("sofia", "supervisor"), "employee_pay/emi")));
    await assertFails(getDoc(doc(asRole("emi", "employee"), "employee_pay/emi")));
    await assertFails(getDoc(doc(configuratorDb(), "employee_pay/emi")));
    await assertFails(setDoc(doc(asRole("emi", "employee"), "employee_pay/emi"), pay()));
  });
  it("valida la forma: userId debe ser el del documento, hijos sin valores absurdos, sin campos de más", async () => {
    await turnOn(true);
    const admin = asRole("ana", "admin");
    await assertFails(setDoc(doc(admin, "employee_pay/emi"), pay("eze")));
    await assertFails(setDoc(doc(admin, "employee_pay/emi"), pay("emi", { hijos: -1 })));
    await assertFails(setDoc(doc(admin, "employee_pay/emi"), pay("emi", { hijos: 99 })));
    await assertFails(setDoc(doc(admin, "employee_pay/emi"), pay("emi", { rates: "mucho" })));
    await assertFails(setDoc(doc(admin, "employee_pay/emi"), pay("emi", { sueldoOculto: 1 })));
  });
});

describe("rendimiento (módulo): tarifas de proyecto y parámetros de costos", () => {
  const modules = (m: Record<string, boolean>) => env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "settings/features"), { modules: { compensation: true, performance: false, payroll: false, ...m }, payModel: "salary" });
  });
  const admin = () => asRole("ana", "admin");

  it("con el módulo apagado el admin no lee ni escribe tarifas ni parámetros de costos", async () => {
    await modules({ performance: false });
    await assertFails(setDoc(doc(admin(), "project_rates/p1"), { hourlyRate: 10000, billable: true }));
    await assertFails(setDoc(doc(admin(), "settings/costing"), { employerContributionsPct: 20, monthlyHours: 160 }));
    await assertFails(getDoc(doc(admin(), "settings/costing")));
  });
  it("con el módulo activo el admin las lee y escribe", async () => {
    await modules({ performance: true });
    await assertSucceeds(setDoc(doc(admin(), "project_rates/p1"), { hourlyRate: 10000, billable: true }));
    await assertSucceeds(getDoc(doc(admin(), "project_rates/p1")));
    await assertSucceeds(setDoc(doc(admin(), "settings/costing"), { employerContributionsPct: 24, monthlyHours: 160 }));
    await assertSucceeds(getDoc(doc(admin(), "settings/costing")));
  });
  it("el resto del equipo no ve las tarifas ni los parámetros, aunque el módulo esté activo", async () => {
    await modules({ performance: true });
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "project_rates/p1"), { hourlyRate: 10000, billable: true });
      await setDoc(doc(ctx.firestore(), "settings/costing"), { employerContributionsPct: 24, monthlyHours: 160 });
    });
    for (const [uid, role] of [["sofia", "supervisor"], ["emi", "employee"]] as const) {
      await assertFails(getDoc(doc(asRole(uid, role), "project_rates/p1")));
      await assertFails(getDoc(doc(asRole(uid, role), "settings/costing")));
    }
    await assertFails(getDoc(doc(configuratorDb(), "settings/costing")));
  });
  it("valida la forma de la tarifa y de los parámetros", async () => {
    await modules({ performance: true });
    await assertFails(setDoc(doc(admin(), "project_rates/p1"), { hourlyRate: -1, billable: true }));
    await assertFails(setDoc(doc(admin(), "project_rates/p1"), { hourlyRate: 1, billable: "si" }));
    await assertFails(setDoc(doc(admin(), "project_rates/p1"), { hourlyRate: 1, billable: true, extra: 1 }));
    await assertFails(setDoc(doc(admin(), "settings/costing"), { employerContributionsPct: 500, monthlyHours: 160 }));
    await assertFails(setDoc(doc(admin(), "settings/costing"), { employerContributionsPct: 10, monthlyHours: 0 }));
  });
  it("el admin sigue pudiendo editar otros documentos de settings, pero no se escapa a los protegidos por el comodín", async () => {
    await modules({ performance: false });
    await assertSucceeds(setDoc(doc(admin(), "settings/main"), { editWindowDays: 7 }));
    await assertFails(setDoc(doc(admin(), "settings/costing"), { employerContributionsPct: 1, monthlyHours: 160 }));
    await assertFails(setDoc(doc(admin(), "settings/payroll"), { cualquier: "cosa" }));
  });
});

describe("liquidación (módulo): recibos, parámetros y cierre de período", () => {
  const modules = (payroll: boolean) => env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "settings/features"), { modules: { compensation: true, performance: false, payroll }, payModel: "salary" });
  });
  const admin = () => asRole("ana", "admin");
  const slip = (uid = "emi", period = "2026-11", extra: Record<string, unknown> = {}) => ({ userId: uid, period, manual: {}, result: { neto: 1 }, rate: 1, payModel: "salary", snapshot: { fullName: "X" }, published: false, createdAt: serverTimestamp(), createdBy: "a@x", ...extra });
  const closePeriod = (period: string, closed = true) => env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), `payroll_periods/${period}`), { closed }); });

  it("con el módulo apagado nada de esto se lee ni se escribe", async () => {
    await modules(false);
    await assertFails(setDoc(doc(admin(), "payslips/emi_2026-11"), slip()));
    await assertFails(setDoc(doc(admin(), "payroll_periods/2026-11"), { closed: true }));
    await assertFails(setDoc(doc(admin(), "settings/payroll"), { params: {}, visibility: {} }));
  });
  it("con el módulo activo el admin guarda recibos y parámetros", async () => {
    await modules(true);
    await assertSucceeds(setDoc(doc(admin(), "payslips/emi_2026-11"), slip()));
    await assertSucceeds(getDoc(doc(admin(), "payslips/emi_2026-11")));
    await assertSucceeds(setDoc(doc(admin(), "settings/payroll"), { params: { a: 1 }, visibility: {}, updatedAt: serverTimestamp(), updatedBy: "a@x" }));
  });
  it("un recibo sin publicar no lo ve nadie salvo el admin; ni el dueño, ni el supervisor, ni el Configurador", async () => {
    await modules(true);
    await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), "payslips/emi_2026-11"), slip("emi", "2026-11", { createdAt: new Date() })); });
    for (const [uid, role] of [["sofia", "supervisor"], ["emi", "employee"], ["eze", "employee"]] as const) {
      await assertFails(getDoc(doc(asRole(uid, role), "payslips/emi_2026-11")));
      await assertFails(setDoc(doc(asRole(uid, role), "payslips/emi_2026-11"), slip()));
    }
    await assertFails(getDoc(doc(configuratorDb(), "payslips/emi_2026-11")));
  });
  it("publicado: lo ve su dueño y nadie más (ni el supervisor ni otro empleado); el dueño no puede modificarlo", async () => {
    await modules(true);
    await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), "payslips/emi_2026-11"), slip("emi", "2026-11", { createdAt: new Date(), published: true })); });
    await assertSucceeds(getDoc(doc(asRole("emi", "employee"), "payslips/emi_2026-11")));
    await assertSucceeds(getDocs(query(collection(asRole("emi", "employee"), "payslips"), where("userId", "==", "emi"), where("published", "==", true))));
    await assertFails(getDoc(doc(asRole("eze", "employee"), "payslips/emi_2026-11")));
    await assertFails(getDoc(doc(asRole("sofia", "supervisor"), "payslips/emi_2026-11")));
    await assertFails(getDocs(query(collection(asRole("emi", "employee"), "payslips"), where("userId", "==", "emi")))); // sin acotar a publicados
    await assertFails(getDocs(collection(asRole("emi", "employee"), "payslips")));
    await assertFails(updateDoc(doc(asRole("emi", "employee"), "payslips/emi_2026-11"), { rate: 9 }));
    await assertFails(deleteDoc(doc(asRole("emi", "employee"), "payslips/emi_2026-11")));
  });
  it("con el módulo apagado ni el dueño de un recibo publicado lo ve", async () => {
    await modules(false);
    await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), "payslips/emi_2026-11"), slip("emi", "2026-11", { createdAt: new Date(), published: true })); });
    await assertFails(getDoc(doc(asRole("emi", "employee"), "payslips/emi_2026-11")));
  });
  it("el admin publica y retira la publicación, incluso con el período cerrado, pero no cambia nada más", async () => {
    await modules(true);
    await assertSucceeds(setDoc(doc(admin(), "payslips/emi_2026-11"), slip()));
    await closePeriod("2026-11");
    await assertSucceeds(updateDoc(doc(admin(), "payslips/emi_2026-11"), { published: true, publishedAt: serverTimestamp(), publishedBy: "a@x" }));
    await assertSucceeds(getDoc(doc(asRole("emi", "employee"), "payslips/emi_2026-11")));
    await assertSucceeds(updateDoc(doc(admin(), "payslips/emi_2026-11"), { published: false, publishedAt: serverTimestamp(), publishedBy: "a@x" }));
    await assertFails(updateDoc(doc(admin(), "payslips/emi_2026-11"), { rate: 5 })); // cerrado: no se toca el contenido
    await assertFails(updateDoc(doc(admin(), "payslips/emi_2026-11"), { published: true, rate: 5 })); // ni a escondidas junto con la publicación
  });
  it("el id del recibo tiene que ser usuario_período y el período válido", async () => {
    await modules(true);
    await assertFails(setDoc(doc(admin(), "payslips/cualquiera"), slip()));
    await assertFails(setDoc(doc(admin(), "payslips/emi_2026-13"), slip("emi", "2026-13")));
    await assertFails(setDoc(doc(admin(), "payslips/eze_2026-11"), slip("emi", "2026-11")));
    await assertFails(setDoc(doc(admin(), "payslips/emi_2026-11"), slip("emi", "2026-11", { extra: 1 })));
  });
  it("un período cerrado bloquea crear, cambiar y borrar recibos; al reabrirlo vuelve a andar", async () => {
    await modules(true);
    await assertSucceeds(setDoc(doc(admin(), "payslips/emi_2026-11"), slip()));
    await closePeriod("2026-11");
    await assertFails(setDoc(doc(admin(), "payslips/emi_2026-11"), slip("emi", "2026-11", { rate: 2 })));
    await assertFails(setDoc(doc(admin(), "payslips/eze_2026-11"), slip("eze", "2026-11")));
    await assertFails(deleteDoc(doc(admin(), "payslips/emi_2026-11")));
    await assertSucceeds(setDoc(doc(admin(), "payslips/emi_2026-10"), slip("emi", "2026-10"))); // otro mes sigue abierto
    await assertSucceeds(setDoc(doc(admin(), "payroll_periods/2026-11"), { closed: false, reopenedAt: serverTimestamp(), reopenedBy: "a@x" }));
    await assertSucceeds(setDoc(doc(admin(), "payslips/emi_2026-11"), slip("emi", "2026-11", { rate: 2 })));
  });
  it("el admin cierra un período, con forma válida", async () => {
    await modules(true);
    await assertSucceeds(setDoc(doc(admin(), "payroll_periods/2026-11"), { closed: true, closedAt: serverTimestamp(), closedBy: "a@x" }));
    await assertFails(setDoc(doc(admin(), "payroll_periods/noviembre"), { closed: true }));
    await assertFails(setDoc(doc(admin(), "payroll_periods/2026-12"), { closed: "si" }));
  });
});

describe("baja de una persona", () => {
  it("con el perfil dado de baja pierde el acceso aunque el token siga vigente", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => { await updateDoc(doc(ctx.firestore(), "users/emi"), { active: false }); });
    const db = asRole("emi", "employee");
    await assertFails(getDoc(doc(db, "users/emi")));
    await assertFails(getDoc(doc(db, "projects/p1")));
    await assertFails(setDoc(doc(db, "time_entries/n1"), newEntry("emi")));
  });
  it("un administrador dado de baja tampoco entra", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => { await updateDoc(doc(ctx.firestore(), "users/ana"), { active: false }); });
    await assertFails(getDoc(doc(asRole("ana", "admin"), "employee_private/emi")));
  });
  it("sin perfil en users no hay acceso, aunque tenga el claim", async () => {
    await assertFails(getDoc(doc(asRole("fantasma", "admin"), "projects/p1")));
  });
  it("el admin da de baja y reactiva a una persona", async () => {
    const db = asRole("ana", "admin");
    await assertSucceeds(updateDoc(doc(db, "users/emi"), { active: false }));
    await assertSucceeds(updateDoc(doc(db, "users/emi"), { active: true }));
    await assertSucceeds(getDoc(doc(asRole("emi", "employee"), "users/emi")));
  });
});

describe("ficha del empleado (la edita el admin)", () => {
  it("el admin edita los datos laborales y la jornada, pero no puede tocar el rol ni los campos de sistema", async () => {
    const db = asRole("ana", "admin");
    await assertSucceeds(updateDoc(doc(db, "users/emi"), { fullName: "Emi Demo", employeeNumber: "1005", department: "Técnica", position: "Analista", hireDate: "2021-06-07", supervisorId: "sofia", workSchedule: { mon: { start: "09:00", end: "18:00" } } }));
    await assertFails(updateDoc(doc(db, "users/emi"), { role: "admin" }));
    await assertFails(updateDoc(doc(db, "users/emi"), { uid: "otro" }));
  });
  it("el admin guarda CUIL, DNI, teléfono y modalidad en employee_private", async () => {
    await assertSucceeds(setDoc(doc(asRole("ana", "admin"), "employee_private/emi"), { userId: "emi", cuil: "27-00000105-4", dni: "00.000.105", phone: "11 5555-0105", workMode: "hybrid" }));
  });
  it("nadie más lee ni escribe los datos personales", async () => {
    for (const [uid, role] of [["sofia", "supervisor"], ["emi", "employee"], ["eze", "employee"]] as const) {
      await assertFails(getDoc(doc(asRole(uid, role), "employee_private/emi")));
      await assertFails(setDoc(doc(asRole(uid, role), "employee_private/emi"), { cuil: "x" }));
    }
  });
});

describe("perfiles y datos sensibles", () => {
  it("cualquier usuario con rol lee los perfiles del equipo", async () => {
    await assertSucceeds(getDoc(doc(asRole("emi", "employee"), "users/eze")));
  });
  it("el empleado no lee employee_private, ni siquiera el propio", async () => {
    await assertFails(getDoc(doc(asRole("emi", "employee"), "employee_private/emi")));
  });
  it("el supervisor no lee employee_private", async () => {
    await assertFails(getDoc(doc(asRole("sofia", "supervisor"), "employee_private/emi")));
  });
  it("el admin lee y escribe employee_private", async () => {
    const db = asRole("ana", "admin");
    await assertSucceeds(getDoc(doc(db, "employee_private/emi")));
    await assertSucceeds(updateDoc(doc(db, "employee_private/emi"), { phone: "11 5555-0000" }));
  });
  it("el admin edita el perfil pero no puede cambiar el rol copiado", async () => {
    const db = asRole("ana", "admin");
    await assertSucceeds(updateDoc(doc(db, "users/emi"), { position: "Analista" }));
    await assertFails(updateDoc(doc(db, "users/emi"), { role: "admin" }));
  });
  it("un empleado no edita ni su propio perfil", async () => {
    await assertFails(updateDoc(doc(asRole("emi", "employee"), "users/emi"), { position: "Gerente" }));
  });
  it("nadie crea ni borra perfiles desde el cliente", async () => {
    await assertFails(setDoc(doc(asRole("ana", "admin"), "users/nuevo"), { fullName: "N", active: true }));
    await assertFails(deleteDoc(doc(asRole("ana", "admin"), "users/emi")));
  });
});

describe("configuración de la empresa", () => {
  it("todos leen, solo el admin escribe", async () => {
    await assertSucceeds(getDoc(doc(asRole("emi", "employee"), "settings/main")));
    await assertSucceeds(getDoc(doc(asRole("emi", "employee"), "projects/p1")));
    await assertFails(setDoc(doc(asRole("sofia", "supervisor"), "settings/main"), { editWindowDays: 365 }));
    await assertFails(setDoc(doc(asRole("emi", "employee"), "holidays/2026-12-08"), { name: "x" }));
    await assertSucceeds(setDoc(doc(asRole("ana", "admin"), "holidays/2026-12-08"), { name: "Inmaculada Concepción" }));
  });
});

describe("registros de horas: lectura", () => {
  beforeEach(async () => {
    await seedEntry("e-emi", "emi", "submitted");
    await seedEntry("e-olga", "olga", "submitted");
  });
  it("el empleado lee solo los propios", async () => {
    const db = asRole("emi", "employee");
    await assertSucceeds(getDoc(doc(db, "time_entries/e-emi")));
    await assertFails(getDoc(doc(db, "time_entries/e-olga")));
    await assertSucceeds(getDocs(query(collection(db, "time_entries"), where("userId", "==", "emi"))));
    await assertFails(getDocs(collection(db, "time_entries")));
  });
  it("el supervisor lee los de su equipo y no los de otro equipo", async () => {
    const db = asRole("sofia", "supervisor");
    await assertSucceeds(getDoc(doc(db, "time_entries/e-emi")));
    await assertFails(getDoc(doc(db, "time_entries/e-olga")));
  });
  it("el supervisor consulta a todo su equipo con un solo 'in' de varias personas", async () => {
    await seedEntry("e-eze", "eze", "submitted");
    const db = asRole("sofia", "supervisor");
    await assertSucceeds(getDocs(query(collection(db, "time_entries"), where("userId", "in", ["emi", "eze"]), where("status", "==", "submitted"))));
  });
  it("el supervisor consulta a una persona de su equipo por igualdad", async () => {
    const db = asRole("sofia", "supervisor");
    await assertSucceeds(getDocs(query(collection(db, "time_entries"), where("userId", "==", "emi"), where("status", "==", "submitted"))));
  });
  it("el supervisor no puede consultar a alguien de otro equipo ni mezclarlo en un 'in'", async () => {
    const db = asRole("sofia", "supervisor");
    await assertFails(getDocs(query(collection(db, "time_entries"), where("userId", "==", "olga"), where("status", "==", "submitted"))));
    await assertFails(getDocs(query(collection(db, "time_entries"), where("userId", "in", ["emi", "olga"]), where("status", "==", "submitted"))));
  });
  it("el admin consulta todos los enviados", async () => {
    await assertSucceeds(getDocs(query(collection(asRole("ana", "admin"), "time_entries"), where("status", "==", "submitted"))));
  });
  it("el admin lee todos", async () => {
    const db = asRole("ana", "admin");
    await assertSucceeds(getDoc(doc(db, "time_entries/e-emi")));
    await assertSucceeds(getDoc(doc(db, "time_entries/e-olga")));
  });
});

describe("registros de horas: carga del empleado", () => {
  it("carga un registro propio de hoy", async () => {
    await assertSucceeds(setDoc(doc(asRole("emi", "employee"), "time_entries/n1"), newEntry("emi")));
  });
  it("carga como borrador y dentro de la ventana de 7 días", async () => {
    const db = asRole("emi", "employee");
    await assertSucceeds(setDoc(doc(db, "time_entries/n1"), newEntry("emi", -6, { status: "draft" })));
  });
  it("no carga fuera de la ventana de edición", async () => {
    await assertFails(setDoc(doc(asRole("emi", "employee"), "time_entries/n1"), newEntry("emi", -10)));
  });
  it("sin editWindowDays en settings/main usa 7 días por defecto", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), "settings/main"), { projectAccess: "open" }); });
    const db = asRole("emi", "employee");
    await assertSucceeds(setDoc(doc(db, "time_entries/n1"), newEntry("emi", -6)));
    await assertFails(setDoc(doc(db, "time_entries/n2"), newEntry("emi", -10)));
  });
  it("respeta una ventana distinta configurada por la empresa", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), "settings/main"), { editWindowDays: 30, projectAccess: "open" }); });
    await assertSucceeds(setDoc(doc(asRole("emi", "employee"), "time_entries/n1"), newEntry("emi", -20)));
  });
  it("no carga en el futuro lejano", async () => {
    await assertFails(setDoc(doc(asRole("emi", "employee"), "time_entries/n1"), newEntry("emi", 5)));
  });
  it("no carga a nombre de otro", async () => {
    await assertFails(setDoc(doc(asRole("emi", "employee"), "time_entries/n1"), newEntry("eze")));
  });
  it("no se puede crear ya aprobado ni con horas calculadas", async () => {
    const db = asRole("emi", "employee");
    await assertFails(setDoc(doc(db, "time_entries/n1"), newEntry("emi", 0, { status: "approved" })));
    await assertFails(setDoc(doc(db, "time_entries/n2"), newEntry("emi", 0, { hours: 99 })));
    await assertFails(setDoc(doc(db, "time_entries/n3"), newEntry("emi", 0, { breakdown: { normal: 99 } })));
  });
  it("no se aceptan campos que no existen en el modelo", async () => {
    await assertFails(setDoc(doc(asRole("emi", "employee"), "time_entries/n1"), newEntry("emi", 0, { extra: 1 })));
  });
  it("el admin también puede cargar sus propias horas", async () => {
    await assertSucceeds(setDoc(doc(asRole("ana", "admin"), "time_entries/n1"), newEntry("ana")));
  });
});

describe("registros de horas: edición", () => {
  it("el dueño corrige un borrador y lo envía", async () => {
    await seedEntry("d1", "emi", "draft");
    await assertSucceeds(updateDoc(doc(asRole("emi", "employee"), "time_entries/d1"), { endTime: "18:00", status: "submitted", updatedAt: serverTimestamp() }));
  });
  it("el dueño corrige un registro observado", async () => {
    await seedEntry("o1", "emi", "observed", -1, { reviewerNote: "Revisá el horario" });
    await assertSucceeds(updateDoc(doc(asRole("emi", "employee"), "time_entries/o1"), { startTime: "09:00", status: "submitted", updatedAt: serverTimestamp() }));
  });
  it("el dueño no edita uno enviado ni uno aprobado", async () => {
    await seedEntry("s1", "emi", "submitted");
    await seedEntry("a1", "emi", "approved", -1, { hours: 8, breakdown: { normal: 8 } });
    const db = asRole("emi", "employee");
    await assertFails(updateDoc(doc(db, "time_entries/s1"), { endTime: "20:00", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, "time_entries/a1"), { endTime: "20:00", updatedAt: serverTimestamp() }));
  });
  it("el dueño no se aprueba solo ni se escribe horas", async () => {
    await seedEntry("d1", "emi", "draft");
    const db = asRole("emi", "employee");
    await assertFails(updateDoc(doc(db, "time_entries/d1"), { status: "approved" }));
    await assertFails(updateDoc(doc(db, "time_entries/d1"), { hours: 12, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, "time_entries/d1"), { userId: "eze", updatedAt: serverTimestamp() }));
  });
  it("no edita registros viejos aunque sean borrador", async () => {
    await seedEntry("old", "emi", "draft", -15);
    await assertFails(updateDoc(doc(asRole("emi", "employee"), "time_entries/old"), { notes: "tarde", updatedAt: serverTimestamp() }));
  });
  it("otro empleado no edita un registro ajeno", async () => {
    await seedEntry("d1", "emi", "draft");
    await assertFails(updateDoc(doc(asRole("eze", "employee"), "time_entries/d1"), { notes: "x", updatedAt: serverTimestamp() }));
  });
  it("borra solo borradores propios", async () => {
    await seedEntry("d1", "emi", "draft");
    await seedEntry("s1", "emi", "submitted");
    const db = asRole("emi", "employee");
    await assertFails(deleteDoc(doc(db, "time_entries/s1")));
    await assertSucceeds(deleteDoc(doc(db, "time_entries/d1")));
  });
});

describe("registros de horas: aprobación", () => {
  beforeEach(async () => {
    await seedEntry("s1", "emi", "submitted");
    await seedEntry("s-olga", "olga", "submitted");
  });
  const approve = (by: string) => ({ status: "approved", reviewedBy: by, reviewedAt: serverTimestamp(), hours: 9, breakdown: { normal: 8, ot50: 1 } });

  it("el supervisor aprueba a su equipo y congela horas y desglose", async () => {
    await assertSucceeds(updateDoc(doc(asRole("sofia", "supervisor"), "time_entries/s1"), approve("sofia")));
  });
  it("el supervisor no aprueba a alguien de otro equipo", async () => {
    await assertFails(updateDoc(doc(asRole("sofia", "supervisor"), "time_entries/s-olga"), approve("sofia")));
  });
  it("el admin aprueba a cualquiera", async () => {
    await assertSucceeds(updateDoc(doc(asRole("ana", "admin"), "time_entries/s-olga"), approve("ana")));
  });
  it("aprobar exige horas y desglose", async () => {
    await assertFails(updateDoc(doc(asRole("sofia", "supervisor"), "time_entries/s1"), { status: "approved", reviewedBy: "sofia", reviewedAt: serverTimestamp() }));
  });
  it("observar exige una nota", async () => {
    const db = asRole("sofia", "supervisor");
    await assertFails(updateDoc(doc(db, "time_entries/s1"), { status: "observed", reviewedBy: "sofia", reviewedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(db, "time_entries/s1"), { status: "observed", reviewerNote: "Falta el ticket", reviewedBy: "sofia", reviewedAt: serverTimestamp() }));
  });
  it("el revisor no puede cambiar la franja horaria ni el dueño", async () => {
    const db = asRole("sofia", "supervisor");
    await assertFails(updateDoc(doc(db, "time_entries/s1"), { ...approve("sofia"), endTime: "23:00" }));
    await assertFails(updateDoc(doc(db, "time_entries/s1"), { ...approve("sofia"), userId: "sofia" }));
  });
  it("el revisor debe figurar como quien aprobó", async () => {
    await assertFails(updateDoc(doc(asRole("sofia", "supervisor"), "time_entries/s1"), approve("ana")));
  });
  it("un supervisor no aprueba sus propias horas, el admin sí", async () => {
    await seedEntry("s-sofia", "sofia", "submitted");
    await assertFails(updateDoc(doc(asRole("sofia", "supervisor"), "time_entries/s-sofia"), approve("sofia")));
    await assertSucceeds(updateDoc(doc(asRole("ana", "admin"), "time_entries/s-sofia"), approve("ana")));
  });
  it("un registro aprobado queda congelado, también para quien aprobó", async () => {
    await updateDoc(doc(asRole("sofia", "supervisor"), "time_entries/s1"), approve("sofia"));
    await assertFails(updateDoc(doc(asRole("sofia", "supervisor"), "time_entries/s1"), { status: "observed", reviewerNote: "me arrepentí", reviewedBy: "sofia" }));
    await assertFails(updateDoc(doc(asRole("ana", "admin"), "time_entries/s1"), { hours: 1 }));
  });
  it("un borrador no se puede aprobar", async () => {
    await seedEntry("d1", "emi", "draft");
    await assertFails(updateDoc(doc(asRole("sofia", "supervisor"), "time_entries/d1"), approve("sofia")));
  });
  it("el empleado no aprueba a un compañero", async () => {
    await assertFails(updateDoc(doc(asRole("eze", "employee"), "time_entries/s1"), approve("eze")));
  });
});

describe("licencias", () => {
  const request = (userId: string, extra: Record<string, unknown> = {}) => ({
    userId, type: "vacation", startDate: "2026-12-14", endDate: "2026-12-18", daysCount: 5, reason: "", status: "pending", createdBy: userId, createdAt: serverTimestamp(), ...extra,
  });
  const seedLeave = (id: string, userId: string, status = "pending", type = "vacation") =>
    env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `leave_requests/${id}`), { userId, type, startDate: "2026-12-14", endDate: "2026-12-18", daysCount: 5, status, createdBy: userId });
    });

  it("el empleado solicita una licencia propia pendiente", async () => {
    await assertSucceeds(setDoc(doc(asRole("emi", "employee"), "leave_requests/l1"), request("emi")));
  });
  it("no solicita para otro, ni ya aprobada, ni de tipo injustificada", async () => {
    const db = asRole("emi", "employee");
    await assertFails(setDoc(doc(db, "leave_requests/l1"), request("eze", { createdBy: "emi" })));
    await assertFails(setDoc(doc(db, "leave_requests/l2"), request("emi", { status: "approved" })));
    await assertFails(setDoc(doc(db, "leave_requests/l3"), request("emi", { type: "unjustified" })));
  });
  it("el supervisor registra una injustificada de su equipo ya aprobada", async () => {
    await assertSucceeds(setDoc(doc(asRole("sofia", "supervisor"), "leave_requests/u1"), request("emi", { type: "unjustified", status: "approved", createdBy: "sofia", approvedBy: "sofia" })));
  });
  it("el supervisor no registra una injustificada de otro equipo", async () => {
    await assertFails(setDoc(doc(asRole("sofia", "supervisor"), "leave_requests/u1"), request("olga", { type: "unjustified", status: "approved", createdBy: "sofia", approvedBy: "sofia" })));
  });
  it("el supervisor aprueba o rechaza las de su equipo", async () => {
    await seedLeave("l1", "emi");
    await seedLeave("l-olga", "olga");
    const db = asRole("sofia", "supervisor");
    await assertSucceeds(updateDoc(doc(db, "leave_requests/l1"), { status: "approved", approvedBy: "sofia", decidedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, "leave_requests/l-olga"), { status: "approved", approvedBy: "sofia", decidedAt: serverTimestamp() }));
  });
  it("el empleado no aprueba su propia licencia", async () => {
    await seedLeave("l1", "emi");
    await assertFails(updateDoc(doc(asRole("emi", "employee"), "leave_requests/l1"), { status: "approved", approvedBy: "emi" }));
  });
  it("el supervisor no se aprueba su propia licencia, el admin sí", async () => {
    await seedLeave("l-sofia", "sofia");
    await assertFails(updateDoc(doc(asRole("sofia", "supervisor"), "leave_requests/l-sofia"), { status: "approved", approvedBy: "sofia" }));
    await assertSucceeds(updateDoc(doc(asRole("ana", "admin"), "leave_requests/l-sofia"), { status: "approved", approvedBy: "ana", decidedAt: serverTimestamp() }));
  });
  it("una licencia decidida no se modifica", async () => {
    await seedLeave("l1", "emi", "approved");
    await assertFails(updateDoc(doc(asRole("ana", "admin"), "leave_requests/l1"), { status: "rejected", approvedBy: "ana" }));
  });
  it("el empleado lee las suyas y no las de otros; solo retira las pendientes", async () => {
    await seedLeave("l1", "emi");
    await seedLeave("l2", "eze");
    await seedLeave("l3", "emi", "approved");
    const db = asRole("emi", "employee");
    await assertSucceeds(getDoc(doc(db, "leave_requests/l1")));
    await assertFails(getDoc(doc(db, "leave_requests/l2")));
    await assertSucceeds(deleteDoc(doc(db, "leave_requests/l1")));
    await assertFails(deleteDoc(doc(db, "leave_requests/l3")));
  });
});

describe("licencias: las escrituras en lote que hace la app", () => {
  const seedLeave = (id: string, userId: string) =>
    env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `leave_requests/${id}`), { userId, type: "vacation", startDate: "2026-12-14", endDate: "2026-12-18", daysCount: 5, status: "pending", createdBy: userId });
    });
  const approveBatch = (db: ReturnType<typeof asRole>, id: string, userId: string, by: string) => {
    const b = db.batch();
    b.update(db.doc(`leave_requests/${id}`), { status: "approved", approvedBy: by, decidedAt: serverTimestamp() });
    b.set(db.doc(`team_absences/${id}`), { userId, startDate: "2026-12-14", endDate: "2026-12-18", leaveId: id });
    return b.commit();
  };

  it("el supervisor aprueba y publica la ausencia en un solo paso", async () => {
    await seedLeave("l1", "emi");
    await assertSucceeds(approveBatch(asRole("sofia", "supervisor"), "l1", "emi", "sofia"));
    await assertSucceeds(getDoc(doc(asRole("eze", "employee"), "team_absences/l1")));
  });
  it("un supervisor no aprueba ni publica la ausencia de otro equipo", async () => {
    await seedLeave("l-olga", "olga");
    await assertFails(approveBatch(asRole("sofia", "supervisor"), "l-olga", "olga", "sofia"));
  });
  it("el empleado no publica ausencias en el calendario", async () => {
    await assertFails(setDoc(doc(asRole("emi", "employee"), "team_absences/x"), { userId: "emi", startDate: "2026-12-14", endDate: "2026-12-14", leaveId: "x" }));
  });
  it("el supervisor registra una injustificada de su equipo y la publica en un solo paso", async () => {
    const db = asRole("sofia", "supervisor");
    const b = db.batch();
    b.set(db.doc("leave_requests/u1"), { userId: "emi", type: "unjustified", startDate: "2026-11-24", endDate: "2026-11-24", daysCount: 1, reason: "", status: "approved", createdBy: "sofia", approvedBy: "sofia", decidedAt: serverTimestamp(), createdAt: serverTimestamp() });
    b.set(db.doc("team_absences/u1"), { userId: "emi", startDate: "2026-11-24", endDate: "2026-11-24", leaveId: "u1" });
    await assertSucceeds(b.commit());
  });
  it("el empleado solicita sin los campos de decisión y no puede pedir 'other'", async () => {
    const db = asRole("emi", "employee");
    await assertSucceeds(setDoc(doc(db, "leave_requests/r1"), { userId: "emi", type: "sick", startDate: "2026-11-24", endDate: "2026-11-25", daysCount: 2, reason: "Gripe", status: "pending", createdBy: "emi", createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db, "leave_requests/r2"), { userId: "emi", type: "other", startDate: "2026-11-24", endDate: "2026-11-25", daysCount: 2, reason: "", status: "pending", createdBy: "emi", createdAt: serverTimestamp() }));
  });
});

describe("calendario de ausencias del equipo", () => {
  it("todos lo ven, pero solo quien aprueba lo escribe y sin el tipo de licencia", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "team_absences/t1"), { userId: "emi", startDate: "2026-12-14", endDate: "2026-12-18", leaveId: "l1" });
    });
    await assertSucceeds(getDoc(doc(asRole("eze", "employee"), "team_absences/t1")));
    await assertFails(setDoc(doc(asRole("eze", "employee"), "team_absences/t2"), { userId: "eze", startDate: "2026-12-14", endDate: "2026-12-14", leaveId: "l2" }));
    const sup = asRole("sofia", "supervisor");
    await assertSucceeds(setDoc(doc(sup, "team_absences/t2"), { userId: "emi", startDate: "2026-12-14", endDate: "2026-12-14", leaveId: "l2" }));
    await assertFails(setDoc(doc(sup, "team_absences/t3"), { userId: "emi", startDate: "2026-12-14", endDate: "2026-12-14", leaveId: "l3", type: "sick" }));
  });
});
