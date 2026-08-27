import { pool } from '../src/database.js';

const stockPorCategoria = {
  Abarrotes: 18,
  Bebidas: 24,
  Botanas: 20,
  Carnes: 8,
  Enlatados: 15,
  Frutas: 12,
  Galletas: 18,
  Granel: 15,
  'Higiene y limpieza': 12,
  Lácteos: 14,
  Panadería: 12,
  Verduras: 12,
};

try {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [productos] = await connection.query(`
      SELECT p.id, p.nombre, p.stock_actual, p.stock_minimo, p.costo,
             p.precio_venta, p.unidad_medida, c.nombre AS categoria
      FROM productos p
      LEFT JOIN categorias c ON c.id = p.categoria_id
      WHERE p.activo = TRUE AND (p.stock_actual <= 0 OR p.costo IS NULL)
      ORDER BY p.id
      FOR UPDATE
    `);

    let existenciasAgregadas = 0;
    let costosCompletados = 0;

    for (const producto of productos) {
      const sinExistencia = Number(producto.stock_actual) <= 0;
      const sinCosto = producto.costo === null;
      const base = stockPorCategoria[producto.categoria] ?? 15;
      const variacion = producto.id % 5;
      const nuevaExistencia = sinExistencia
        ? (producto.unidad_medida === 'Pieza' ? base + variacion : base + variacion / 2)
        : Number(producto.stock_actual);
      const nuevoCosto = sinCosto
        ? Math.round(Number(producto.precio_venta) * 0.72 * 100) / 100
        : Number(producto.costo);

      await connection.execute(
        'UPDATE productos SET stock_actual=?, costo=? WHERE id=?',
        [nuevaExistencia, nuevoCosto, producto.id],
      );

      if (sinExistencia) existenciasAgregadas += 1;
      if (sinCosto) costosCompletados += 1;
    }

    await connection.commit();
    console.log(`Carga terminada: ${existenciasAgregadas} productos surtidos y ${costosCompletados} costos completados.`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
} catch (error) {
  console.error(`No fue posible cargar las existencias: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
