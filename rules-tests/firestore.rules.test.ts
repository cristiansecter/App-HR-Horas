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
    await setDoc(doc(db, "settings/main"), { editWindowDays: 7 });
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
  it("sin settings/main usa 7 días por defecto", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => { await deleteDoc(doc(ctx.firestore(), "settings/main")); });
    const db = asRole("emi", "employee");
    await assertSucceeds(setDoc(doc(db, "time_entries/n1"), newEntry("emi", -6)));
    await assertFails(setDoc(doc(db, "time_entries/n2"), newEntry("emi", -10)));
  });
  it("respeta una ventana distinta configurada por la empresa", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), "settings/main"), { editWindowDays: 30 }); });
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
