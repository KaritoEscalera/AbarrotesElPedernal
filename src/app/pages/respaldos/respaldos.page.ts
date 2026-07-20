import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonContent, IonInput, IonItem, IonLabel } from '@ionic/angular/standalone';
import { environment } from '../../../environments/environment';
import { BusinessApi } from '../../services/business-api';

interface Respaldo { id:number; nombre:string; tipo:string; tamanio:number; estado:string; fecha:string; error:string|null; }

@Component({selector:'app-respaldos',templateUrl:'./respaldos.page.html',styleUrls:['./respaldos.page.scss'],standalone:true,
  imports:[CommonModule,FormsModule,IonButton,IonContent,IonInput,IonItem,IonLabel]})
export class RespaldosPage implements OnInit {
  private readonly api=inject(BusinessApi);
  respaldos:Respaldo[]=[];archivo:File|null=null;confirmacion='';mensaje='';error='';procesando=false;
  async ngOnInit():Promise<void>{await this.cargar();}
  async exportar():Promise<void>{
    this.iniciar();
    try{const response=await fetch(`${environment.apiUrl}/backups/export`,{headers:{Authorization:`Bearer ${localStorage.getItem('token')??''}`}});if(!response.ok)throw new Error(await this.errorApi(response));const blob=await response.blob();const disposition=response.headers.get('Content-Disposition')??'';const name=/filename="([^"]+)"/.exec(disposition)?.[1]??'abarrotes-pedernal.sql';const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);this.mensaje='Respaldo completo de MySQL creado y descargado.';await this.cargar();}catch(e){this.error=e instanceof Error?e.message:'No fue posible crear el respaldo.';}finally{this.procesando=false;}
  }
  seleccionar(event:Event):void{const input=event.target as HTMLInputElement;this.archivo=input.files?.[0]??null;this.error='';if(this.archivo&&!this.archivo.name.toLowerCase().endsWith('.sql')){this.error='Selecciona un archivo .sql.';this.archivo=null;input.value='';}}
  async restaurar():Promise<void>{
    if(!this.archivo||this.confirmacion!=='RESTAURAR'){this.error='Selecciona el SQL y escribe RESTAURAR para confirmar.';return;}
    if(!confirm('La restauración puede reemplazar información actual. ¿Deseas continuar?'))return;
    this.iniciar();
    try{const sql=await this.archivo.text();const response=await fetch(`${environment.apiUrl}/backups/import`,{method:'POST',headers:{Authorization:`Bearer ${localStorage.getItem('token')??''}`,'Content-Type':'application/sql','X-Confirm-Restore':'RESTAURAR'},body:sql});if(!response.ok)throw new Error(await this.errorApi(response));this.archivo=null;this.confirmacion='';this.mensaje='Base de datos restaurada. Cierra sesión y vuelve a ingresar para refrescar la información.';await this.cargar();}catch(e){this.error=e instanceof Error?e.message:'No fue posible restaurar la base.';}finally{this.procesando=false;}
  }
  formato(bytes:number):string{return bytes<1048576?`${(bytes/1024).toFixed(1)} KB`:`${(bytes/1048576).toFixed(1)} MB`;}
  private async cargar():Promise<void>{try{this.respaldos=(await this.api.get<Respaldo[]>('backups')).map(r=>({...r,tamanio:Number(r.tamanio)}));}catch{this.error='No fue posible consultar el historial de respaldos.';}}
  private iniciar():void{this.procesando=true;this.mensaje='';this.error='';}
  private async errorApi(response:Response):Promise<string>{try{return String((await response.json()).error??`Error HTTP ${response.status}`);}catch{return `Error HTTP ${response.status}`;}}
}
