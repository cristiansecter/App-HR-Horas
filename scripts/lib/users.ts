import { randomInt } from "node:crypto";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { ROLES, type Role } from "../../src/domain/types";

export interface NewUser {
  email: string;
  fullName: string;
  role: Role;
  /** Contraseña inicial. Si falta se genera una al azar. */
  password?: string;
  supervisorEmail?: string;
  department?: string;
  position?: string;
  employeeNumber?: string;
  hireDate?: string;
}

export const assertRole = (value: string): Role => {
  if (!(ROLES as readonly string[]).includes(value)) throw new Error(`Rol inválido "${value}". Usá admin, supervisor o employee.`);
  return value as Role;
};

/** Contraseña inicial legible y sin caracteres confusos. La persona debería cambiarla en su primer ingreso. */
export const generatePassword = (): string => {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 14 }, () => alphabet[randomInt(alphabet.length)]).join("");
};

/**
 * Crea (o actualiza, si el email ya existe) la cuenta de Auth, le asigna el rol como custom claim y escribe su
 * perfil en `users/{uid}`. No toca datos sensibles: CUIL, DNI y teléfono van aparte, en `employee_private`.
 */
export async function upsertUser(auth: Auth, db: Firestore, input: NewUser): Promise<{ uid: string; password?: string; created: boolean }> {
  const email = input.email.trim().toLowerCase();
  let supervisorId: string | undefined;
  if (input.supervisorEmail) {
    supervisorId = (await auth.getUserByEmail(input.supervisorEmail.trim().toLowerCase())).uid;
  }

  let uid: string;
  let password: string | undefined;
  let created = false;
  try {
    const existing = await auth.getUserByEmail(email);
    uid = existing.uid;
    await auth.updateUser(uid, { displayName: input.fullName, disabled: false });
  } catch (e) {
    if ((e as { code?: string }).code !== "auth/user-not-found") throw e;
    password = input.password ?? generatePassword();
    const user = await auth.createUser({ email, password, displayName: input.fullName, emailVerified: false });
    uid = user.uid;
    created = true;
  }

  await auth.setCustomUserClaims(uid, { role: input.role });

  const profile: Record<string, unknown> = {
    fullName: input.fullName,
    email,
    role: input.role,
    active: true,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (supervisorId) profile.supervisorId = supervisorId;
  for (const key of ["department", "position", "employeeNumber", "hireDate"] as const) {
    if (input[key]) profile[key] = input[key];
  }
  const ref = db.doc(`users/${uid}`);
  if (!(await ref.get()).exists) profile.createdAt = FieldValue.serverTimestamp();
  await ref.set(profile, { merge: true });

  return { uid, password, created };
}
