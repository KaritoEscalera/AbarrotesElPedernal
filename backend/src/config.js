import 'dotenv/config';

const required = ['DB_HOST', 'DB_USER', 'DB_NAME', 'JWT_SECRET'];
const missing = required.filter((key) => !process.env[key]);

if (missing.length) {
  throw new Error(`Faltan variables de entorno: ${missing.join(', ')}`);
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  frontendUrls: (process.env.FRONTEND_URL ?? 'http://localhost:4200,http://localhost:8100,http://localhost,https://localhost,capacitor://localhost').split(',').map((url) => url.trim()),
  database: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT ?? 10),
  },
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  pac: {
    provider: process.env.PAC_PROVIDER ?? '',
    apiUrl: process.env.PAC_API_URL ?? '',
    apiKey: process.env.PAC_API_KEY ?? '',
  },
};
