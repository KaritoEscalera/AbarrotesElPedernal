import { Component, inject } from '@angular/core';
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

export class DashboardAdminPage {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  ventasDia = '$8,500';
  ventasMes = '$120,000';
  productosBajos = 12;
  clientes = 58;

  movimientos = [
    'Venta #1001 · Coca Cola 600 ml',
    'Cliente agregado · Juan Pérez',
    'Producto agregado · Leche Lala',
    'Caja abierta · 09:00 a. m.',
  ];

  alertas = [
    '3 productos con existencias bajas',
    '2 clientes tienen adeudo',
    '1 proveedor está pendiente',
  ];

  cerrarSesion(): void {
    this.auth.cerrarSesion();
    void this.router.navigateByUrl('/login');
  }
}
