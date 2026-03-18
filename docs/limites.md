# Límites y Alcance - SalesTracker Pro

Este documento define las fronteras operativas y técnicas de la aplicación para evitar ambigüedades en el desarrollo.

## 1. Alcance Temporal (Límite de Datos)
- **Inicio**: El sistema procesa y muestra datos únicamente desde el **1 de enero de 2021**.
- **Restricción**: Cualquier registro anterior al 2021 no será procesado ni visualizado en las gráficas de evolución histórica para mantener la integridad del dashboard.

## 2. Alcance Multitenancy
- **Compañías**: El sistema está diseñado para aislamiento lógico basado en `company_id`.
- **Límite**: No existe (por ahora) un aislamiento físico de bases de datos por cliente (Single-database Multi-tenancy).

## 3. Límites en Registros de Venta
- **Tipos admitidos**: Únicamente `SALES_ORDER` y `INVOICE`. 
- **Restricción**: Otros documentos contables (notas de crédito, devoluciones, recibos de caja sueltos) no forman parte del núcleo del análisis de este dashboard.

## 4. Límites de Divisa
- **Moneda Única**: Toda la lógica financiera asume el uso de **USD**.
- **Conversión**: El sistema no realiza conversiones de moneda en tiempo real ni gestiona múltiples divisas (Multicurrency) actualmente.

## 5. Límites de Infraestructura
- **Despliegue**: Optimizado estrictamente para contenedores Docker con Next.js en modo `standalone`.
- **Base de Datos**: Requiere compatibilidad con Supabase (RLS y Auth).

---
*Este documento se actualizará a medida que el proyecto evolucione y se amplíen sus capacidades.*
