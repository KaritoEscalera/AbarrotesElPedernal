import type { RolUsuario } from '../services/auth';

export interface Usuario {
  id: number;
  nombre: string;
  correo: string;
  password: string;
  rol: RolUsuario;
  activo: boolean;
}
