import { Injectable } from '@angular/core';
import type { Proveedor } from '../models/proveedor';

@Injectable({
  providedIn: 'root',
})
export class Proveedores {
  private readonly clave = 'proveedores';

  obtenerTodos(): Proveedor[] {
    const guardados = localStorage.getItem(this.clave);
    if (!guardados) {
      const iniciales = this.crearDatosIniciales();
      this.guardar(iniciales);
      return iniciales;
    }

    try {
      const datos = JSON.parse(guardados) as Partial<Proveedor>[];
      if (!Array.isArray(datos)) {
        throw new Error('Formato inválido');
      }
      const normalizados = datos.map((proveedor) => this.normalizar(proveedor));
      this.guardar(normalizados);
      return normalizados;
    } catch {
      const iniciales = this.crearDatosIniciales();
      this.guardar(iniciales);
      return iniciales;
    }
  }

  guardarProveedor(proveedor: Proveedor): void {
    const proveedores = this.obtenerTodos();
    const indice = proveedores.findIndex((item) => item.id === proveedor.id);
    if (indice >= 0) {
      proveedores[indice] = { ...proveedor };
    } else {
      proveedor.id = proveedores.length ? Math.max(...proveedores.map((item) => item.id)) + 1 : 1;
      proveedores.push({ ...proveedor });
    }
    this.guardar(proveedores);
  }

  archivar(id: number): void {
    this.guardar(this.obtenerTodos().map((item) => item.id === id ? { ...item, archivado: true } : item));
  }

  cambiarEstado(id: number): void {
    this.guardar(this.obtenerTodos().map((item) => item.id === id
      ? { ...item, estado: item.estado === 'Activo' ? 'Inactivo' : 'Activo' }
      : item));
  }

  private guardar(proveedores: Proveedor[]): void {
    localStorage.setItem(this.clave, JSON.stringify(proveedores));
  }

  private normalizar(proveedor: Partial<Proveedor>): Proveedor {
    return {
      id: proveedor.id ?? 0,
      nombre: proveedor.nombre ?? '',
      empresa: proveedor.empresa ?? '',
      telefono: proveedor.telefono ?? '',
      correo: proveedor.correo ?? '',
      productoPrincipal: proveedor.productoPrincipal ?? '',
      diaEntrega: proveedor.diaEntrega ?? '',
      estado: proveedor.estado ?? 'Activo',
      ultimaCompra: proveedor.ultimaCompra ?? '',
      proximaEntrega: proveedor.proximaEntrega ?? '',
      estadoPedido: proveedor.estadoPedido ?? 'Sin pedido',
      saldoPendiente: proveedor.saldoPendiente ?? 0,
      archivado: proveedor.archivado ?? false,
    };
  }

  private crearDatosIniciales(): Proveedor[] {
    const fecha = (dias: number): string => {
      const valor = new Date();
      valor.setDate(valor.getDate() + dias);
      return valor.toISOString().slice(0, 10);
    };
    return [
      { id: 1, nombre: 'Luis Martínez', empresa: 'Distribuidora Coca-Cola', telefono: '4491234567', correo: 'ventas@cocacola.com', productoPrincipal: 'Refrescos', diaEntrega: 'Lunes', estado: 'Activo', ultimaCompra: fecha(-7), proximaEntrega: fecha(1), estadoPedido: 'Pendiente', saldoPendiente: 3250, archivado: false },
      { id: 2, nombre: 'María González', empresa: 'Grupo Bimbo', telefono: '4497654321', correo: 'pedidos@bimbo.com', productoPrincipal: 'Panadería', diaEntrega: 'Martes y viernes', estado: 'Activo', ultimaCompra: fecha(-3), proximaEntrega: fecha(3), estadoPedido: 'Pendiente', saldoPendiente: 1800, archivado: false },
      { id: 3, nombre: 'Carlos Ramírez', empresa: 'Lácteos del Centro', telefono: '4499876543', correo: 'contacto@lacteoscentro.com', productoPrincipal: 'Lácteos', diaEntrega: 'Miércoles', estado: 'Activo', ultimaCompra: fecha(-10), proximaEntrega: fecha(-1), estadoPedido: 'Atrasado', saldoPendiente: 950, archivado: false },
      { id: 4, nombre: 'Ana López', empresa: 'Botanas Calvillo', telefono: '4951122334', correo: 'pedidos@botanascalvillo.com', productoPrincipal: 'Botanas', diaEntrega: 'Jueves', estado: 'Inactivo', ultimaCompra: fecha(-30), proximaEntrega: '', estadoPedido: 'Sin pedido', saldoPendiente: 0, archivado: false },
    ];
  }
}
