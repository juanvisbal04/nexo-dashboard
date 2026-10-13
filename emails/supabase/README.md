# NEXO | Correos de autenticación y bienvenida

**Proyecto:** NEXO Platform — `ixewnbjndguchunwcuhf`.  
**Dashboard:** https://dashboard.nexobyjv.online  
**Remitente solicitado:** NEXO by Juan Visbal <nexobyjuanvisbal@gmail.com>

## Estado
- Las plantillas están versionadas aquí, pero **subirlas a GitHub no las activa en Supabase**.
- El flujo "¿Olvidaste tu contraseña?" del dashboard solicita `resetPasswordForEmail` y redirige a `https://dashboard.nexobyjv.online/reset.html`; el correo de magia para iniciar sesión se conserva por separado.
- La plantilla `welcome.html` es una referencia para un envío transaccional; Supabase Auth **no tiene una plantilla de bienvenida automática**. La plantilla `nexo-dashboard-welcome` ya está publicada en Resend, pero **todavía no tiene activado un disparador automático**.
- La plantilla existente `emails/nexo-team-invite.html` se utiliza para invitaciones internas de colaboradores mediante `nexo-mailer` (actualmente Resend con remitente `equipo@nexobyjv.online`). **No sustituirla sin revisar el flujo personalizado y su remitente.**

## Activar el SMTP de Resend que NEXO ya utiliza (pendiente en Supabase)

**Dominio de NEXO verificado:** `nexobyjv.online` (Resend).  
**Remitente ya existente y aprobado:** `NEXO by Juan Visbal <equipo@nexobyjv.online>`.  
**Plantilla existente activa:** `nexo-team-invite` (invitaciones a colaboradores).  
**Bienvenida preparada y publicada:** `nexo-dashboard-welcome` (Resend). No se envía automáticamente hasta integrar el evento de activación.

Sin necesidad de Gmail, Google App Passwords ni contratar otro proveedor.

1. Abrir https://supabase.com/dashboard/project/ixewnbjndguchunwcuhf/auth/smtp y activar **Custom SMTP**.
2. **Sender email:** `equipo@nexobyjv.online`.
3. **Sender name:** `NEXO by Juan Visbal`.
4. **SMTP host:** `smtp.resend.com`.
5. **SMTP port:** `465` (SSL/TLS; alternativamente 587 con STARTTLS, si está soportado).
6. **SMTP username:** `resend` (literal).
7. **SMTP password:** una **Resend API Key** con permiso de enviar en `nexobyjv.online`. Crearla en https://resend.com/api-keys y pegarla **solo en el panel de Supabase**; no enviarla por chat, agregarla a archivos ni reutilizar la de otros servicios si se puede evitar.
8. Guardar y verificar un correo de recuperación con un usuario de prueba.
9. **No cambiar el remitente del `nexo-mailer` existente**: ya utiliza Resend. La configuración SMTP de Supabase es independiente y complementaria.

Esto usa el mismo proveedor que NEXO ya posee. Sujeto a las cuotas del plan gratuito. Como Supabase carece de credenciales de Resend y el conector de Supabase no permite modificar Auth SMTP, el paso del panel debe realizarlo un administrador.

## Activar plantillas en Supabase
En https://supabase.com/dashboard/project/ixewnbjndguchunwcuhf/auth/templates copiar el HTML y asunto correspondiente:
| Supabase Auth | Archivo | Asunto sugerido |
|---|---|---|
| Confirm signup | `confirm-signup.html` | Confirma tu correo · NEXO |
| Invite user | `invite-user.html` | Tu invitación a NEXO |
| Magic link | `magic-link.html` | Tu enlace de acceso a NEXO |
| Reset password | `reset-password.html` | Restablece tu contraseña · NEXO |
| Change email address | `change-email.html` | Confirma tu nuevo correo · NEXO |
| Reauthentication | `reauthentication.html` | Tu código de verificación · NEXO |

Estas plantillas utilizan los marcadores oficiales de Supabase `{{ .ConfirmationURL }}` y `{{ .Token }}`; **no reemplazarlos** por URLs estáticas. No incluir datos personales sensibles.

## URLs permitidas
En **Authentication → URL Configuration**:
- Site URL: `https://dashboard.nexobyjv.online` (si este es el entorno principal actual).
- Redirect URL adicional: `https://dashboard.nexobyjv.online/reset.html`.
- Mantener la URL de producción ya existente para inicio e invitación.
- Agregar `https://nexo-dashboard-pcfq.onrender.com/reset.html` **solo si hay pruebas expresas** desde el entorno secundario.

## Pruebas recomendadas antes de anunciar el cambio
1. Desde una cuenta de prueba existente, solicitar contraseña desde el login; validar que se recibe el correo y el enlace abre `reset.html`.
2. Crear contraseña de 10+ caracteres con mayúscula, minúscula y número. Probar login nuevo y verificar que la contraseña antigua ya no funciona.
3. Enviar enlace de acceso (magic link) desde el login y verificar que sigue iniciando sesión sin cambiar contraseña.
4. Probar invitación a un usuario del equipo y cliente en entornos autorizados; validar que sus roles siguen intactos.
5. Probar una solicitud con correo no registrado: la interfaz no debe revelar si existe la cuenta.
6. Validar asunto, remitente, spam, vistas de Gmail y Outlook, funcionamiento en móvil y validez de enlaces.
7. Confirmar que se ha configurado Resend SMTP antes de depender de envíos continuos.

## Seguridad
- Nunca almacenar contraseña de aplicación en código o archivos del repositorio.
- Dejar activo el proveedor actual hasta que SMTP personalizado haya pasado pruebas.
- Los enlaces de recuperación deben generarse por Supabase Auth, no construirse con tokens manualmente.
- Ningún cambio debe modificar los proyectos de Lía, Cargobot ni claves de otros servicios.
