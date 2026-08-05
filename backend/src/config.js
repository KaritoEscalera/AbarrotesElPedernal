import 'dotenv/config';

const resolved = {
  DB_HOST: process.env.DB_HOST ?? process.env.MYSQLHOST,
  DB_USER: process.env.DB_USER ?? process.env.MYSQLUSER,
  DB_NAME: process.env.DB_NAME ?? process.env.MYSQLDATABASE,
  JWT_SECRET: process.env.JWT_SECRET,
};
const missing = Object.entries(resolved).filter(([, value]) => !value).map(([key]) => key);

if (missing.length) {
  throw new Error(`Faltan variables de entorno: ${missing.join(', ')}`);
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  frontendUrls: (process.env.FRONTEND_URL ?? 'http://localhost:4200,http://localhost:8100,http://localhost,https://localhost,capacitor://localhost').split(',').map((url) => url.trim()),
  database: {
    host: process.env.DB_HOST ?? process.env.MYSQLHOST,
    port: Number(process.env.DB_PORT ?? process.env.MYSQLPORT ?? 3306),
    user: process.env.DB_USER ?? process.env.MYSQLUSER,
    password: process.env.DB_PASSWORD ?? process.env.MYSQLPASSWORD ?? '',
    database: process.env.DB_NAME ?? process.env.MYSQLDATABASE,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT ?? 10),
    mysqlCommand: process.env.MYSQL_COMMAND ?? 'mysql',
    mysqldumpCommand: process.env.MYSQLDUMP_COMMAND ?? 'mysqldump',
  },
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  backups: {
    directory: process.env.BACKUP_DIR ?? 'backups',
    offsiteDirectory: process.env.OFFSITE_BACKUP_DIR?.trim() || null,
    intervalHours: Math.max(1, Number(process.env.BACKUP_INTERVAL_HOURS ?? 24)),
    retentionDays: Math.max(1, Number(process.env.BACKUP_RETENTION_DAYS ?? 14)),
  },
  pac: {
    provider: process.env.PAC_PROVIDER ?? '',
    apiUrl: process.env.PAC_API_URL ?? '',
    apiKey: process.env.PAC_API_KEY ?? '',
  },
};
