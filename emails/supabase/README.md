# NEXO | Correos de autenticación y bienvenida

**Proyecto:** NEXO Platform — `ixewnbjndguchunwcuhf`.  
**Dashboard:** https://dashboard.nexobyjv.online  
**Remitente solicitado:** NEXO by Juan Visbal <nexobyjuanvisbal@gmail.com>

## Estado
- Las plantillas están versionadas aquí, pero **subirlas a GitHub no las activa en Supabase**.
- El flujo "¿Olvidaste tu contraseña?" del dashboard solicita `resetPasswordForEmail` y redirige a `https://dashboard.nexobyjv.online/reset.html`; el correo de magia para iniciar sesión se conserva por separado.
- La plantilla `welcome.html` es una plantilla para un envío transaccional futuro: Supabase Auth **no tiene una plantilla de bienvenida automática**. No afirmar que se envía hasta conectar el evento de activación.
- La plantilla existente `emails/nexo-team-invite.html` se utiliza para invitaciones internas de colaboradores mediante `nexo-mailer` (actualmente Resend con remitente `equipo@nexobyjv.online`). **No sustituirla sin revisar el flujo personalizado y su remitente.**

## Activar Gmail SMTP en Supabase (acción administrativa pendiente)
1. Accede a https://supabase.com/dashboard/project/ixewnbjndguchunwcuhf/auth/smtp
2. Habilita **Custom SMTP**.
3. Remitente / Sender email: `nexobyjuanvisbal@gmail.com`.
4. Sender name: `NEXO by Juan Visbal`.
5. Host: `smtp.gmail.com`. Port: `465` (SSL/TLS; alternativamente 587 con STARTTLS según proveedor).
6. Username: `nexobyjuanvisbal@gmail.com`.
7. Password: **contraseña de aplicación de Google generada por el propietario**. No utilizar la contraseña habitual ni guardar secretos en GitHub, correos o chats.
8. Guardar y enviar prueba. Si la cuenta Google no ofrece contraseñas de aplicación, utilizar un servicio SMTP autenticado de dominio propio en vez de debilitar su seguridad.

> Precaución: Gmail personal tiene límites y no está optimizado para correo transaccional de una plataforma. Para escalar, preferir un remitente verificado `@nexobyjv.online` con un proveedor especializado.

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
7. Confirmar que se ha configurado SMTP antes de depender de envíos continuos.

## Seguridad
- Nunca almacenar contraseña de aplicación en código o archivos del repositorio.
- Dejar activo el proveedor actual hasta que SMTP personalizado haya pasado pruebas.
- Los enlaces de recuperación deben generarse por Supabase Auth, no construirse con tokens manualmente.
- Ningún cambio debe modificar los proyectos de Lía, Cargobot ni claves de otros servicios.
