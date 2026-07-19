import { pool } from '../src/database.js';

try {
  const products = [
    ['750105530001','Coca-Cola 600 ml','Bebidas',28,10,12,18],
    ['750100011111','Leche Lala 1 L','Lácteos',7,10,23,30],
    ['750103049292','Sabritas Original','Botanas',3,8,14,20],
    ['750100015555','Pan Blanco Bimbo','Panadería',14,6,34,45],
    ['750101700123','Frijol a granel','Granel',0,5,25,38],
  ];
  for (const [codigo,nombre,categoria,stock,minimo,costo,precio] of products) {
    const [[cat]] = await pool.execute('SELECT id FROM categorias WHERE nombre=?',[categoria]);
    await pool.execute(`INSERT INTO productos(categoria_id,codigo_barras,nombre,stock_actual,stock_minimo,costo,precio_venta) VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE nombre=VALUES(nombre),categoria_id=VALUES(categoria_id)`,[cat.id,codigo,nombre,stock,minimo,costo,precio]);
  }
  const clients = [['Juan Pérez','4491234567','Centro'],['María López','4497654321','La Labor'],['Carlos Hernández','4499876543','Ojocaliente']];
  for (const [nombre,telefono,direccion] of clients) { const [[exists]]=await pool.execute('SELECT id FROM clientes WHERE telefono=?',[telefono]); if(!exists) await pool.execute('INSERT INTO clientes(nombre,telefono,direccion) VALUES(?,?,?)',[nombre,telefono,direccion]); }
  const providers = [['Distribuidora Coca-Cola','Luis Martínez','4491234567','ventas@cocacola.com','Refrescos','Lunes'],['Grupo Bimbo','María González','4497654321','pedidos@bimbo.com','Panadería','Martes y viernes']];
  for (const p of providers) await pool.execute(`INSERT INTO proveedores(empresa,contacto,telefono,correo,producto_principal,dia_entrega) VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE contacto=VALUES(contacto)`,p);
  console.log('Datos iniciales de productos, clientes y proveedores sincronizados.');
} catch(error){console.error(error.message);process.exitCode=1;}finally{await pool.end();}
