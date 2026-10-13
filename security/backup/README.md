# NEXO Shield 360 · Copias cifradas sin cambiar de plan

Estado actual: **herramienta preparada, primera copia aún NO ejecutada ni restaurada**. Este repositorio es **público**: NUNCA subas aquí volcados de bases de datos, credenciales, claves privadas o archivos de clientes. La base de datos y las facturas contienen información comercial y personal.

## Objetivo y alcance

Crear un archivo cifrado de la base PostgreSQL del proyecto **NEXO Platform**, sin cambiar la tarifa de Supabase y sin almacenar un respaldo en texto claro en el disco del operador. El cifrado se realiza con `age` al momento de recibir la salida de `pg_dump`.

La copia lógica de la base de datos **NO** contiene los bytes de Supabase Storage (aunque puede incluir metadatos); `nexo-task-files` y futuras carpetas de archivos deben exportarse por separado a un destino cifrado. No copiar ni consultar proyectos de Lía o Cargobot.

## Antes de ejecutar

1. Preparar un computador de confianza con Docker y `age` instalados, suficiente almacenamiento y salida de red al pooler de Supabase. Se necesita una identidad de cifrado y una ubicación externa **privada** (disco cifrado o repositorio de backups con permisos específicos).
2. En el computador, generar la identidad de cifrado (NUNCA en el repositorio):
   ```bash
   mkdir -p "$HOME/.config/nexo-shield"
   chmod 700 "$HOME/.config/nexo-shield"
   umask 077
   age-keygen -o "$HOME/.config/nexo-shield/identity.txt"
   age-keygen -y "$HOME/.config/nexo-shield/identity.txt"
   ```
   Guardar una copia de la **identidad privada** fuera de línea en un lugar seguro, separada de los respaldos cifrados. Si se pierde la clave, no se puede recuperar la copia.
3. Obtener la cadena de conexión del proyecto **NEXO Platform** desde Supabase > Project Settings > Database > Connection string. Usar una conexión compatible con Docker y PostgreSQL; si el host directo no funciona por IPv6, verificar el pooler de sesión. **No copiar esa cadena a archivos del proyecto, mensajes o capturas.**
4. En una terminal de confianza, preparar variables SIN escribir la contraseña en el historial:
   ```bash
   export NEXO_AGE_RECIPIENT="$(age-keygen -y "$HOME/.config/nexo-shield/identity.txt")"
   read -r -s -p "NEXO database URL: " NEXO_DB_URL; echo
   export NEXO_DB_URL
   ```
5. Ejecutar `bash security/backup/nexo_encrypted_db_backup.sh /ruta/privada/de/backups` desde una copia local del repositorio. El script utiliza el contenedor `postgres:17-alpine`. No requiere credenciales GitHub ni servicios de pago adicionales; puede usar transferencia/almacenamiento según el proveedor elegido.
6. Validar la suma SHA-256 (`.sha256`) y la apertura cifrada **sin restaurar en producción**. Ejemplo, desde una copia privada de los archivos:
   ```bash
   age -d -i "$HOME/.config/nexo-shield/identity.txt" /ruta/privada/de/backups/nexo-db-FECHA.dump.age \
      | docker run --rm -i postgres:17-alpine pg_restore --list -
   ```
   Esta prueba comprueba que el archivo se puede descifrar y leer como respaldo `pg_dump`. **No sustituye** una restauración completa de prueba en un entorno aislado.
7. Para una prueba real, restaurar en un PostgreSQL **nuevo y aislado**, con datos protegidos, y validar cantidad de tablas, datos clave y consultas básicas. No restaurar sobre producción sin autorización.

## Seguridad operativa

- **Sin automatización activada:** este es un script manual. No hay acceso automático configurado a contraseñas ni a un destino de almacenamiento.
- No subir archivos `.dump`, `.age`, `.sql` ni claves privadas a este repositorio, ni adjuntar volcados a tickets/chat.
- No conservar archivos descifrados ni compartir la cadena de conexión.
- Copiar el backup cifrado a una ubicación **fuera del dispositivo** (resistente a fallos del equipo), con acceso limitado.
- Documentar fecha de copia, SHA-256, destino, propietario responsable y última restauración de ensayo. La retención recomendada debe ser confirmada según el volumen, plan, ley de datos y presupuesto.
- El valor `NEXO_AGE_RECIPIENT` es la **clave pública** para cifrar, NO es la clave privada de descifrado.
- Cuando se decida un proveedor privado de almacenamiento y se valide la primera restauración, puede programarse una tarea diaria con credenciales en un almacén de secretos, auditada. Evitar GitHub Actions con volcado de datos sin consentimiento: el repositorio es público.

## Pendientes previos a declarar continuidad operativa

- Ejecutar primera copia real y recuperar una muestra en un PostgreSQL de prueba.
- Exportar y restaurar archivos de **Storage** por separado.
- Determinar destino cifrado, retención y responsable de backups.
- Comprobar permisos de conexión, rotación de claves y aviso ante fallos.
- Revisar términos de protección de datos y conservar registro de pruebas de restauración.

Referencias: https://supabase.com/docs/guides/platform/backups y https://supabase.com/docs/reference/cli/supabase-db-dump
