# NEXO — Proceso estándar de incorporación de clientes

**Versión operativa:** 16/10/2026 · **Responsable:** NEXO Internal · **Entorno:** `dashboard.nexobyjv.online`

## Objetivo

Incorporar cada organización sin mezclar datos entre clientes, sin marcar entregables ficticios y sin activar un asistente que no haya pasado pruebas. El checklist vive en **Clientes → Onboarding** o **Data Quality → Onboarding**. La activación de Go Live es una acción independiente y reservada al administrador de plataforma.

## Etapa comercial, antes del alta

1. Confirmar necesidad, línea `NEXO Marketing`, `NEXO Assistants` y/o `NEXO Solutions`. Registrar plan, condiciones acordadas y alcance en CRM; no asumir que cada negocio contrata asistente.
2. Confirmar nombre comercial, sector, responsable, canales, contacto autorizado y consentimiento cuando corresponda.
3. Verificar que el prospecto no es una oportunidad ya existente; revisar `demo_requests`, etapa, próximo seguimiento y responsable. **No fusionar/eliminar leads sin revisión**.
4. Acordar piloto y alcance. Cotización y cobros siguen el proceso aprobado; no activar cargos automáticos a partir de una demo.

## Implementación por cliente: siete controles

| Paso en dashboard | Criterio de aprobación | Puede marcarse «No aplica» |
|---|---|---|
| Empresa | Organización creada, línea de negocio seleccionada, contacto operativo registrado y datos revisados | **No** |
| Asistente | Nombre, instrucciones, personalidad, contexto y agente activo; si aplica | Sí, solo si no se vende Assistants |
| Catálogo | Lista de servicios/productos, precios y aliases revisados con el cliente; catálogo activo para Assistants | Sí, para servicios sin catálogo |
| Integraciones | WhatsApp, agenda, CRM, Meta y demás conexiones acordadas verificadas o descartadas expresamente | Sí, si el contrato no las incluye |
| Usuarios | Acceso del cliente y del equipo con roles correctos, si está incluido | Sí, si no se contrató portal/accesos |
| Pruebas | Escenarios funcionales, consentimiento, negativas, handoff y datos revisados; aceptación documentada | **No** |
| Go Live | Activación explícita del administrador tras pasar todos los pasos anteriores | **Nunca por selección manual** |

**Requisitos adicionales:** `NEXO Assistants` exige asistente **activo** y al menos un servicio **activo** en catálogo. Las líneas `NEXO Marketing` y `NEXO Solutions` pueden prescindir del asistente si no forma parte del alcance. Siempre debe existir una ficha comercial y un contacto operativo.

## Seguridad y control de publicación

- Toda activación exige dos verificaciones: checklist visible en el dashboard y comprobación independiente en `platform_activate_go_live` (Supabase). La función no debe marcar empresa, pruebas, catálogo ni accesos como completados automáticamente.
- Si falta algo, registrar el motivo y responsable en las **notas del onboarding**. No marcar «Completado» para eludir un bloqueo.
- Pruebas manuales de chatbot con datos de prueba acordados; evitar contaminación de CRM, métricas e historial de clientes.
- No copiar catálogos, prompts, llaves, sesiones o datos de clientes entre organizaciones. Comprobar roles de acceso antes de compartir el portal.
- Go Live no es una confirmación de pago ni obliga a facturar. La facturación y Wompi deben validarse por su flujo independiente.

## Entrega y seguimiento

Una vez aprobado Go Live, verificar por separado que el asistente o servicio contratado funciona, que el cliente accede solo a su organización, que las métricas están visibles, que los avisos operativos funcionan y que el equipo tiene responsable/fecha para el siguiente seguimiento. Registrar incidentes y su resolución en el cliente correspondiente.

## Pendientes para demostrar una operación completa

- Prueba end-to-end real **autorizada** para un nuevo cliente, desde formulario hasta CRM y responsable.
- Validación de invitación y cambio de permisos con dos usuarios de prueba y organizaciones distintas.
- Revisión de soporte, restauración de backups y retención de datos antes de una incorporación a escala.
- Prueba de facturación Wompi en ambiente de prueba antes de activar cobro automático.

**No declarar un cliente listo, con pruebas pasadas o cobro confirmado sin evidencia verificable.**
