# NEXO — Guía interna de publicaciones y control de calidad

**Actualizada:** 16 de octubre de 2026 · **Uso:** equipo interno NEXO · **Entorno:** sitio público `nexobyjv.online`.

Esta guía registra qué comprobar antes y después de un cambio. No sustituye asesoría legal, revisión de seguridad o prueba humana en producción.

## 1. Infraestructura actual

- **Repositorio:** `juanvisbal04/nexo-dashboard`, rama de producción `main`.
- **Sitio público:** Render static site `nexo-public`, conectado a `main`, publicación automática desde el directorio `public`.
- **Dashboard:** `dashboard.nexobyjv.online`. Es un producto diferente del sitio público; no asumir que las pruebas del sitio prueban el dashboard.
- **Supabase:** proyecto NEXO Platform. Los servicios `nora-web-chat` y `submit-demo-request` escriben datos mediante controles en el servidor. Jamás poner service-role keys en archivos del sitio.
- **Nora y Lía:** implementaciones independientes; no modificar conexiones de Lía durante una publicación del sitio NEXO.

## 2. Reglas de un lanzamiento seguro

1. **Una rama por cambio** y pull request antes de actualizar `main`. Anotar motivo, impacto, riesgos, plan de prueba y reversión.
2. Ejecutar [NEXO Mobile QA](https://github.com/juanvisbal04/nexo-dashboard/actions/workflows/nexo-mobile-qa.yml): Chromium móvil/tableta, Nora, demo y verificación HTTP del sitio público. Los tests de Nora y demo simulan las APIs: **no crean leads reales**.
3. Lighthouse calcula resultados de laboratorio, no datos de usuarios reales. Comparar versiones en el mismo entorno; no declarar ganancias a partir de una sola medición.
4. Verificar en Render que el commit esperado figure como `live`; un PR fusionado no garantiza por sí solo la publicación.
5. Probar con GET que `/`, `/demo.html`, `/catalogo.html`, `/privacidad.html` y `/404.html` respondan 200. Una ruta inválida debe responder **404 con contenido de marca**, no 200.
6. Comprobar en el sitio publicado que los scripts/CSS nuevos se entreguen con su versión. Una caché antigua puede conservar comportamientos erróneos.
7. Revisar una navegación real en teléfono antes de promocionar un nuevo flujo, especialmente WhatsApp, permisos y aceptación/rechazo de consentimientos.

## 3. Si algo falla

| Incidente | Prioridad | Acción inicial |
|---|---|---|
| Solicitudes de clientes se pierden o los datos se exponen | Crítica | Suspender el cambio afectado y revisar logs sin descargar datos personales |
| Formulario o Nora no responde | Alta | Revisar estado de la función Supabase, CORS, errores y el último despliegue |
| Portada caída, ruta válida responde 404 | Alta | Comparar commit `live` con `main` y revisar Render |
| UI rota en móvil, logo o menú | Media | Reproducir a 390/768/1024px y revertir cambio visual puntual |
| Lighthouse varía entre ejecuciones | Observación | Repetir en condiciones equivalentes y contrastar LCP, CLS y TBT |

**Reversión:** revertir el commit correspondiente mediante PR, pasar CI y verificar un nuevo `live` en Render. Para migraciones de base de datos, preparar reversión por separado: no borrar columnas, registros o políticas por impulso.

## 4. Privacidad y seguridad

- El formulario exige autorización de datos y correo o WhatsApp; una caída de red no confirma que el servidor haya rechazado el envío. No reenviar automáticamente.
- Las pruebas automatizadas deben interceptar Supabase, usar datos ficticios locales y evitar escribir leads en producción.
- En NEXO, **RLS está activado** en las tablas revisadas `demo_requests`, `nora_web_sessions`, `nora_web_messages`, `client_invoices` y `organizations`. Mantener las restricciones; probar roles antes de cualquier cambio.
- **Avisos de Supabase a 16/10:** `pg_net` está en el esquema `public` (no mover sin auditoría de dependencias); protección de contraseñas filtradas desactivada (revisar plan y opciones, **no contratar por cuenta propia**).
- El asesor de rendimiento indica 23 claves foráneas sin índices específicos, 53 índices sin uso registrado y 3 avisos de políticas permisivas múltiples. Son recomendaciones de auditoría, **no 79 errores críticos**. No crear/borrar índices ni relajar RLS sin observar consultas, volúmenes y permisos.
- Los textos legales del sitio son borradores pendientes de validación profesional cuando corresponda. No presentarlos como certificaciones de cumplimiento.

## 5. Control comercial y de costos

- Revisar coherencia de precios publicados con `nexo_plans` antes de anunciar promociones o actualizar propuestas. A 16/10: **Start 290.000 COP/mes (setup desde 350.000), Growth 490.000 (desde 600.000), Pro 850.000 (desde 1.000.000)** coinciden con la base.
- El plan Custom se cotiza por proyecto en el sitio; el registro interno usa **900.000 COP/mes como estimación de referencia**, no tratarlo como ingreso cerrado ni prometer ese precio sin confirmación comercial.
- Mantener separación entre estimaciones de oportunidades, citas efectivas e ingresos facturados.
- No autorizar automáticamente upgrades de Render/Supabase, servicios de navegador de pago ni herramientas que consuman presupuesto.

## 6. Próximos controles antes de escalar clientes

- Prueba autorizada end-to-end de Nora y de una demo real, con datos de test identificados y procedimiento de limpieza aprobado.
- Seguimiento de solicitudes que llegaron al dashboard y su asignación correcta a la línea NEXO.
- Proceso documentado de consentimiento, retención y eliminación de datos con validación jurídica.
- Revisión de políticas RLS y permisos por cliente/equipo antes de incorporar organizaciones nuevas.
- Auditoría periódica de backups y plan de recuperación para Supabase; no dar por confirmada una copia de seguridad sin verificarla.

**Principio operativo:** primero no perder datos ni ventas; después medir, corregir, probar y publicar. Cada cambio debe poder explicarse y revertirse.
