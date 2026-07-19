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

interface ResumenCajera {
  ventasDia: number;
  numeroVentas: number;
  fiadosPendientes: number;
  caja: { estado: string } | null;
  ultimasVentas: { folio: string; total: number; metodo: string }[];
}

@Component({
  selector: 'app-dashboard-cajera',
  templateUrl: './dashboard-cajera.page.html',
  styleUrls: ['./dashboard-cajera.page.scss'],
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
export class DashboardCajeraPage implements OnInit {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly api = inject(BusinessApi);

  ventasDia = '$0.00';
  numeroVentas = 0;
  caja = 'CERRADA';
  cargando = true;
  error = '';

  ultimasVentas: string[] = [];

  pendientes = [
    {
      mensaje: '2 fiados requieren seguimiento',
      enlace: '/fiados',
      accion: 'Ver fiados',
    },
    {
      mensaje: 'Recuerda verificar el fondo y estado de la caja',
      enlace: '/caja',
      accion: 'Ir a caja',
    },
  ];

  ngOnInit(): void {
    void this.cargarResumen();
  }

  private async cargarResumen(): Promise<void> {
    try {
      const resumen = await this.api.get<ResumenCajera>('dashboard');
      this.ventasDia = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(resumen.ventasDia));
      this.numeroVentas = resumen.numeroVentas;
      this.caja = resumen.caja?.estado ?? 'CERRADA';
      this.ultimasVentas = resumen.ultimasVentas.map((venta) =>
        `${venta.folio} · ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(venta.total))} · ${venta.metodo}`,
      );
      if (!this.ultimasVentas.length) this.ultimasVentas = ['Todavía no has registrado ventas.'];
      this.pendientes[0].mensaje = `${resumen.fiadosPendientes} fiados requieren seguimiento`;
    } catch {
      this.error = 'No fue posible cargar tu turno. Verifica que la API esté encendida.';
    } finally {
      this.cargando = false;
    }
  }

  cerrarSesion(): void {
    this.auth.cerrarSesion();
    void this.router.navigateByUrl('/login');
  }
}
