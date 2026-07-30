import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { jsPDF } from 'jspdf';

export async function descargarPdf(documento: jsPDF, nombreArchivo: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    documento.save(nombreArchivo);
    return;
  }

  const dataUri = documento.output('datauristring');
  const base64 = dataUri.slice(dataUri.indexOf(',') + 1);
  const archivo = nombreArchivo.replace(/[^a-zA-Z0-9._-]/g, '-');
  const resultado = await Filesystem.writeFile({
    path: archivo,
    data: base64,
    directory: Directory.Cache,
  });

  await Share.share({
    title: nombreArchivo,
    text: 'PDF generado por Abarrotes El Pedernal',
    url: resultado.uri,
    dialogTitle: 'Guardar, abrir o compartir PDF',
  });
}
