# API y conexión con MySQL

1. Copia `.env.example` como `.env` dentro de `backend`.
2. Completa `DB_PASSWORD` y cambia `JWT_SECRET` por una cadena larga y aleatoria.
3. Ejecuta `npm install` dentro de `backend`.
4. Comprueba la conexión con `npm run check-db`.
5. Crea el primer administrador:

   `npm run create-admin -- "Administrador" admin@pedernal.com "UnaContraseñaSegura"`

6. Inicia la API con `npm run dev`.

La API quedará en `http://localhost:3000`. La prueba de conexión está en `GET /api/health` y el inicio de sesión en `POST /api/auth/login`.

No subas `.env` a Git y no conectes Angular directamente con MySQL.
