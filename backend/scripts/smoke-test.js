const api = process.env.API_URL ?? 'http://127.0.0.1:3000/api';
const login = await fetch(`${api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correo: 'admin@pedernal.com', password: '123456' }) });
if (!login.ok) throw new Error(`Login falló con HTTP ${login.status}`);
const session = await login.json();
const clients = await fetch(`${api}/clients`, { headers: { Authorization: `Bearer ${session.token}` } });
if (!clients.ok) throw new Error(`Clientes falló con HTTP ${clients.status}`);
const rows = await clients.json();
console.log(`Prueba completa correcta: login MySQL y ${rows.length} clientes recuperados.`);
