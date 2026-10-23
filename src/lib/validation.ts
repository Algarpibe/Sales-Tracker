import { z } from "zod";
import { userRole, recordType } from "@/db/schema";
import { KPI_CON_PLAZO, KPI_FIRST_YEAR, KPI_KEYS } from "@/lib/commercial-kpis";
import { HISTORY_FIRST_YEAR } from "@/lib/constants";

// Esquemas reutilizables para validar input de Server Actions en runtime
// (TypeScript no valida en runtime). Los enums se derivan del schema Drizzle
// para que coincidan siempre con la BD.

export const uuidSchema = z.string().uuid("ID inválido");
export const roleSchema = z.enum(userRole.enumValues);
export const recordTypeSchema = z.enum(recordType.enumValues);

const currentYear = new Date().getFullYear();

export const salesRecordSchema = z.object({
  category_id: uuidSchema,
  record_type: recordTypeSchema,
  amount_usd: z.number().finite().min(0).max(1_000_000_000),
  record_month: z.number().int().min(1).max(12),
  record_year: z.number().int().min(2000).max(currentYear + 1),
  notes: z.string().max(2000).optional(),
});

// Filtros de las lecturas del zoho-hub. Acotan el trabajo que una petición puede
// pedir a Postgres: años desde el primero con historia real (2015, el histórico de
// /clientes) hasta el siguiente al actual, y rangos con el inicio antes del final.
// Las lecturas lanzan si no validan (react-query lo maneja), como el resto.
// HISTORY_FIRST_YEAR vive en @/lib/constants (lo usan componentes de cliente); se
// reexporta aquí por compatibilidad.
export { HISTORY_FIRST_YEAR };

export const hubYearSchema = z
  .number()
  .int("Año inválido")
  .min(HISTORY_FIRST_YEAR, `El año no puede ser anterior a ${HISTORY_FIRST_YEAR}`)
  .max(currentYear + 1, "Año fuera de rango");

export const hubYearRangeSchema = z
  .object({ desdeAnio: hubYearSchema, hastaAnio: hubYearSchema })
  .refine((v) => v.desdeAnio <= v.hastaAnio, {
    message: "El año inicial no puede ser posterior al final",
    path: ["hastaAnio"],
  });

const hubDateSchema = z.iso
  .date("Fecha inválida")
  .refine((d) => hubYearSchema.safeParse(Number(d.slice(0, 4))).success, "Fecha fuera de rango");

// Fechas YYYY-MM-DD: el orden de texto coincide con el cronológico.
export const hubDateRangeSchema = z
  .object({ desde: hubDateSchema, hasta: hubDateSchema })
  .refine((v) => v.desde <= v.hasta, {
    message: "La fecha inicial no puede ser posterior a la final",
    path: ["hasta"],
  });

export const hubOrderSearchSchema = z.string().max(100, "La búsqueda admite 100 caracteres como mucho");

// Cliente de la ficha /clientes/[customer] (DATA-046): el nombre tal cual viene del
// hub, sin recortar, porque se compara por igualdad exacta. Mismo tope que un favorito.
export const hubCustomerSchema = z
  .string()
  .min(1, "Falta el cliente")
  .max(300, "El nombre del cliente admite 300 caracteres como mucho");

// Preferencias por usuario (SEC-036): acotan lo que un usuario puede guardar.
// La clave de vista la fija el código (p. ej. "clientes"); 64 caracteres sobran.
export const savedViewKeySchema = z
  .string()
  .min(1, "Falta la clave de la vista")
  .max(64, "La clave de la vista admite 64 caracteres como mucho");

// Nombre de cliente tal cual viene del hub (no se recorta: es la identidad del
// favorito). 300 caracteres cubren de sobra cualquier razón social.
export const favoriteCustomerSchema = z
  .string()
  .min(1, "Falta el cliente")
  .max(300, "El nombre del cliente admite 300 caracteres como mucho");

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color hex inválido").optional(),
});

export const categoryUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color hex inválido").optional(),
  is_active: z.boolean().optional(),
});

