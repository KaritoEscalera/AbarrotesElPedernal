const { spawn, spawnSync } = require('node:child_process');
const { join } = require('node:path');

const root = join(__dirname, '..');
const mysql = spawnSync('mysqladmin', ['ping'], { stdio: 'ignore' });
if (mysql.status !== 0) {
  console.log('Iniciando MySQL...');
  const service = spawnSync('brew', ['services', 'start', 'mysql'], { stdio: 'inherit' });
  if (service.status !== 0) process.exit(service.status ?? 1);
}
const apiPort = spawnSync('lsof', ['-tiTCP:3000', '-sTCP:LISTEN'], { encoding: 'utf8' });
const apiAlreadyRunning = apiPort.status === 0 && apiPort.stdout.trim().length > 0;
if (apiAlreadyRunning) console.log('La API ya está activa en http://localhost:3000; se reutilizará.');
const api = apiAlreadyRunning ? null : spawn('npm', ['run', 'dev'], { cwd: join(root, 'backend'), stdio: 'inherit' });
const web = spawn('npm', ['start'], { cwd: root, stdio: 'inherit' });
const stop = () => { api?.kill('SIGTERM'); web.kill('SIGTERM'); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
api?.on('exit', (code) => { if (code) { web.kill('SIGTERM'); process.exitCode = code; } });
web.on('exit', (code) => { if (code) { api?.kill('SIGTERM'); process.exitCode = code; } });
