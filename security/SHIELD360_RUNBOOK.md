# NEXO Shield 360 — Runbook de seguridad y continuidad

Actualizado: 2026-10-13. Entorno: Supabase **NEXO Platform** / repositorio **nexo-dashboard**. Estrictamente separado del proyecto Cargobot.

## Estado real y limitaciones

- RLS activo en todas las tablas públicas durante la auditoría inicial; las nuevas tablas de incidentes también tienen RLS.
- Se revocaron TRUNCATE, TRIGGER y REFERENCES para roles anon/authenticated donde no eran necesarios.
- \`nexo_shield_incidents\`: incidencias **registradas manualmente** por CEO, no detección automática de amenazas.
- \`nexo_shield_status()\`: RPC protegida por admin; solo métricas de RLS, buckets, cambios auditados y permisos. No mide ataques, inicios de sesión, backups ni disponibilidad.
- MFA TOTP: inscripción voluntaria desde Perfil, con confirmación de un código antes de activarse; quienes ya tienen TOTP verificado pasan por un desafío al abrir el dashboard. La interfaz no es una barrera suficiente contra llamadas API directas AAL1: **pendiente extender controles de AAL2 de operaciones privilegiadas a la base y Edge Functions, tras pruebas y método de recuperación**.
- Revisión inicial de políticas por cliente y prueba de RLS con contexto de usuario no administrador y organización ajena. **No equivale a una auditoría externa ni a un pentest**.

## Alta de MFA

1. Inicia sesión con tu cuenta NEXO, entra en **Perfil > Seguridad de tu cuenta**.
2. Haz clic en **Activar autenticación de dos pasos**.
3. Escanea el QR o copia la clave en una aplicación TOTP.
4. Comprueba el código de seis dígitos; NEXO debe confirmar activación.
5. Cierra sesión y verifica el desafío TOTP al volver a ingresar.
6. **Advertencia:** Supabase TOTP no genera códigos de recuperación. Asegura acceso al dispositivo y considera un segundo factor. La recuperación administrativa de cuenta debe diseñarse antes de exigir MFA a todo el equipo. No se deben guardar QR ni claves TOTP en tickets o capturas.

## Acceso y privilegios

- CEO: controla personal, autorizaciones, finanzas, incidentes y auditoría.
- Colaboradores: datos según asignaciones, roles y permisos; no basta esconder botones.
- Clientes: solo organizaciones de las cuales son miembros.
- Nunca usar claves service_role en navegador, archivos estáticos, chat o repositorio.
- Revisar toda Edge Function pública sin \`verify_jwt\` según su lógica de autenticación. Formularios públicos y webhooks firmados requieren excepciones deliberadas y límites de tasa.

## Respuesta a incidentes

1. **Detectar**: documentar hora, tipo, evidencia mínima (sin secretos), organizaciones posiblemente afectadas.
2. **Contener**: si es necesario, revocar sesión o clave comprometida siguiendo aprobación operativa. No desconectar WhatsApp, Wompi o Lía sin confirmar impacto.
3. **Investigar**: consultar \`audit_log\`, configuración de RLS, Edge Functions y registros de proveedores; anotar alcance comprobado frente a lo sospechado.
4. **Recuperar**: revertir cambios con migraciones versionadas; para eliminación o corrupción, usar backup validado (si existe) en **entorno aislado** antes de restaurar producción.
5. **Comunicar**: notificar internamente y evaluar deberes legales de comunicación.
6. **Cerrar**: actualizar el incidente a resuelto con causa raíz y mejoras preventivas.

## Copias y restauración — IMPORTANTE, aún no comprobado

- **No hay backup nuevo generado por esta implementación.** Antes de prometer recuperación, confirmar el plan de Supabase y la existencia de backups restaurables.
- Supabase indica que los proyectos Pro/Team/Enterprise tienen backups diarios; para plan gratuito recomienda usar periódicamente \`supabase db dump\` y almacenamiento seguro externo. Referencia: https://supabase.com/docs/guides/platform/backups
- **Los backups de base de datos no incluyen el contenido de archivos de Supabase Storage**, solo metadatos. Exportar Storage por separado, con control de acceso y cifrado.
- Preparación sin costo adicional: definir responsable, frecuencia y destino cifrado de backup; exportar esquema y datos a almacenamiento de acceso restringido, sin subir datos de clientes a GitHub. Las credenciales de base de datos nunca deben escribirse en el repositorio.
- Recomendación inicial: backup diario, verificación de integridad y prueba de restauración mensual en proyecto de ensayo. **Objetivos RPO/RTO y cumplimiento por volumen aún pendientes de confirmar**, y puede requerirse plan de pago.
- No restaurar producción sin aprobación expresa. Priorizar preservar facturación, auditoría, datos por cliente, consentimientos y registros de pagos.
- Documentar fecha de la última copia verificada, último restore test, duración y responsables. Sin esos datos, mostrar **“No verificado”**.

## Avisos conocidos y decisiones pendientes

- \`pg_net\` está instalado en \`public\`; antes de moverlo, mapear funciones/triggers dependientes para no cortar correos ni automatizaciones. Información: https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public
- Protección contra contraseñas filtradas no está activa. Supabase indica que requiere Pro o superior; no realizar upgrade sin autorización: https://supabase.com/docs/guides/auth/password-security
- Aplicar MFA obligatorio/AAL2 por rol **solo después de preparar recuperación y ensayar con el CEO**, para evitar bloqueos.
- Revisar HTTP/CSP, origen de scripts externos, monitoreo de abuso de endpoints públicos y rotación controlada de claves en una iteración posterior.
- No se ejecutó prueba de penetración de proveedores externos ni simulación de recuperación de datos.

## Pruebas mínimas de aceptación antes de declarar el proyecto terminado

1. CEO puede abrir el Centro Shield, leer métricas y registrar/cerrar incidentes.
2. Colaborador normal no puede ejecutar RPC Shield ni leer incidentes.
3. Cliente A no puede ver ni modificar datos, archivos o tareas de cliente B.
4. MFA TOTP se activa solo al confirmar código; usuarios inscritos tienen desafío de ingreso.
5. Cliente sin MFA puede seguir iniciando sesión sin fricción.
6. Lía, WhatsApp, correos, Wompi y dashboard siguen funcionando.
7. Se confirma copia válida de base y Storage; se restaura y verifica en un entorno aislado.
