export type EstadoProveedor = 'Activo' | 'Inactivo';
export type EstadoPedido = 'Sin pedido' | 'Pendiente' | 'Recibido' | 'Atrasado';

export interface Proveedor {
  id: number;
  nombre: string;
  empresa: string;
  telefono: string;
  correo: string;
  productoPrincipal: string;
  diaEntrega: string;
  estado: EstadoProveedor;
  ultimaCompra: string;
  proximaEntrega: string;
  estadoPedido: EstadoPedido;
  saldoPendiente: number;
  archivado: boolean;
}
