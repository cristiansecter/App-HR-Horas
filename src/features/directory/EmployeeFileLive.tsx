import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useCompany } from "@/company/CompanyContext";
import { isValidIsoDate } from "@/domain/dates";
import { checkCuil, checkDni } from "@/domain/employee/identity";
import { WORK_MODE_LABELS, type EmployeePrivate, type UserSummary, type WorkMode } from "@/domain/model";
import type { WorkSchedule } from "@/domain/overtime";
import { ROLE_LABELS } from "@/domain/types";
import { listUsers } from "@/services/company";
import { DIRECTORY_CHANGED, getEmployeePrivate, saveEmployee } from "@/services/directory";
import { withCode } from "@/services/errors";
import { Chip, Page, PageHeader } from "@/ui/Page";
import { useToast } from "@/ui/Toast";
import { useAsync } from "@/ui/useAsync";
import ExpirationsSection from "./ExpirationsSection";
import PaySection from "./PaySection";
import { ScheduleEditor, scheduleProblems } from "./ScheduleEditor";

const field = "w-full rounded-lg border border-white/10 bg-surface-container-lowest px-3 py-2.5 font-body-md text-body-md text-on-surface focus:border-primary-container focus:outline-hidden";

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl bg-surface-container-low p-space-lg shadow-md">
      <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">{title}</h2>
      {hint ? <p className="mt-1 mb-space-md font-body-sm text-body-sm text-on-surface-variant">{hint}</p> : <div className="mb-space-md" />}
      {children}
    </section>
  );
}

