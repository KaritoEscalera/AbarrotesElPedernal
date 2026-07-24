import { pool } from '../src/database.js';

try {
  const products = [
    ['750105530001','Coca-Cola 600 ml','Bebidas',28,10,12,18],
    ['750100011111','Leche Lala 1 L','Lácteos',7,10,23,30],
    ['750103049292','Sabritas Original','Botanas',3,8,14,20],
    ['750100015555','Pan Blanco Bimbo','Panadería',14,6,34,45],
    ['750101700123','Frijol a granel','Granel',20,5,25,38],
    ['200000000001','Jitomate','Verduras',25,5,18,32],
    ['200000000002','Plátano','Frutas',25,5,17,29],
    ['200000000003','Carne de res','Carnes',15,3,125,168],
  ];
  for (const [codigo,nombre,categoria,stock,minimo,costo,precio] of products) {
    const [[cat]] = await pool.execute('SELECT id FROM categorias WHERE nombre=?',[categoria]);
    const granel=['Granel','Frutas','Verduras','Carnes'].includes(categoria);
    await pool.execute(`INSERT INTO productos(categoria_id,codigo_barras,nombre,unidad_medida,stock_actual,stock_minimo,costo,precio_venta) VALUES(?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE nombre=VALUES(nombre),categoria_id=VALUES(categoria_id),unidad_medida=VALUES(unidad_medida)`,[cat.id,codigo,nombre,granel?'Kilogramo':'Pieza',stock,minimo,costo,precio]);
  }
  // Catálogo inicial investigado para una tienda de abarrotes mexicana.
  // Los SKU CAT-* son internos: el código de barras real se captura al recibir el producto.
  // Se crean sin existencia para no inventar mercancía física. Los precios son referencias
  // iniciales editables por la tienda y nunca se sobrescriben al volver a ejecutar el seed.
  const catalog = [
    ['Leche Lala Entera 1 L','Lácteos',34],['Leche Lala Light 1 L','Lácteos',35],
    ['Leche Lala Deslactosada 1 L','Lácteos',36],['Leche Lala Deslactosada Light 1 L','Lácteos',37],
    ['Leche Lala 100 sin Lactosa 1 L','Lácteos',39],['Leche Lala Semidescremada 1 L','Lácteos',35],
    ['Leche Lala Yomi Chocolate 960 ml','Lácteos',37],['Media Crema Lala 250 ml','Lácteos',22],
    ['Crema Lala Entera 200 ml','Lácteos',25],['Crema Lala Entera 426 ml','Lácteos',46],
    ['Crema Lala Light 426 ml','Lácteos',48],['Mantequilla Lala sin Sal 90 g','Lácteos',27],
    ['Queso Lala Panela 200 g','Lácteos',57],['Queso Lala Panela 400 g','Lácteos',96],
    ['Queso Lala Panela Light 400 g','Lácteos',99],['Queso Lala Oaxaca 200 g','Lácteos',58],
    ['Queso Lala Oaxaca 400 g','Lácteos',108],['Queso Lala Manchego 400 g','Lácteos',119],
    ['Queso Lala Manchego Rebanado 144 g','Lácteos',53],['Queso Lala Americano 144 g','Lácteos',42],
    ['Queso Crema Lala 190 g','Lácteos',49],['Yoghurt Lala Fresa 900 g','Lácteos',48],
    ['Yoghurt Lala Durazno 900 g','Lácteos',48],['Yoghurt Lala Natural 900 g','Lácteos',49],
    ['Sabritas Original 42 g','Botanas',20],['Sabritas Adobadas 42 g','Botanas',20],
    ['Sabritas Limón 42 g','Botanas',20],['Sabritas Flamin Hot 42 g','Botanas',20],
    ['Ruffles Queso 50 g','Botanas',20],['Ruffles Original 50 g','Botanas',20],
    ['Ruffles Flamin Hot 50 g','Botanas',20],['Ruffles Buffalo 50 g','Botanas',20],
    ['Doritos Nacho 61 g','Botanas',20],['Doritos Incógnita 61 g','Botanas',20],
    ['Doritos Diablo 61 g','Botanas',20],['Doritos Pizzerola 61 g','Botanas',20],
    ['Doritos Dinamita Chile y Limón 70 g','Botanas',22],['Doritos Xtra Flamin Hot 61 g','Botanas',20],
    ['Cheetos Torciditos 52 g','Botanas',18],['Cheetos Poffs 40 g','Botanas',18],
    ['Cheetos Flamin Hot 52 g','Botanas',18],['Tostitos Salsa Verde 65 g','Botanas',20],
    ['Tostitos Flamin Hot 65 g','Botanas',20],['Fritos Sal y Limón 57 g','Botanas',18],
    ['Churrumais 55 g','Botanas',18],['Rancheritos 58 g','Botanas',18],
    ['Sabritones 80 g','Botanas',20],['Crujitos Queso 45 g','Botanas',18],
    ['Pan Blanco Bimbo 620 g','Panadería',52],['Pan Blanco Bimbo 350 g','Panadería',39],
    ['Pan Integral Bimbo 620 g','Panadería',58],['Pan Multigrano Bimbo 610 g','Panadería',63],
    ['Pan Artesano Bimbo 567 g','Panadería',65],['Pan Tostado Bimbo 210 g','Panadería',39],
    ['Pan Tostado Integral Bimbo 250 g','Panadería',44],['Medias Noches Bimbo 8 piezas','Panadería',48],
    ['Bollos Bimbo 8 piezas','Panadería',49],['Tortillinas Tía Rosa 22 piezas','Panadería',42],
    ['Coca-Cola 600 ml','Bebidas',20],['Coca-Cola Sin Azúcar 600 ml','Bebidas',20],
    ['Coca-Cola 2.5 L','Bebidas',48],['Pepsi 600 ml','Bebidas',19],
    ['Pepsi 2 L','Bebidas',39],['Manzanita Sol 600 ml','Bebidas',19],
    ['7UP 600 ml','Bebidas',19],['Mirinda Naranja 600 ml','Bebidas',19],
    ['Jarritos Mandarina 600 ml','Bebidas',18],['Agua Ciel 1 L','Bebidas',16],
    ['Agua Bonafont 1 L','Bebidas',17],['Gatorade Ponche de Frutas 600 ml','Bebidas',27],
    ['Jumex Mango 1 L','Bebidas',32],['Boing Guayaba 500 ml','Bebidas',18],
    ['Atún Dolores en Agua 130 g','Enlatados',29],['Atún Herdez en Agua 130 g','Enlatados',27],
    ['Chiles Jalapeños La Costeña 220 g','Enlatados',22],['Frijoles Bayos La Costeña 560 g','Enlatados',31],
    ['Elote Dorado Herdez 220 g','Enlatados',23],['Puré de Tomate Del Fuerte 210 g','Enlatados',13],
    ['Mayonesa McCormick 390 g','Abarrotes',58],['Cátsup Heinz 397 g','Abarrotes',39],
    ['Aceite Nutrioli 850 ml','Abarrotes',48],['Aceite 1-2-3 1 L','Abarrotes',42],
    ['Arroz Verde Valle 1 kg','Abarrotes',42],['Frijol Verde Valle 1 kg','Abarrotes',49],
    ['Azúcar Estándar 1 kg','Abarrotes',32],['Sal La Fina 1 kg','Abarrotes',24],
    ['Pasta La Moderna Spaghetti 200 g','Abarrotes',13],['Sopa Nissin Camarón 64 g','Abarrotes',19],
    ['Cereal Zucaritas 490 g','Abarrotes',78],['Avena Quaker 400 g','Abarrotes',45],
    ['Galletas Marías Gamesa 170 g','Galletas',19],['Galletas Emperador Chocolate 91 g','Galletas',18],
    ['Galletas Chokis 76 g','Galletas',18],['Galletas Saladitas Gamesa 137 g','Galletas',21],
    ['Papel Higiénico Pétalo 4 rollos','Higiene y limpieza',42],['Jabón Zote Rosa 400 g','Higiene y limpieza',23],
    ['Detergente Ariel 500 g','Higiene y limpieza',39],['Detergente Roma 1 kg','Higiene y limpieza',43],
    ['Cloro Cloralex 950 ml','Higiene y limpieza',25],['Lavatrastes Axion Limón 400 g','Higiene y limpieza',36],
    ['Jabón Palmolive Neutro 120 g','Higiene y limpieza',19],['Pasta Dental Colgate Triple Acción 100 ml','Higiene y limpieza',39],
  ];
  for (let index=0;index<catalog.length;index++) {
    const [nombre,categoria,precio]=catalog[index];
    await pool.execute(`INSERT INTO categorias(nombre) VALUES(?) ON DUPLICATE KEY UPDATE nombre=VALUES(nombre)`,[categoria]);
    const [[cat]]=await pool.execute('SELECT id FROM categorias WHERE nombre=?',[categoria]);
    const sku=`CAT-${String(index+1).padStart(4,'0')}`;
    const costo=Math.round(Number(precio)*.72*100)/100;
    const [[existente]]=await pool.execute('SELECT id FROM productos WHERE nombre=? LIMIT 1',[nombre]);
    if(existente){
      await pool.execute('UPDATE productos SET sku=COALESCE(sku,?),categoria_id=? WHERE id=?',[sku,cat.id,existente.id]);
      continue;
    }
    await pool.execute(`INSERT INTO productos(categoria_id,sku,nombre,unidad_medida,stock_actual,stock_minimo,costo,precio_venta)
      VALUES(?,?,?,'Pieza',10,3,?,?)
      ON DUPLICATE KEY UPDATE nombre=VALUES(nombre),categoria_id=VALUES(categoria_id),stock_actual=IF(stock_actual=0,10,stock_actual)`,
      [cat.id,sku,nombre,costo,precio]);
  }
  const clients = [['Juan Pérez','4491234567','Centro'],['María López','4497654321','La Labor'],['Carlos Hernández','4499876543','Ojocaliente']];
  for (const [nombre,telefono,direccion] of clients) { const [[exists]]=await pool.execute('SELECT id FROM clientes WHERE telefono=?',[telefono]); if(!exists) await pool.execute('INSERT INTO clientes(nombre,telefono,direccion) VALUES(?,?,?)',[nombre,telefono,direccion]); }
  const providers = [['Distribuidora Coca-Cola','Luis Martínez','4491234567','ventas@cocacola.com','Refrescos','Lunes'],['Grupo Bimbo','María González','4497654321','pedidos@bimbo.com','Panadería','Martes y viernes']];
  for (const p of providers) await pool.execute(`INSERT INTO proveedores(empresa,contacto,telefono,correo,producto_principal,dia_entrega) VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE contacto=VALUES(contacto)`,p);
  console.log(`Datos iniciales sincronizados, incluido catálogo base de ${catalog.length} productos.`);
} catch(error){console.error(error.message);process.exitCode=1;}finally{await pool.end();}
