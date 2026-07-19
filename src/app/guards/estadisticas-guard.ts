import { inject } from '@angular/core';
import {
  CanActivateFn,
  Router
} from '@angular/router';

export const estadisticasGuard: CanActivateFn = () => {
  const router = inject(Router);

  const sesionActiva =
    localStorage.getItem('sesionActiva') === 'true';

  const rol = localStorage.getItem('rol');

  if (
    sesionActiva &&
    (rol === 'Administrador' || rol === 'Gerente')
  ) {
    return true;
  }

  if (rol === 'Cajera') {
    return router.createUrlTree(['/dashboard-cajera']);
  }

  return router.createUrlTree(['/login']);
};