function Label({ text, hint, children }: { text: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block font-label-lg text-label-lg text-on-surface">
      {text} {hint ? <span className="font-label-xs-mono text-label-xs-mono text-on-surface-variant uppercase">{hint}</span> : null}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

/** Ficha del empleado con datos reales: la edita el administrador. */
export default function EmployeeFileLive() {
  const [params] = useSearchParams();
  const uid = params.get("uid") ?? "";
  const { data, loading, error } = useAsync(
    async () => {
      const users = await listUsers();
      const user = users.find((u) => u.uid === uid) ?? null;
      return { users, user, sensitive: user ? await getEmployeePrivate(uid) : null };
    },
    [uid],
    [DIRECTORY_CHANGED],
  );

  const back = <Link to="/directorio" className="flex items-center gap-1 font-label-lg text-label-lg font-semibold text-primary hover:underline"><span className="material-symbols-outlined text-[18px]">arrow_back</span>Volver al directorio</Link>;

  if (loading && !data) return <Page><p className="text-on-surface-variant">Cargando la ficha…</p></Page>;
  if (error) return <Page>{back}<p role="alert" className="rounded-lg bg-error/10 px-3 py-2 font-body-sm text-body-sm text-error">{error}</p></Page>;
  if (!data?.user || !data.sensitive) return <Page>{back}<p className="text-on-surface-variant">No encontramos a esa persona.</p></Page>;
  return <FileForm key={`${data.user.uid}-${JSON.stringify(data.user)}`} user={data.user} sensitive={data.sensitive} people={data.users} back={back} />;
}

function FileForm({ user, sensitive, people, back }: { user: UserSummary; sensitive: EmployeePrivate; people: UserSummary[]; back: ReactNode }) {
  const company = useCompany();
  const { notify } = useToast();
  const [fullName, setFullName] = useState(user.fullName);
  const [employeeNumber, setEmployeeNumber] = useState(user.employeeNumber ?? "");
  const [department, setDepartment] = useState(user.department ?? "");
  const [position, setPosition] = useState(user.position ?? "");
  const [hireDate, setHireDate] = useState(user.hireDate ?? "");
  const [supervisorId, setSupervisorId] = useState(user.supervisorId ?? "");
  const [active, setActive] = useState(user.active);
  const [customSchedule, setCustomSchedule] = useState(user.workSchedule !== undefined);
  const [schedule, setSchedule] = useState<WorkSchedule>(user.workSchedule ?? company.defaultSchedule);
  const [cuil, setCuil] = useState(sensitive.cuil);
  const [dni, setDni] = useState(sensitive.dni);
  const [phone, setPhone] = useState(sensitive.phone);
  const [workMode, setWorkMode] = useState<WorkMode | "">(sensitive.workMode ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const supervisors = useMemo(() => people.filter((p) => p.uid !== user.uid && p.active && p.role !== "employee"), [people, user.uid]);
  const cuilCheck = checkCuil(cuil);
  const dniCheck = checkDni(dni);
  const problems: string[] = [];
  if (!fullName.trim()) problems.push("Falta el nombre completo.");
  if (hireDate && !isValidIsoDate(hireDate)) problems.push("La fecha de ingreso no es válida.");
  if (!cuilCheck.ok && cuilCheck.blocking) problems.push(cuilCheck.message);
  if (!dniCheck.ok) problems.push(dniCheck.message);
  if (customSchedule) problems.push(...scheduleProblems(schedule));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (problems.length > 0) return setSaveError("Revisá los datos marcados antes de guardar.");
    setSaving(true);
    setSaveError(null);
    try {
      await saveEmployee(
        user.uid,
        { fullName, employeeNumber, department, position, hireDate, supervisorId: supervisorId || null, workSchedule: customSchedule ? schedule : null, active },
        { cuil: cuilCheck.formatted, dni: dniCheck.formatted, phone, workMode: workMode || null },
      );
    } catch (err) {
      console.error("No se pudo guardar la ficha", err);
      setSaveError(withCode("No se pudo guardar la ficha. Probá de nuevo.", err));
      setSaving(false);
      return;
    }
    setSaving(false);
    notify(`Guardaste la ficha de ${fullName.trim()}.`);
  };

  return (
    <Page>
      {back}
      <PageHeader
        eyebrow={`${ROLE_LABELS[user.role]} · ${user.email}`}
        title={user.fullName}
        subtitle={[user.position, user.department].filter(Boolean).join(" · ") || "Completá los datos de la ficha."}
        actions={active ? <Chip tone="ok">Activo</Chip> : <Chip tone="muted">Inactivo</Chip>}
      />

      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-space-lg">
        <Section title="Datos laborales" hint="Los ve todo el equipo en el directorio, salvo lo que está en “Datos personales”.">
          <div className="grid gap-4 md:grid-cols-2">
            <Label text="Nombre completo"><input required value={fullName} onChange={(e) => setFullName(e.target.value)} className={field} /></Label>
            <Label text="Legajo" hint="Opcional"><input value={employeeNumber} onChange={(e) => setEmployeeNumber(e.target.value)} className={field} /></Label>
            <Label text="Puesto"><input value={position} onChange={(e) => setPosition(e.target.value)} className={field} /></Label>
            <Label text="Área"><input value={department} onChange={(e) => setDepartment(e.target.value)} className={field} /></Label>
            <Label text="Fecha de ingreso"><input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} className={field} /></Label>
            <Label text="Supervisor" hint="Aprueba sus horas y licencias">
              <select value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)} className={field}>
                <option value="">Sin supervisor (lo aprueba el administrador)</option>
                {supervisors.map((s) => <option key={s.uid} value={s.uid}>{s.fullName} · {ROLE_LABELS[s.role]}</option>)}
              </select>
            </Label>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-container p-4">
            <div>
              <p className="font-label-lg text-label-lg text-on-surface">Estado: {active ? "activo" : "inactivo"}</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Una persona inactiva deja de poder entrar y no figura en el calendario. Sus registros se conservan.</p>
            </div>
            <label className="flex items-center gap-2 font-label-md text-label-md text-on-surface">
              Activo
              <input type="checkbox" role="switch" aria-label="Persona activa" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-5 accent-[var(--hz-primary)]" />
            </label>
          </div>
          <p className="mt-3 font-body-sm text-body-sm text-on-surface-variant">Rol: <strong className="text-on-surface">{ROLE_LABELS[user.role]}</strong>. Los cambios de rol los hace el Configurador.</p>
        </Section>

        <Section title="Datos personales" hint="Solo los ve el administrador. El CUIL sale en la planilla para el contador.">
          <div className="grid gap-4 md:grid-cols-2">
            <Label text="CUIL" hint="Opcional">
              <input value={cuil} onChange={(e) => setCuil(e.target.value)} onBlur={() => setCuil(cuilCheck.formatted)} inputMode="numeric" placeholder="20-12345678-6" className={field} />
              {!cuilCheck.ok ? <p role={cuilCheck.blocking ? "alert" : "status"} className={`mt-1 font-body-sm text-body-sm ${cuilCheck.blocking ? "text-error" : "text-amber-300"}`}>{cuilCheck.message}</p> : null}
            </Label>
            <Label text="DNI" hint="Opcional">
              <input value={dni} onChange={(e) => setDni(e.target.value)} onBlur={() => setDni(dniCheck.formatted)} inputMode="numeric" placeholder="12.345.678" className={field} />
              {!dniCheck.ok ? <p role="alert" className="mt-1 font-body-sm text-body-sm text-error">{dniCheck.message}</p> : null}
            </Label>
            <Label text="Teléfono" hint="Opcional"><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className={field} /></Label>
            <Label text="Modalidad">
              <select value={workMode} onChange={(e) => setWorkMode(e.target.value as WorkMode | "")} className={field}>
                <option value="">Sin definir</option>
                {(Object.keys(WORK_MODE_LABELS) as WorkMode[]).map((m) => <option key={m} value={m}>{WORK_MODE_LABELS[m]}</option>)}
              </select>
            </Label>
          </div>
        </Section>

        <Section title="Jornada laboral" hint="Define qué horas son normales y cuáles son extra, y qué días hábiles cuentan en una licencia.">
          <div className="mb-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo de jornada">
            {[
              [false, `Usa la jornada de la empresa`],
              [true, "Jornada propia"],
            ].map(([value, label]) => (
              <button key={String(label)} type="button" role="radio" aria-checked={customSchedule === value} onClick={() => setCustomSchedule(value as boolean)} className={`rounded-lg px-4 py-2 font-label-lg text-label-lg ${customSchedule === value ? "bg-primary-container font-bold text-on-primary" : "bg-surface-container-high text-on-surface-variant hover:text-on-surface"}`}>
                {label as string}
              </button>
            ))}
          </div>
          {customSchedule ? <ScheduleEditor value={schedule} onChange={setSchedule} /> : <p className="font-body-md text-body-md text-on-surface-variant">Esta persona sigue la jornada general de la empresa. Elegí “Jornada propia” si trabaja otros días u horarios.</p>}
        </Section>

        {saveError || problems.length > 0 ? (
          <ul role="alert" className="space-y-1 rounded-lg bg-error/10 px-3 py-2 font-body-sm text-body-sm text-error">
            {saveError ? <li>{saveError}</li> : null}
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        ) : null}

        <div className="flex justify-end gap-3">
          <Link to="/directorio" className="px-4 py-2.5 font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface">Cancelar</Link>
          <button type="submit" disabled={saving} className="rounded-xl bg-primary-container px-6 py-2.5 font-label-lg text-label-lg font-bold text-on-primary hover:brightness-110 disabled:opacity-50">{saving ? "Guardando…" : "Guardar ficha"}</button>
        </div>
      </form>

      <ExpirationsSection uid={user.uid} fullName={user.fullName} />

      {company.features.modules.compensation ? <PaySection uid={user.uid} fullName={user.fullName} /> : null}
    </Page>
  );
}
