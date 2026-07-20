import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  IonButton,
  IonContent,
  IonInput,
  IonItem,
  IonLabel,
  IonSearchbar,
  IonSelect,
  IonSelectOption
} from '@ionic/angular/standalone';
import { BusinessApi } from '../../services/business-api';

interface ProductoInventario {
  id: number;
  codigo: string;
  nombre: string;
  categoria: string;
  stock: number;
  stockMinimo: number;
  precioVenta: number;
}

@Component({
  selector: 'app-inventario',
  templateUrl: './inventario.page.html',
  styleUrls: ['./inventario.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    IonButton,
    IonInput,
    IonItem,
    IonLabel,
    IonSearchbar,
    IonSelect,
    IonSelectOption
  ]
})
export class InventarioPage implements OnInit {
  private readonly api = inject(BusinessApi);

  busqueda = '';
  filtroEstado = 'todos';
  entradaVisible = false;
  productoEntradaId = 1;
  cantidadEntrada: number | null = null;
  mensajeEntrada = '';

  productos: ProductoInventario[] = [];

  async ngOnInit(): Promise<void> { await this.cargarProductos(); }

  get productosFiltrados(): ProductoInventario[] {
    const texto = this.busqueda.toLowerCase().trim();

    return this.productos.filter((producto) => {
      const coincideBusqueda =
        producto.nombre.toLowerCase().includes(texto) ||
        producto.codigo.toLowerCase().includes(texto) ||
        producto.categoria.toLowerCase().includes(texto);

      const estado = this.obtenerEstado(producto);

      const coincideEstado =
        this.filtroEstado === 'todos' ||
        this.filtroEstado === estado;

      return coincideBusqueda && coincideEstado;
    });
  }

  get totalProductos(): number {
    return this.productos.length;
  }

  get productosBajos(): number {
    return this.productos.filter(
      producto =>
        producto.stock > 0 &&
        producto.stock <= producto.stockMinimo
    ).length;
  }

  get productosAgotados(): number {
    return this.productos.filter(
      producto => producto.stock === 0
    ).length;
  }

  obtenerEstado(
    producto: ProductoInventario
  ): 'disponible' | 'bajo' | 'agotado' {

    if (producto.stock === 0) {
      return 'agotado';
    }

    if (producto.stock <= producto.stockMinimo) {
      return 'bajo';
    }

    return 'disponible';
  }

  async aumentarStock(producto: ProductoInventario): Promise<void> {
    await this.ajustarStock(producto, 1);
  }

  async disminuirStock(producto: ProductoInventario): Promise<void> {
    if (producto.stock > 0) {
      await this.ajustarStock(producto, -1);
    }
  }

  registrarEntrada(): void {
    this.entradaVisible = !this.entradaVisible;
    this.mensajeEntrada = '';
  }

  async guardarEntrada(): Promise<void> {
    const producto = this.productos.find(
      item => item.id === Number(this.productoEntradaId)
    );
    const cantidad = Number(this.cantidadEntrada);

    if (!producto || !Number.isInteger(cantidad) || cantidad <= 0) {
      this.mensajeEntrada = 'Ingresa una cantidad válida mayor a cero.';
      return;
    }

    try { await this.ajustarStock(producto, cantidad); this.mensajeEntrada = `Se agregaron ${cantidad} unidades de ${producto.nombre} en MySQL.`; this.cantidadEntrada = null; }
    catch { this.mensajeEntrada = 'No fue posible actualizar el inventario.'; }
  }

  private async ajustarStock(producto: ProductoInventario, cantidad: number): Promise<void> { const r = await this.api.patch<{ stock: number }>(`products/${producto.id}/stock`, { cantidad }); producto.stock = Number(r.stock); }
  private async cargarProductos(): Promise<void> { try { const datos = await this.api.get<Array<ProductoInventario & { codigo: string | null; categoria: string | null }>>('products'); this.productos = datos.map((p) => ({ ...p, codigo: p.codigo ?? '', categoria: p.categoria ?? 'Sin categoría', stock: Number(p.stock), stockMinimo: Number(p.stockMinimo), precioVenta: Number(p.precioVenta) })); } catch { this.mensajeEntrada = 'No fue posible consultar el inventario en MySQL.'; } }
}
