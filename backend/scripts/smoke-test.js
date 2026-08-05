const api = process.env.API_URL ?? 'http://127.0.0.1:3000/api';
const login = await fetch(`${api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correo: 'admin@pedernal.com', password: '123456' }) });
if (!login.ok) throw new Error(`Login falló con HTTP ${login.status}`);
const session = await login.json();
const clients = await fetch(`${api}/clients`, { headers: { Authorization: `Bearer ${session.token}` } });
if (!clients.ok) throw new Error(`Clientes falló con HTTP ${clients.status}`);
const rows = await clients.json();
if (rows.length) {
  const account = await fetch(`${api}/clients/${rows[0].id}/account`, { headers: { Authorization: `Bearer ${session.token}` } });
  const accountData = await account.json();
  if (!account.ok || !accountData.client || !Array.isArray(accountData.credits) || !Array.isArray(accountData.payments) || !Array.isArray(accountData.balances)) throw new Error(`Estado de cuenta falló con HTTP ${account.status}`);
}
const cash = await fetch(`${api}/cash/current`, { headers: { Authorization: `Bearer ${session.token}` } });
if (!cash.ok) throw new Error(`Caja falló con HTTP ${cash.status}`);
const cashState = await cash.json();
if (!('session' in cashState) || !Array.isArray(cashState.movements)) throw new Error('La respuesta de caja no tiene el formato esperado.');
const reports = await fetch(`${api}/reports`, { headers: { Authorization: `Bearer ${session.token}` } });
if (!reports.ok) throw new Error(`Reportes falló con HTTP ${reports.status}`);
const reportData = await reports.json();
if (!Array.isArray(reportData.sales) || !Array.isArray(reportData.inventory) || !Array.isArray(reportData.credits)) throw new Error('Los reportes no tienen el formato esperado.');
const audit = await fetch(`${api}/audit`, { headers: { Authorization: `Bearer ${session.token}` } });
if (!audit.ok) throw new Error(`Bitácora falló con HTTP ${audit.status}`);
const analytics = await fetch(`${api}/analytics`, { headers: { Authorization: `Bearer ${session.token}` } });
if (!analytics.ok) throw new Error(`Estadísticas falló con HTTP ${analytics.status}`);
const analyticsData = await analytics.json();
if (!Array.isArray(analyticsData.sales) || !Array.isArray(analyticsData.products) || !Array.isArray(analyticsData.credits) || !Array.isArray(analyticsData.cashClosures) || !Array.isArray(analyticsData.reminders)) throw new Error('Las estadísticas no tienen el formato esperado.');
const purchases = await fetch(`${api}/purchases`, { headers: { Authorization: `Bearer ${session.token}` } });
if (!purchases.ok || !Array.isArray(await purchases.json())) throw new Error(`Compras falló con HTTP ${purchases.status}`);
const backups = await fetch(`${api}/backups`, { headers: { Authorization: `Bearer ${session.token}` } });
if (!backups.ok || !Array.isArray(await backups.json())) throw new Error(`Respaldos falló con HTTP ${backups.status}`);
const health = await fetch(`${api}/system/health`, { headers: { Authorization: `Bearer ${session.token}` } });
const healthData = await health.json();
if (!health.ok || healthData.api?.estado !== 'OK' || healthData.database?.estado !== 'OK' || !healthData.disk?.totalBytes) throw new Error(`Salud del sistema falló con HTTP ${health.status}`);
for (const endpoint of ['purchase-suggestions','lots/alerts','inventory/movements','recharges','invoices','promotions']) {
  const response = await fetch(`${api}/${endpoint}`, { headers: { Authorization: `Bearer ${session.token}` } });
  if (!response.ok || !Array.isArray(await response.json())) throw new Error(`${endpoint} falló con HTTP ${response.status}`);
}
const rechargeSummary = await fetch(`${api}/recharges/reconciliation`, { headers: { Authorization: `Bearer ${session.token}` } });
const rechargeData = await rechargeSummary.json();
if (!rechargeSummary.ok || !('total' in rechargeData) || !Array.isArray(rechargeData.porCompania)) throw new Error(`Conciliación de recargas falló con HTTP ${rechargeSummary.status}`);
if (process.env.TEST_BACKUP === '1') {
  const backup = await fetch(`${api}/backups/export`, { headers: { Authorization: `Bearer ${session.token}` } });
  if (!backup.ok || (await backup.arrayBuffer()).byteLength < 1000) throw new Error(`Exportación de respaldo falló con HTTP ${backup.status}`);
}
if (process.env.TEST_AUTOMATIC_BACKUP === '1') {
  const created = await fetch(`${api}/backups/automatic`, { method: 'POST', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' }, body: '{}' });
  const createdData = await created.json();
  if (!created.ok || !createdData.id || !createdData.checksum) throw new Error(`Respaldo automático falló con HTTP ${created.status}`);
  const verified = await fetch(`${api}/backups/${createdData.id}/verify`, { method: 'POST', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' }, body: '{}' });
  const verifiedData = await verified.json();
  if (!verified.ok || verifiedData.valido !== true || verifiedData.checksum !== createdData.checksum) throw new Error(`Verificación SHA-256 falló con HTTP ${verified.status}`);
}
const cashierLogin = await fetch(`${api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correo: 'cajera@pedernal.com', password: '123456' }) });
if (cashierLogin.ok) {
  const cashier = await cashierLogin.json();
  for (const endpoint of ['audit','backups','system/health','users']) {
    const denied = await fetch(`${api}/${endpoint}`, { headers: { Authorization: `Bearer ${cashier.token}` } });
    if (denied.status !== 403) throw new Error(`Permisos incorrectos: Cajera obtuvo HTTP ${denied.status} en ${endpoint}`);
  }
}
console.log(`Prueba completa correcta: login, ${rows.length} clientes, caja, compras, promociones, lotes, sugerencias, reportes, estadísticas, salud, respaldos, bitácora y permisos conectados con MySQL.`);
