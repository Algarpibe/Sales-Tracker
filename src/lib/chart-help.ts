// Copy centralizado de los tooltips informativos de gráficos y KPIs.
export const CHART_HELP = {
  // --- Dashboard: KPIs ---
  kpiVentasOV: "Suma de las Órdenes de Venta (ventas comprometidas) del año. El ▲▼% compara con el mismo total del año anterior.",
  kpiFacturado: "Suma de lo facturado (FAC) en el año. El ▲▼% compara con el año anterior.",
  kpiTicket: "Importe medio por Orden de Venta (total OV ÷ nº de órdenes). El ▲▼% compara con el año anterior.",
  kpiEjecucion: "Facturado ÷ Comprometido (FAC/OV) del año: cuánto de lo vendido ya se ha facturado. El Δ es en puntos frente al año anterior.",

  // --- Dashboard: gráficos ---
  barMensual: "Ventas por mes: Órdenes (OV) y Facturas (FAC). Usa las casillas para mostrar u ocultar cada serie.",
  cumulativeYoY: "Ventas acumuladas mes a mes del año actual frente al anterior. Si la línea va por encima, vas por delante del año pasado. Cambia OV/FAC con el selector.",
  executionMensual: "Ejecución de cada mes = Facturado ÷ Comprometido (FAC/OV). Muestra cómo evoluciona la conversión de venta a factura.",
  topClientesPareto: "Los 10 mayores clientes por importe (barras) y el % acumulado sobre el total (línea, regla 80/20). Cambia OV/FAC con el selector.",
  mixCategoria: "Reparto del importe entre las 4 macro-categorías (Mano de obra, Consumibles y repuestos, Equipos, Operaciones), según la clasificación de Configuración: lo que no está marcado cuenta como Equipos. Cambia OV/FAC con el selector.",

  // --- Análisis: Comercial ---
  brandMix: "Reparto del importe por marca. Muestra de qué marcas depende la facturación.",
  bucketByClient: "Importe por cliente desglosado en las 4 macro-categorías, para ver el mix de cada cliente.",
  bucketMixAnual: "Evolución anual del reparto entre las 4 macro-categorías (barras apiladas).",
  clientePareto: "Clientes ordenados por importe con su % acumulado (regla 80/20): cuántos clientes concentran la mayoría de las ventas.",
  kpisComerciales: "Cumplimiento de cada KPI frente a su meta, por periodo. El promedio anual es la media de todos los periodos medidos del año; el promedio a la fecha, solo la de los ya transcurridos, incluido el que está en curso, para que los que aún no han llegado no resten. El aporte aplica el peso, topado al 100%. El TOTAL es la suma de los aportes, anual y a la fecha, y la cobertura dice cuánto del peso tiene datos para respaldarla.",
  monthHeatmap: "Intensidad de ventas por cliente y mes: colores más fuertes = más importe. Ayuda a detectar estacionalidad por cliente.",
  nuevosVsRecurrentes: "Importe de clientes nuevos (primera compra en el año) frente a recurrentes, mes a mes.",
  estacionalidadCategoria: "Reparto mensual del importe por macro-categoría (barras apiladas): en qué meses pesa más cada tipo de negocio.",
  skuPareto: "SKUs ordenados por importe con su % acumulado (regla 80/20): qué artículos concentran las ventas.",
  topItems: "Los 15 artículos con mayor importe en el periodo.",

  // --- Análisis: Margen ---
  margenKpi: "Margen bruto estimado = Ventas − Costo estándar, solo de bienes con costo>0 (excluye servicios). Usa el costo del maestro (aproximación, no COGS real).",
  margenPorCliente: "Margen estimado por cliente (Ventas − Costo estándar). Solo bienes con costo.",
  margenPorArticulo: "Margen estimado por artículo (Ventas − Costo estándar). Solo bienes con costo. Usa el selector $/% para ver importe o porcentaje.",
  margenScatter: "Cada punto es un artículo: importe (eje X) frente al margen (eje Y). La línea en 0 es el punto de equilibrio. Usa el selector $/% para ver el margen en importe o en porcentaje.",

  // --- Análisis: Exploración / premium ---
  explorationGlobalMensual: "Ventas por mes comparando dos años (A vs B). Cambia entre Órdenes (OV) y Facturas (FAC) y elige los años con los selectores de arriba.",
  barCategoria: "Ventas por categoría (barras).",
  techService: "Comparativa financiera entre las líneas ST y C&R por periodo (mensual, trimestral o anual). Las barras son cada año; las dos líneas son el acumulado del año A (continua) y del año B (discontinua), en el eje derecho.",
  grupoEvolucion: "Evolución del importe de tus agrupaciones personalizadas a lo largo del tiempo.",
  groupingAnalysis: "Análisis de ventas por agrupaciones personalizadas de categorías.",
  historicoCategoria: "Ventas históricas por categoría seleccionada a lo largo de los años.",

  // --- Análisis: Forecast (integra el pie eliminado) ---
  forecastMes: "Proyección de cierre del mes en curso. Mezcla el run-rate diario con lo esperado según el año anterior y el ritmo del año: al principio del mes pesa lo esperado, al final lo real. El rango refleja la incertidumbre. El semáforo compara tu acumulado con el mismo punto del año pasado (En Trayectoria / En Riesgo).",
  forecastAnio: "Proyección de cierre del año. Combina la extrapolación estacional (peso de cada mes ponderado dando más importancia a los años recientes) con el ritmo interanual (YTD vs año anterior), evitando amplificar el error a principios de año. El rango refleja la dispersión de las formas históricas.",
  forecastEstacional: "Datos reales del año más la proyección de los meses restantes, usando estacionalidad ponderada por recencia y el ritmo interanual del negocio.",
  forecastCategoria: "Proyección de cierre por categoría, con la misma lógica de estacionalidad ponderada.",
  grupoForecast: "Proyección de cierre por agrupación, con la misma lógica de estacionalidad ponderada.",
} as const;
