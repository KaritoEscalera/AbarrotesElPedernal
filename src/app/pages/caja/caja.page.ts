import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonContent,
  IonInput, IonItem, IonLabel, IonSelect, IonSelectOption,
} from '@ionic/angular/standalone';
import { BusinessApi } from '../../services/business-api';

interface ProductoCaja {
  id: number;
  codigo: string | null;
  nombre: string;
  stock: number;
  precioVenta: number;
  tasaIva: number;
  activo: boolean;
}

interface ClienteCaja { id: number; nombre: string; telefono: string; activo: boolean; }
interface LineaCarrito extends ProductoCaja { cantidad: number; }
interface SesionCaja { id: number; estado: 'ABIERTA'; fondoInicial: number; fechaApertura: string; }
interface MovimientoCaja { id: number; tipo: string; descripcion: string; metodo: string; monto: number; fecha: string; }

interface EstadoCaja {
  session: SesionCaja | null;
  totals: { ventas: number; efectivoEsperado: number } | null;
  movements: MovimientoCaja[];
}

@Component({
  selector: 'app-caja',
  templateUrl: './caja.page.html',
  styleUrls: ['./caja.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonCard, IonCardHeader, IonCardTitle,
    IonCardContent, IonButton, IonInput, IonItem, IonLabel, IonSelect, IonSelectOption],
})
export class CajaPage implements OnInit {
  private readonly api = inject(BusinessApi);

  productos: ProductoCaja[] = [];
  clientes: ClienteCaja[] = [];
  carrito: LineaCarrito[] = [];
  sesion: SesionCaja | null = null;
  movimientos: MovimientoCaja[] = [];
  ventasTurno = 0;
  efectivoEsperado = 0;
  busqueda = '';
  fondoInicial: number | null = 1000;
  metodo: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'FIADO' = 'EFECTIVO';
  clienteId: number | null = null;
  referencia = '';
  efectivoRecibido: number | null = null;
  efectivoContado: number | null = null;
  movimientoTipo: 'INGRESO' | 'SALIDA' = 'SALIDA';
  movimientoMonto: number | null = null;
  movimientoDescripcion = '';
  mensaje = '';
  error = '';
  procesando = false;

  async ngOnInit(): Promise<void> { await this.cargarTodo(); }

  get productosFiltrados(): ProductoCaja[] {
    const term = this.busqueda.trim().toLowerCase();
    return this.productos.filter((p) => p.activo && p.stock > 0 && (!term || p.nombre.toLowerCase().includes(term) || p.codigo?.toLowerCase().includes(term))).slice(0, 30);
  }

  get subtotal(): number { return this.carrito.reduce((sum, p) => sum + p.precioVenta * p.cantidad, 0); }
  get impuestos(): number { return this.carrito.reduce((sum, p) => sum + p.precioVenta * p.cantidad * p.tasaIva / 100, 0); }
  get total(): number { return Math.round((this.subtotal + this.impuestos) * 100) / 100; }
  get cambio(): number { return this.metodo === 'EFECTIVO' && Number(this.efectivoRecibido) > this.total ? Number(this.efectivoRecibido) - this.total : 0; }

  agregar(producto: ProductoCaja): void {
    const linea = this.carrito.find((item) => item.id === producto.id);
    if (linea) {
      if (linea.cantidad < producto.stock) linea.cantidad += 1;
    } else {
      this.carrito = [...this.carrito, { ...producto, cantidad: 1 }];
    }
  }

  cambiarCantidad(linea: LineaCarrito, cantidad: unknown): void {
    const nueva = Number(cantidad);
    if (!Number.isFinite(nueva) || nueva <= 0) this.quitar(linea.id);
    else linea.cantidad = Math.min(nueva, linea.stock);
  }

  quitar(id: number): void { this.carrito = this.carrito.filter((item) => item.id !== id); }

  async abrirCaja(): Promise<void> {
    const fondo = Number(this.fondoInicial);
    if (!Number.isFinite(fondo) || fondo < 0) return this.fallar('Ingresa un fondo inicial válido.');
    await this.ejecutar(async () => {
      await this.api.post('cash/open', { fondoInicial: fondo });
      await this.cargarEstado();
      this.mensaje = 'Caja abierta correctamente.';
    });
  }

