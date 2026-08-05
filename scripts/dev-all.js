const { spawn, spawnSync } = require('node:child_process');
const http = require('node:http');
const { join } = require('node:path');

const root = join(__dirname, '..');

function urlLista(url) {
  return new Promise((resolve) => {
    const request = http.get(url, { timeout: 900 }, (response) => {
      response.resume();
      resolve(Boolean(response.statusCode && response.statusCode < 500));
    });
    request.on('timeout', () => { request.destroy(); resolve(false); });
    request.on('error', () => resolve(false));
  });
}

function apiLista() { return urlLista('http://127.0.0.1:3000/api/health'); }
function puertoOcupado(port) {
  const result = spawnSync('lsof', [`-tiTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
  return result.status === 0 && result.stdout.trim().length > 0;
}

function esperarApi(api, intentos = 40) {
  return new Promise((resolve, reject) => {
    let restantes = intentos;
    const revisar = async () => {
      if (await apiLista()) return resolve();
      if (api?.exitCode !== null) return reject(new Error('La API se cerró antes de estar disponible.'));
      restantes -= 1;
      if (restantes <= 0) return reject(new Error('La API no respondió después de 40 segundos.'));
      setTimeout(revisar, 1000);
    };
    revisar();
  });
}

async function iniciar() {
  const mysql = spawnSync('mysqladmin', ['ping'], { stdio: 'ignore' });
  if (mysql.status !== 0) {
    console.log('Iniciando MySQL...');
    const service = spawnSync('brew', ['services', 'start', 'mysql'], { stdio: 'inherit' });
    if (service.status !== 0) throw new Error('No fue posible iniciar MySQL.');
  }

  const apiAlreadyRunning = await apiLista();
  if (apiAlreadyRunning) console.log('API y MySQL listos; se reutilizará el servidor activo.');
  const api = apiAlreadyRunning ? null : spawn('npm', ['run', 'dev'], { cwd: join(root, 'backend'), stdio: 'inherit' });
  await esperarApi(api);
  const webAlreadyRunning = puertoOcupado(4200);
  if (webAlreadyRunning) console.log('Aplicación lista en http://localhost:4200; se reutilizará la ventana activa.');
  else console.log('Servidor listo. Iniciando la aplicación en http://localhost:4200...');
  const web = webAlreadyRunning ? null : spawn('npm', ['run', 'start:web'], { cwd: root, stdio: 'inherit' });

  if (!api && !web) return;

  let terminando = false;
  const stop = () => {
    if (terminando) return;
    terminando = true;
    api?.kill('SIGTERM');
    web?.kill('SIGTERM');
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  api?.on('exit', (code) => { if (!terminando && code) { web?.kill('SIGTERM'); process.exitCode = code; } });
  web?.on('exit', (code) => { if (!terminando) { api?.kill('SIGTERM'); process.exitCode = code ?? 0; } });
}

iniciar().catch((error) => {
  console.error(`No se pudo iniciar la aplicación: ${error.message}`);
  process.exit(1);
});
