import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonSearchbar,
} from '@ionic/angular/standalone';
import { BusinessApi } from '../../services/business-api';

@Component({
  selector: 'app-productos',
  templateUrl: './productos.page.html',
  styleUrls: ['./productos.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonButton,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonContent,
    IonSearchbar,
  ],
})
export class ProductosPage implements OnInit {
  private readonly api = inject(BusinessApi);
  terminoBusqueda = '';

  productos: Array<{ nombre: string; codigo: string; precio: string; stock: number; minimo: number }> = [];

  async ngOnInit(): Promise<void> {
    try {
      const datos = await this.api.get<Array<{ nombre: string; codigo: string | null; precioVenta: number; stock: number; stockMinimo: number }>>('products');
      this.productos = datos.map((p) => ({ nombre: p.nombre, codigo: p.codigo ?? '', precio: new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(p.precioVenta), stock: Number(p.stock), minimo: Number(p.stockMinimo) }));
    } catch { this.productos = []; }
  }

  get productosFiltrados() {
    const termino = this.terminoBusqueda.trim().toLowerCase();

    if (!termino) {
      return this.productos;
    }

    return this.productos.filter(({ nombre, codigo }) =>
      `${nombre} ${codigo}`.toLowerCase().includes(termino)
    );
  }

  estadoStock(producto: { stock: number; minimo: number }) {
    return producto.stock <= producto.minimo ? 'Bajo' : 'Disponible';
  }
}
