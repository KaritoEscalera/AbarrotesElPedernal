import { Injectable } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';

interface BluetoothPrinterPlugin {
  print(options: { text: string; deviceName?: string; printLogo?: boolean }): Promise<{ deviceName: string }>;
}

const BluetoothPrinter = registerPlugin<BluetoothPrinterPlugin>('BluetoothPrinter');

@Injectable({ providedIn: 'root' })
export class BluetoothPrinterService {
  get disponible(): boolean {
    return Capacitor.getPlatform() === 'android';
  }

  async imprimir(texto: string): Promise<string> {
    const resultado = await BluetoothPrinter.print({
      text: texto,
      deviceName: 'Bluetooth Printer',
      // El logo se envía por franjas para impresoras térmicas con memoria reducida.
      printLogo: true,
    });
    return resultado.deviceName;
  }
}