export const accountUpdateSchema = z.object({
  full_name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email("Email inválido").max(200).optional(),
});

export const companyUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  tax_id: z.string().max(50).nullish(),
  country: z.string().max(100).nullish(),
  industry: z.string().max(100).nullish(),
  logo_url: z.string().max(2000).nullish(),
});

// Metas y pesos de un ámbito: el total de la compañía (salesperson nulo) o un
// vendedor. Solo se envían los KPIs que se miden ese año en ese ámbito, y sus
// pesos suman 100. Los dos decimales son los que admite la columna numeric:
// aceptar más haría que lo guardado no cuadrase con lo validado.
export const kpiTargetsSchema = z
  .object({
    year: z.number().int().min(KPI_FIRST_YEAR).max(currentYear + 1),
    salesperson: z.string().trim().min(1, "El vendedor no puede ir vacío").max(120).nullable(),
    items: z
      .array(
        z.object({
          kpi_key: z.string().refine((k) => KPI_KEYS.includes(k), "KPI desconocido"),
          target_value: z.number().positive("La meta debe ser mayor que cero").multipleOf(0.01, "La meta admite dos decimales como mucho"),
          weight_pct: z.number().min(0).max(100).multipleOf(0.01, "El peso admite dos decimales como mucho"),
          // Horas laborables del plazo de tickets. Opcional y nulo en el resto de KPIs:
          // la columna es numeric(6,2) y 999 h ya son meses de jornada.
          plazo_horas: z
            .number()
            .positive("El plazo debe ser mayor que cero")
            .max(999, "El plazo admite 999 horas como mucho")
            .multipleOf(0.01, "El plazo admite dos decimales como mucho")
            .nullable()
            .optional(),
        })
      )
      .min(1, "Hay que enviar al menos un KPI"),
  })
  .refine(
    (v) => Math.round(v.items.reduce((s, i) => s + i.weight_pct, 0) * 100) === 10000,
    { message: "Los pesos deben sumar 100", path: ["items"] }
  )
  // El plazo solo tiene sentido en tickets_st: es el único KPI que lo lee. Cada ámbito
  // (el total y cada vendedor) guarda el suyo; en otro KPI sería un dato que nadie lee.
  .refine(
    (v) => v.items.every((i) => i.plazo_horas == null || i.kpi_key === KPI_CON_PLAZO),
    { message: "El plazo solo se configura en Tickets de Servicio Técnico en plazo", path: ["items"] }
  );

// Clasificación de Servicio Técnico: ids de las categorías de cada grupo. Una
// categoría no puede estar en los dos grupos: la columna solo guarda un valor, y
// si llegase en los dos, el segundo UPDATE pisaría al primero sin avisar. Las listas
// vacías valen, porque un grupo sin categorías suma 0.
const idsDeCategoria = z
  .array(uuidSchema)
  .max(1000, "Demasiadas categorías")
  .refine((ids) => new Set(ids).size === ids.length, "Hay categorías repetidas en un grupo");

export const techServiceBucketsSchema = z
  .object({ st: idsDeCategoria, cr: idsDeCategoria })
  .refine((v) => !v.st.some((id) => v.cr.includes(id)), {
    message: "Una categoría no puede estar en ST y en C&R a la vez",
    path: ["cr"],
  });

// Macro-categorías: ids de las categorías de cada una de las cuatro. Como en Servicio
// Técnico, una categoría no puede estar en dos: la columna guarda un solo valor, y el
// último UPDATE pisaría a los anteriores sin avisar. Las listas vacías valen: lo que no
// está en ninguna cuenta como Equipos.
export const macroCategoriasSchema = z
  .object({
    mano_obra: idsDeCategoria,
    cr: idsDeCategoria,
    equipos: idsDeCategoria,
    operacion: idsDeCategoria,
  })
  .refine(
    (v) => {
      const todos = [...v.mano_obra, ...v.cr, ...v.equipos, ...v.operacion];
      return new Set(todos).size === todos.length;
    },
    { message: "Una categoría no puede estar en dos macro-categorías a la vez", path: ["operacion"] }
  );
