/**
 * Crea (o actualiza) la cuenta del Configurador de una instancia: el proveedor del sistema.
 * Tiene el claim `configurator` y NINGÚN rol de la pyme, así que solo puede entrar por la pestaña
 * "Configurador" y solo puede administrar los módulos y el modelo de pago (no ve datos de la empresa).
 *
 *   npx tsx scripts/create-configurator.ts --email vos@tuproveedor.com --key clave.json
 *
 * Si no pasás --password se genera una y se muestra una sola vez.
 */
import { connect, parseArgs } from "./lib/admin";
import { generatePassword } from "./lib/users";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = args.require("email").trim().toLowerCase();
  const { auth, projectId } = connect(args);

  let uid: string;
  let password: string | undefined;
  try {
    uid = (await auth.getUserByEmail(email)).uid;
    await auth.updateUser(uid, { disabled: false });
  } catch (e) {
    if ((e as { code?: string }).code !== "auth/user-not-found") throw e;
    password = args.get("password") ?? generatePassword();
    uid = (await auth.createUser({ email, password, displayName: "Configurador" })).uid;
  }
  // Un Configurador no tiene rol de la pyme: se reemplazan los claims para que nunca sea además admin.
  await auth.setCustomUserClaims(uid, { configurator: true });
  await auth.revokeRefreshTokens(uid);

  console.log(`Instancia: ${projectId}`);
  console.log(`Configurador: ${email} (uid ${uid})`);
  if (password) console.log(`Contraseña inicial (guardala ahora, no se vuelve a mostrar): ${password}`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
