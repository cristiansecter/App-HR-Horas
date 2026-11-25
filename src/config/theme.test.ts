import { describe, expect, it } from "vitest";
import { companyInitials, isHexColor, readableTextOn, tenantCssVariables } from "./theme";
import { tenantConfig } from "./tenant.config";

describe("tema del cliente", () => {
  it("la configuración por defecto tiene colores válidos", () => {
    expect(() => tenantCssVariables(tenantConfig.colors)).not.toThrow();
  });

  it("genera las variables CSS de marca y el color de texto legible sobre el primario", () => {
    expect(tenantCssVariables({ primary: "#112233", secondary: "#445566", accent: "#778899" })).toEqual({
      "--hz-primary": "#112233",
      "--hz-secondary": "#445566",
      "--hz-accent": "#778899",
      "--hz-on-primary": "#FFFFFF",
    });
  });

  it("elige texto oscuro sobre colores claros y blanco sobre oscuros", () => {
    expect(readableTextOn("#1ABEFB")).toBe("#090715");
    expect(readableTextOn("#FFD54A")).toBe("#090715");
    expect(readableTextOn("#0058F8")).toBe("#FFFFFF");
    expect(readableTextOn("#7A1F1F")).toBe("#FFFFFF");
  });

  it("rechaza un color mal escrito y dice cuál es", () => {
    expect(() => tenantCssVariables({ primary: "azul", secondary: "#445566", accent: "#778899" })).toThrow(/primary/);
    expect(isHexColor("#abc")).toBe(false);
    expect(isHexColor("#ABCDEF")).toBe(true);
  });

  it("arma las iniciales sin contar la forma societaria", () => {
    expect(companyInitials("Empresa Demo SRL")).toBe("ED");
    expect(companyInitials("Constructora Pampa S.A.")).toBe("CP");
    expect(companyInitials("  ")).toBe("?");
  });
});
