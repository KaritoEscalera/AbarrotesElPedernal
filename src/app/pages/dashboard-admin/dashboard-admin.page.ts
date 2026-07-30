import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import {
  IonContent,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonButton
} from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { Auth } from '../../services/auth';
import { BusinessApi } from '../../services/business-api';

interface ResumenDashboard {
  ventasDia: number;
  ventasSemana: number;
  productosBajos: number;
  fiadosPendientes: number;
  ultimasVentas: { folio: string; total: number; metodo: string; hora: string }[];
}

@Component({
  selector: 'app-dashboard-admin',
  templateUrl: './dashboard-admin.page.html',
  styleUrls: ['./dashboard-admin.page.scss'],
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

export class DashboardAdminPage implements OnInit {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly api = inject(BusinessApi);

  ventasDia = '$0.00';
  ventasSemana = '$0.00';
  productosBajos = 0;
  fiadosPendientes = 0;
  cargando = true;
  error = '';

  movimientos: string[] = [];

  get alertas(): string[] {
    return [
      `${this.productosBajos} producto(s) con existencias bajas`,
      `${this.fiadosPendientes} fiado(s) con saldo pendiente`,
    ];
  }

  ngOnInit(): void {
    void this.cargarResumen();
  }

  private async cargarResumen(): Promise<void> {
    try {
      const resumen = await this.api.get<ResumenDashboard>('dashboard');
      this.ventasDia = this.moneda(resumen.ventasDia);
      this.ventasSemana = this.moneda(resumen.ventasSemana);
      this.productosBajos = Number(resumen.productosBajos);
      this.fiadosPendientes = Number(resumen.fiadosPendientes);
      this.movimientos = resumen.ultimasVentas.map(
        (venta) => `${venta.folio} · ${this.moneda(venta.total)} · ${venta.metodo} · ${venta.hora}`,
      );
      if (!this.movimientos.length) this.movimientos = ['Todavía no hay ventas registradas.'];
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
