import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full',
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.page').then( m => m.LoginPage)
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./pages/dashboard/dashboard.page').then( m => m.DashboardPage)
  },
  {
    path: 'productos',
    loadComponent: () => import('./pages/productos/productos.page').then( m => m.ProductosPage)
  },
  {
    path: 'inventario',
    loadComponent: () => import('./pages/inventario/inventario.page').then( m => m.InventarioPage)
  },
  {
    path: 'proveedores',
    loadComponent: () => import('./pages/proveedores/proveedores.page').then( m => m.ProveedoresPage)
  },
  {
    path: 'clientes',
    loadComponent: () => import('./pages/clientes/clientes.page').then( m => m.ClientesPage)
  },
  {
    path: 'fiados',
    loadComponent: () => import('./pages/fiados/fiados.page').then( m => m.FiadosPage)
  },
  {
    path: 'caja',
    loadComponent: () => import('./pages/caja/caja.page').then( m => m.CajaPage)
  },
  {
    path: 'reportes',
    loadComponent: () => import('./pages/reportes/reportes.page').then( m => m.ReportesPage)
  },
  {
    path: 'estadisticas',
    loadComponent: () => import('./pages/estadisticas/estadisticas.page').then( m => m.EstadisticasPage)
  },
  {
    path: 'bitacora',
    loadComponent: () => import('./pages/bitacora/bitacora.page').then( m => m.BitacoraPage)
  },
  {
    path: 'respaldos',
    loadComponent: () => import('./pages/respaldos/respaldos.page').then( m => m.RespaldosPage)
  },
  {
    path: 'sat',
    loadComponent: () => import('./pages/sat/sat.page').then( m => m.SatPage)
  },
];
