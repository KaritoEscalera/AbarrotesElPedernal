import { Component, inject } from '@angular/core';

import {
  IonContent,
  IonButton,
  IonItem,
  IonInput
} from '@ionic/angular/standalone';

import { FormsModule } from '@angular/forms';

import { Router } from '@angular/router';
import { Auth } from '../../services/auth';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,

  imports: [
    IonContent,
    IonButton,
    IonItem,
    IonInput,
    FormsModule
  ],
})

export class LoginPage {

  correo: string = '';
  password: string = '';

  private readonly router = inject(Router);
  private readonly auth = inject(Auth);

  cargando = false;

  async login(): Promise<void> {
    this.cargando = true;
    try {
      const rol = await this.auth.iniciarSesionApi(this.correo, this.password);
      void this.router.navigateByUrl(this.auth.rutaInicial(rol));
    } catch {
      alert('No fue posible iniciar sesión. Verifica tus datos y que la API esté encendida.');
    } finally {
      this.cargando = false;
    }
  }

}
