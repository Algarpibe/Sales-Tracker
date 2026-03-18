# Estándares de Desarrollo - SalesTracker Pro

Este documento define las reglas de oro para mantener la calidad y la estética premium del proyecto.

## 🎨 Identidad Visual (Antigravity Premium)
Para que cualquier nuevo componente se sienta parte del sistema "Antigravity", debe seguir estas reglas:
1.  **Glassmorphism**: Fondo blanco o negro con opacidad al 40-60% y desenfoque (blur) de fondo de al menos `24px` (`backdrop-blur-xl`).
2.  **Iluminación Interna**: Usar gradientes radiales sutiles dentro de las tarjetas para simular superficies de cristal.
3.  **Bordes de Color**: Aplicar bordes superiores delgados con los colores temáticos (Primary, Cyan, Rose, Indigo) con opacidad baja (`/20`).
4.  **Ancho Completo**: Los módulos de visualización de datos deben ocupar el **100% del ancho** disponible para una experiencia inmersiva.

## 🏗️ Arquitectura Técnica
- **Next.js Standalone**: La configuración `output: "standalone"` es obligatoria para el despliegue optimizado en Docker.
- **Dockerfile Multi-stage**: El build se realiza en 3 etapas (deps, builder, runner) para minimizar el tamaño de la imagen final.
- **Supabase**: Toda la lógica de datos debe pasar por el cliente oficial de Supabase, respetando las políticas de RLS.
- **Responsive Design**: Mobile-first es la regla. Verifica siempre cómo se ve en pantallas pequeñas.

## 🚀 Despliegue (Easypanel/VPS)
- Las variables de entorno críticas (`SUPABASE_URL`, `ANON_KEY`) deben pasarse como **Build Args** en el Dockerfile para que Next.js las incluya en el paquete cliente.
- Puerto de escucha interno: **3000**.

---
*Cualquier cambio estructural debe ser validado contra estos estándares.*
