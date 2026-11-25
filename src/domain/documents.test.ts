import { describe, expect, it } from "vitest";
import { canDelete, canRead, canUpload, fileProblems, isValidPeriod, MAX_FILE_BYTES, safeFileName, titleProblems } from "./documents";

describe("fileProblems", () => {
  it("acepta PDF e imágenes comunes dentro del tamaño", () => {
    for (const type of ["application/pdf", "image/jpeg", "image/png", "image/webp"]) expect(fileProblems({ name: "a", type, size: 1000 })).toEqual([]);
  });
  it("rechaza otros tipos (SVG, ejecutables, HEIC, texto)", () => {
    for (const type of ["image/svg+xml", "text/html", "application/x-msdownload", "image/heic", ""]) expect(fileProblems({ name: "a", type, size: 1000 })).toHaveLength(1);
  });
  it("un PDF de más de 700 KB se rechaza con el tamaño en el mensaje; una imagen grande no (se achica sola)", () => {
    expect(fileProblems({ name: "a.pdf", type: "application/pdf", size: MAX_FILE_BYTES })).toEqual([]);
    expect(fileProblems({ name: "a.pdf", type: "application/pdf", size: MAX_FILE_BYTES + 1 })[0]).toMatch(/pesa 700 KB|pesa 7\d\d KB/);
    expect(fileProblems({ name: "a.jpg", type: "image/jpeg", size: 8_000_000 })).toEqual([]);
  });
  it("rechaza archivos vacíos", () => expect(fileProblems({ name: "a.pdf", type: "application/pdf", size: 0 })).toHaveLength(1));
});

describe("safeFileName", () => {
  it("saca rutas y caracteres raros, y conserva tildes", () => {
    expect(safeFileName("C:\\Users\\yo\\Certificado médico.pdf")).toBe("Certificado médico.pdf");
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName('a<b>"c|d?.pdf')).toBe("abcd.pdf");
  });
  it("nunca devuelve vacío y acota el largo", () => {
    expect(safeFileName("///")).toBe("documento");
    expect(safeFileName("x".repeat(500)).length).toBe(120);
  });
});

describe("título y período", () => {
  it("el título es obligatorio y acotado", () => {
    expect(titleProblems("  ")).toHaveLength(1);
    expect(titleProblems("Certificado médico")).toEqual([]);
    expect(titleProblems("x".repeat(121))).toHaveLength(1);
  });
  it("período AAAA-MM válido", () => {
    expect(isValidPeriod("2026-11")).toBe(true);
    for (const bad of ["2026-13", "2026-00", "26-11", "2026-1", "", "2026-11-01"]) expect(isValidPeriod(bad)).toBe(false);
  });
});

describe("permisos", () => {
  it("certificado: lo sube la persona (lo suyo), su supervisor (su equipo) y el admin; no un empleado por otro", () => {
    expect(canUpload("employee", "certificate", true, false)).toBe(true);
    expect(canUpload("employee", "certificate", false, false)).toBe(false);
    expect(canUpload("supervisor", "certificate", true, false)).toBe(true);
    expect(canUpload("supervisor", "certificate", false, true)).toBe(true);
    expect(canUpload("supervisor", "certificate", false, false)).toBe(false);
    expect(canUpload("admin", "certificate", false, false)).toBe(true);
  });
  it("recibo: solo lo sube el admin", () => {
    expect(canUpload("admin", "receipt", false, false)).toBe(true);
    expect(canUpload("supervisor", "receipt", false, true)).toBe(false);
    expect(canUpload("employee", "receipt", true, false)).toBe(false);
  });
  it("lectura: el dueño, el admin y, de un certificado, el supervisor; nunca un recibo ajeno para el supervisor", () => {
    expect(canRead("employee", "receipt", true, false)).toBe(true);
    expect(canRead("employee", "certificate", false, false)).toBe(false);
    expect(canRead("supervisor", "certificate", false, true)).toBe(true);
    expect(canRead("supervisor", "receipt", false, true)).toBe(false);
    expect(canRead("supervisor", "certificate", false, false)).toBe(false);
    expect(canRead("admin", "receipt", false, false)).toBe(true);
  });
  it("borra el admin o quien lo subió", () => {
    expect(canDelete("admin", "x", "y")).toBe(true);
    expect(canDelete("employee", "me", "me")).toBe(true);
    expect(canDelete("employee", "other", "me")).toBe(false);
  });
});
