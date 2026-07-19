# Base de datos MySQL

El archivo `AbarrotesElPedernal.sql` está diseñado para MySQL 8 y crea la base `AbarrotesElPedernal` sin eliminar información existente.

## Importar con MySQL Workbench

1. Abre tu conexión local en MySQL Workbench.
2. Selecciona **File → Open SQL Script**.
3. Abre `database/AbarrotesElPedernal.sql`.
4. Ejecuta todo el script con el botón del rayo.
5. En **Schemas**, pulsa actualizar y abre `AbarrotesElPedernal`.

El script crea tablas, relaciones, índices, restricciones, roles, categorías iniciales y vistas para inventario, fiados y estadísticas.

## Importante

- No insertes contraseñas directamente. El backend debe generar hashes con bcrypt o Argon2.
- Angular no debe conectarse directamente a MySQL ni incluir usuario/contraseña de la base.
- Hace falta un backend API para reemplazar gradualmente el almacenamiento local actual.
- La información fiscal requiere validación profesional y cualquier operación oficial debe usar servicios autorizados.
