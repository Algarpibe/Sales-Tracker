> ARCHIVADO (2026-10): obsoleto, no seguir — ver AGENTS.md

# Creación de Pestaña "KPIs" con Componentes Premium

Se requiere añadir una nueva pestaña interactiva en el panel lateral llamada **KPIs** y poblarla con indicadores de alto nivel utilizando una estética "Antigravity" (Glassmorphism, sombras sutiles, degradados limpios).

## Cambios Propuestos

### 1. Barra de Navegación (Sidebar)
Añadiremos el enlace a la nueva vista de KPIs.
#### [MODIFY] [sidebar.tsx](<ruta-local>/src/components/layout/sidebar.tsx)
- Insertar `{ href: "/kpis", label: "KPIs", icon: Activity }` (usaremos el icono Activity o Target de Lucide).

### 2. Creación de la Ruta Principal
#### [NEW] [page.tsx](<ruta-local>/src/app/(dashboard)/kpis/page.tsx)
- Página Server/Client Component encargada de hacer el *fetch* de `sales_orders` y `invoices` anuales para calcular:
  - **Backlog:** La diferencia monetaria (Sales Orders - Invoices).
  - **Ejecución:** El porcentaje `(Invoices / Sales Orders) * 100`.

### 3. Nuevos Componentes Premium (Estética Antigravity)
Estos componentes se crearán en una subcarpeta dedicada para no ensuciar las tarjetas estándar.

#### [NEW] [backlog-card.tsx](<ruta-local>/src/components/cards/premium/backlog-card.tsx)
- Implementará el diseño solicitado para el **"Backlog (Pendiente de Facturar)"**:
  - Efecto glassmorphism flotante (`backdrop-blur-md bg-white/5 border border-white/10 shadow-xl`).
  - Resalte sutil en el borde superior (`border-t-primary/50`).
  - Icono Lucide (Coins o Clock) con resplandor (`drop-shadow-[0_0_15px_rgba(var(--primary),0.5)]`).
  - Subtexto: "Ingresos comprometidos en tránsito".
  - Barra de progreso horizontal de shadcn/ui.

#### [NEW] [execution-card.tsx](<ruta-local>/src/components/cards/premium/execution-card.tsx)
- Implementará el diseño para el **"Índice de Ejecución"**:
  - Un indicador Radial Progress personalizado (svg o Recharts Pie).
  - Anillo con gradiente (azul suave a cyan vibrante).
  - Texto centrado con el porcentaje.
  - "Badge" flotante que indica el estado (ej. "On Track" verde si es superior a un umbral como el 75%, "At Risk" en naranja si no).
  - Fondo traslúcido y desenfocado idéntico al Backlog.

## Verification Plan
1. **Automated Tests:** El compilador de TypeScript y ESLint validarán que no falten importaciones ni haya tipos nulos (`NaN` o `Infinity` al dividir por cero en la Ejecución).
2. **Manual Verification:** Se pedirá al usuario que acceda a la pestaña `/kpis` para validar la correcta visualización de los estilos translúcidos, el cálculo matemático exacto entre OV y Facturas, y la responsividad de los gráficos radiales/barras de progreso en diferentes tamaños de pantalla.
