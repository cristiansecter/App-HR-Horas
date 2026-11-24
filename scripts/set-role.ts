/**
 * Cambia el rol de una persona (custom claim `role`). Solo lo hace el Configurador: el administrador de la
 * empresa no puede cambiar roles desde la app ni desde Firestore.
 *
 *   npx tsx scripts/set-role.ts --email persona@empresa.com --role supervisor --key clave.json
 *
 * La persona ve el cambio la próxima vez que inicia sesión (o en hasta una hora si ya tenía la sesión abierta).
 */
import { assertRole } from "./lib/users";
import { connect, parseArgs } from "./lib/admin";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = args.require("email").trim().toLowerCase();
  const role = assertRole(args.require("role"));
  const { auth, db, projectId } = connect(args);

  const user = await auth.getUserByEmail(email);
  const before = (user.customClaims?.role as string | undefined) ?? "(sin rol)";
  await auth.setCustomUserClaims(user.uid, { ...user.customClaims, role });
  // El perfil guarda una copia informativa del rol; la fuente de verdad es el claim.
  await db.doc(`users/${user.uid}`).set({ role }, { merge: true });
  await auth.revokeRefreshTokens(user.uid);

  console.log(`Instancia: ${projectId}`);
  console.log(`${email}: ${before} → ${role}`);
  console.log("Se cerraron sus sesiones abiertas: al volver a entrar ya tiene el rol nuevo.");
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
