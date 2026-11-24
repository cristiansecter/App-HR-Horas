/**
 * Da de alta una persona: cuenta de acceso + rol + perfil. Hasta que esté la función "invitar usuario"
 * (requiere el plan Blaze), las altas las hace el Configurador con este script.
 *
 *   npx tsx scripts/create-user.ts --email persona@empresa.com --name "Nombre Apellido" --role employee \
 *       --supervisor jefe@empresa.com --department Operaciones --position Analista --key clave.json
 *
 * Si no pasás --password se genera una y se muestra una sola vez en pantalla.
 */
import { connect, parseArgs } from "./lib/admin";
import { assertRole, upsertUser } from "./lib/users";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { auth, db, projectId } = connect(args);
  const result = await upsertUser(auth, db, {
    email: args.require("email"),
    fullName: args.require("name"),
    role: assertRole(args.require("role")),
    password: args.get("password"),
    supervisorEmail: args.get("supervisor"),
    department: args.get("department"),
    position: args.get("position"),
    employeeNumber: args.get("employee-number"),
    hireDate: args.get("hire-date"),
  });
  console.log(`Instancia: ${projectId}`);
  console.log(`${result.created ? "Alta" : "Actualizada"}: ${args.require("email")} (uid ${result.uid})`);
  if (result.password) console.log(`Contraseña inicial (guardala ahora, no se vuelve a mostrar): ${result.password}`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
