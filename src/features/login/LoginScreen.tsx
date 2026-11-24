import { horusBrand } from "@/config/horus.brand";
import { ROLES, ROLE_LABELS, type Role, type SessionUser } from "@/domain/types";
import { useSession } from "@/session/SessionContext";

// Usuarios de prueba, solo para desarrollo local. No existen en un build de producción.
const DEV_USERS: Record<Role, SessionUser> = {
  admin: { uid: "dev-admin", fullName: "Admin Desarrollo", email: "admin@demo.example", role: "admin" },
  supervisor: { uid: "dev-supervisor", fullName: "Supervisor Desarrollo", email: "supervisor@demo.example", role: "supervisor" },
  employee: { uid: "dev-employee", fullName: "Empleado Desarrollo", email: "empleado@demo.example", role: "employee" },
};

/** La app siempre abre con la marca Horus. */
export function LoginScreen() {
  const { signIn } = useSession();
  const devEntry = import.meta.env.DEV;

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-8 bg-bg px-6 py-12 text-fg">
      <div className="flex flex-col items-center gap-4">
        <img src={horusBrand.iconUrl} alt="" className="size-28 rounded-3xl shadow-lg" />
        <h1 className="text-3xl font-semibold tracking-tight">{horusBrand.name}</h1>
      </div>

      {devEntry ? (
        <section className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5" aria-label="Entrada de desarrollo">
          <h2 className="text-sm font-medium text-fg">Entrada de desarrollo</h2>
          <p className="mt-1 text-xs text-muted">
            Solo existe en desarrollo local. El inicio de sesión real se conecta en la próxima etapa.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            {ROLES.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => signIn(DEV_USERS[role])}
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-on-primary hover:brightness-110"
              >
                Entrar como {ROLE_LABELS[role]}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <p className="max-w-sm text-center text-sm text-muted">El inicio de sesión todavía no está disponible.</p>
      )}
    </div>
  );
}
