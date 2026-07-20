import { Routes } from '@angular/router';
import { adminGuard } from './guards/admin-guard';
import { authGuard } from './guards/auth-guard';
import { roleGuard } from './guards/role-guard';
import { guestGuard } from './guards/guest-guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: 'login',
    title: 'Iniciar sesión | Abarrotes El Pedernal',
    loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage),
    canActivate: [guestGuard],
  },
  {
    path: 'perfil',
    title: 'Mi cuenta | Abarrotes El Pedernal',
    loadComponent: () => import('./pages/perfil/perfil.page').then((m) => m.PerfilPage),
    canActivate: [authGuard],
  },
  {
    path: 'dashboard-admin',
    title: 'Administración | Abarrotes El Pedernal',
    loadComponent: () => import('./pages/dashboard-admin/dashboard-admin.page').then((m) => m.DashboardAdminPage),
    canActivate: [authGuard, adminGuard],
  },
  {
    path: 'dashboard-gerente',
    title: 'Gerencia | Abarrotes El Pedernal',
    loadComponent: () => import('./pages/dashboard-gerente/dashboard-gerente.page').then((m) => m.DashboardGerentePage),
    canActivate: [authGuard, roleGuard],
    data: { roles: ['administrador', 'gerente'] },
  },
  {
    path: 'dashboard-cajera',
    title: 'Caja | Abarrotes El Pedernal',
    loadComponent: () => import('./pages/dashboard-cajera/dashboard-cajera.page').then((m) => m.DashboardCajeraPage),
    canActivate: [authGuard, roleGuard],
    data: { roles: ['administrador', 'cajera'] },
  },
  {
    path: 'productos',
    title: 'Productos | Abarrotes El Pedernal',
    loadComponent: () => import('./pages/productos/productos.page').then((m) => m.ProductosPage),
    canActivate: [authGuard, roleGuard],
    data: { roles: ['administrador', 'gerente'] },
  },
  {
    path: 'usuarios',
    title: 'Usuarios | Abarrotes El Pedernal',
    loadComponent: () => import('./pages/usuarios/usuarios.page').then((m) => m.UsuariosPage),
    canActivate: [authGuard, adminGuard],
  },
  {
    path: 'inventario',
    title: 'Inventario | Abarrotes El Pedernal',
    loadComponent: () => import('./pages/inventario/inventario.page').then((m) => m.InventarioPage),
    canActivate: [authGuard, roleGuard],
    data: { roles: ['administrador', 'gerente'] },
  },
  {
    path: 'caja',
    title: 'Caja | Abarrotes El Pedernal',
    loadComponent: () => import('./pages/caja/caja.page').then((m) => m.CajaPage),
    canActivate: [authGuard, roleGuard],
    data: { roles: ['administrador', 'gerente', 'cajera'] },
  },
  {
    path: 'clientes',
    title: 'Clientes | Abarrotes El Pedernal',
    loadComponent: () => import('./pages/clientes/clientes.page').then((m) => m.ClientesPage),
    canActivate: [authGuard, roleGuard],
    data: { roles: ['administrador', 'gerente', 'cajera'] },
  },
  {
    path: 'proveedores',
    title: 'Proveedores | Abarrotes El Pedernal',
    loadComponent: () => import('./pages/proveedores/proveedores.page').then((m) => m.ProveedoresPage),
    canActivate: [authGuard, roleGuard],
    data: { roles: ['administrador', 'gerente'] },
  },
  {
    path: 'compras',
    title: 'Compras | Abarrotes El Pedernal',
    loadComponent: () => import('./pages/compras/compras.page').then((m) => m.ComprasPage),
    canActivate: [authGuard, roleGuard],
    data: { roles: ['administrador', 'gerente'] },
  },
  {
    path: 'fiados',
    title: 'Fiados | Abarrotes El Pedernal',
    loadComponent: () => import('./pages/fiados/fiados.page').then((m) => m.FiadosPage),
    canActivate: [authGuard, roleGuard],
    data: { roles: ['administrador', 'gerente', 'cajera'] },
  },
  {
    path: 'reportes',
    title: 'Reportes | Abarrotes El Pedernal',
    loadComponent: () => import('./pages/reportes/reportes.page').then((m) => m.ReportesPage),
    canActivate: [authGuard, adminGuard],
  },
  {
    path: 'estadisticas',
    title: 'Estadísticas | Abarrotes El Pedernal',
    loadComponent: () => import('./pages/estadisticas/estadisticas.page').then((m) => m.EstadisticasPage),
    canActivate: [authGuard, roleGuard],
    data: { roles: ['administrador', 'gerente'] },
  },
  {
    path: 'bitacora',
    title: 'Bitácora | Abarrotes El Pedernal',
    loadComponent: () => import('./pages/bitacora/bitacora.page').then((m) => m.BitacoraPage),
    canActivate: [authGuard, adminGuard],
  },
  {
    path: 'respaldos',
    title: 'Respaldos | Abarrotes El Pedernal',
    loadComponent: () => import('./pages/respaldos/respaldos.page').then((m) => m.RespaldosPage),
    canActivate: [authGuard, adminGuard],
  },
  {
    path: 'sat',
    title: 'SAT | Abarrotes El Pedernal',
    loadComponent: () => import('./pages/sat/sat.page').then((m) => m.SatPage),
    canActivate: [authGuard, adminGuard],
  },
  {
    path: '**',
    redirectTo: 'login',
  },
];
