import { describe, expect, it } from "vitest";
import { CONFIGURATOR_EMAIL, isConfiguratorToken } from "./configurator";

const ok = { signInProvider: "google.com", email: CONFIGURATOR_EMAIL, emailVerified: true };

describe("isConfiguratorToken", () => {
  it("acepta solo el correo exacto, verificado y con Google", () => {
    expect(isConfiguratorToken(ok)).toBe(true);
  });
  it("rechaza otra cuenta de Google", () => {
    expect(isConfiguratorToken({ ...ok, email: "otra@gmail.com" })).toBe(false);
  });
  it("rechaza el mismo correo con contraseña o sin proveedor", () => {
    expect(isConfiguratorToken({ ...ok, signInProvider: "password" })).toBe(false);
    expect(isConfiguratorToken({ ...ok, signInProvider: null })).toBe(false);
  });
  it("rechaza el correo sin verificar o con otro formato", () => {
    expect(isConfiguratorToken({ ...ok, emailVerified: false })).toBe(false);
    expect(isConfiguratorToken({ ...ok, emailVerified: undefined })).toBe(false);
    expect(isConfiguratorToken({ ...ok, email: CONFIGURATOR_EMAIL.toUpperCase() })).toBe(false);
    expect(isConfiguratorToken({ ...ok, email: undefined })).toBe(false);
  });
});
