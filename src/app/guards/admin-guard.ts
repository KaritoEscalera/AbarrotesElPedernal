import { inject } from '@angular/core';
import {
  CanActivateFn,
  Router
} from '@angular/router';

export const adminGuard: CanActivateFn = () => {

  const router = inject(Router);

  const sesionActiva =
    localStorage.getItem('sesionActiva') === 'true';

  const rol =
    localStorage.getItem('rol');

  if (
    sesionActiva &&
    rol === 'Administrador'
  ) {
    return true;
  }

  if (!sesionActiva) {
    return router.createUrlTree(['/login']);
  }

  const rutasPorRol: Record<string, string> = {
    Administrador: '/dashboard-admin',
    Gerente: '/dashboard-gerente',
    Cajera: '/dashboard-cajera'
  };

  return router.createUrlTree([
    rutasPorRol[rol ?? ''] ?? '/login'
  ]);

};
