import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../../services/auth';
import { BusinessApi } from '../../services/business-api';

import {
  IonContent,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonButton
} from '@ionic/angular/standalone';

interface ResumenDashboard {
  ventasDia: number;
  ventasSemana: number;
  productosBajos: number;
  fiadosPendientes: number;
  ultimasVentas: { folio: string; total: number; metodo: string; hora: string }[];
}

@Component({
  selector: 'app-dashboard-gerente',
  templateUrl: './dashboard-gerente.page.html',
  styleUrls: ['./dashboard-gerente.page.scss'],
  standalone: true,

  imports: [
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonButton,
    RouterLink,
    CommonModule
  ]
})
export class DashboardGerentePage implements OnInit {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly api = inject(BusinessApi);

  ventasDia = '$0.00';
  ventasSemana = '$0.00';
  productosBajos = 0;
  fiados = 0;
  cargando = true;
  error = '';

  movimientos: string[] = [];

  alertas = [
    {
      id: 'stock-bajo',
      mensaje: '8 productos tienen existencias bajas',
      enlace: '/inventario',
      accion: 'Ver inventario',
    },
    {
      id: 'fiados',
      mensaje: '4 clientes tienen adeudos pendientes',
      enlace: '/fiados',
      accion: 'Ver fiados',
    },
    {
      id: 'proveedor',
      mensaje: 'Un proveedor tiene un pedido pendiente',
      enlace: '/proveedores',
      accion: 'Ver proveedores',
    },
  ];

  ngOnInit(): void {
    void this.cargarResumen();
  }

  private async cargarResumen(): Promise<void> {
    try {
      const resumen = await this.api.get<ResumenDashboard>('dashboard');
      this.ventasDia = this.moneda(resumen.ventasDia);
      this.ventasSemana = this.moneda(resumen.ventasSemana);
      this.productosBajos = resumen.productosBajos;
      this.fiados = resumen.fiadosPendientes;
      this.movimientos = resumen.ultimasVentas.map((venta) =>
        `${venta.folio} · ${this.moneda(venta.total)} · ${venta.metodo} · ${venta.hora}`,
      );
      if (!this.movimientos.length) this.movimientos = ['Todavía no hay ventas registradas.'];
      this.alertas[0].mensaje = `${this.productosBajos} productos tienen existencias bajas`;
      this.alertas[1].mensaje = `${this.fiados} fiados tienen saldo pendiente`;
    } catch {
      this.error = 'No fue posible cargar el resumen. Verifica que la API esté encendida.';
    } finally {
      this.cargando = false;
    }
  }

  private moneda(valor: number): string {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(valor));
  }

  cerrarSesion(): void {
    this.auth.cerrarSesion();
    void this.router.navigateByUrl('/login');
  }
}