  async cobrar(): Promise<void> {
    if (!this.sesion) return this.fallar('Abre la caja antes de cobrar.');
    if (!this.carrito.length) return this.fallar('Agrega al menos un producto.');
    if (this.metodo === 'FIADO' && !this.clienteId) return this.fallar('Selecciona un cliente para el fiado.');
    if (['TARJETA', 'TRANSFERENCIA'].includes(this.metodo) && !this.referencia.trim()) return this.fallar('Captura la referencia del pago.');
    if (this.metodo === 'EFECTIVO' && Number(this.efectivoRecibido) < this.total) return this.fallar('El efectivo recibido es menor al total.');
    await this.ejecutar(async () => {
      const venta = await this.api.post<{ folio: string; total: number }>('sales', {
        items: this.carrito.map((p) => ({ productoId: p.id, cantidad: p.cantidad })),
        metodo: this.metodo,
        clienteId: this.clienteId,
        referencia: this.referencia,
      });
      const cambio = this.cambio;
      this.carrito = [];
      this.referencia = '';
      this.clienteId = null;
      this.efectivoRecibido = null;
      await this.cargarTodo();
      this.mensaje = `Venta ${venta.folio} registrada por $${Number(venta.total).toFixed(2)}${cambio ? `; cambio $${cambio.toFixed(2)}` : ''}.`;
    });
  }

  async registrarMovimiento(): Promise<void> {
    const monto = Number(this.movimientoMonto);
    if (!monto || monto <= 0 || !this.movimientoDescripcion.trim()) return this.fallar('Captura descripción y monto del movimiento.');
    await this.ejecutar(async () => {
      await this.api.post('cash/movements', { tipo: this.movimientoTipo, monto, descripcion: this.movimientoDescripcion });
      this.movimientoMonto = null;
      this.movimientoDescripcion = '';
      await this.cargarEstado();
      this.mensaje = 'Movimiento registrado.';
    });
  }

  async cerrarCaja(): Promise<void> {
    const contado = Number(this.efectivoContado);
    if (!Number.isFinite(contado) || contado < 0) return this.fallar('Captura el efectivo contado.');
    await this.ejecutar(async () => {
      const corte = await this.api.post<{ diferencia: number }>('cash/close', { efectivoContado: contado });
      this.efectivoContado = null;
      await this.cargarEstado();
      this.mensaje = `Caja cerrada. Diferencia: $${Number(corte.diferencia).toFixed(2)}.`;
    });
  }

  private async cargarTodo(): Promise<void> {
    await Promise.all([this.cargarEstado(), this.cargarCatalogos()]);
  }

  private async cargarCatalogos(): Promise<void> {
    const [productos, clientes] = await Promise.all([
      this.api.get<ProductoCaja[]>('products'),
      this.api.get<ClienteCaja[]>('clients'),
    ]);
    this.productos = productos.map((p) => ({ ...p, stock: Number(p.stock), precioVenta: Number(p.precioVenta), tasaIva: Number(p.tasaIva) }));
    this.clientes = clientes.filter((c) => c.activo);
  }

  private async cargarEstado(): Promise<void> {
    const estado = await this.api.get<EstadoCaja>('cash/current');
    this.sesion = estado.session ? { ...estado.session, fondoInicial: Number(estado.session.fondoInicial) } : null;
    this.movimientos = estado.movements.map((m) => ({ ...m, monto: Number(m.monto) }));
    this.ventasTurno = Number(estado.totals?.ventas ?? 0);
    this.efectivoEsperado = Number(estado.totals?.efectivoEsperado ?? 0);
  }

  private async ejecutar(accion: () => Promise<void>): Promise<void> {
    this.procesando = true;
    this.error = '';
    this.mensaje = '';
    try { await accion(); }
    catch (e: unknown) {
      const response = e as { error?: { error?: { error?: string } } };
      this.error = response.error?.error?.error ?? 'No fue posible completar la operación.';
    } finally { this.procesando = false; }
  }

  private fallar(mensaje: string): void { this.error = mensaje; this.mensaje = ''; }
}
