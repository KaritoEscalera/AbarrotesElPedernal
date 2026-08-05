package com.abarroteselpedernal.app;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.OutputStream;
import java.nio.charset.Charset;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@CapacitorPlugin(
    name = "BluetoothPrinter",
    permissions = {
        @Permission(
            alias = "bluetooth",
            strings = { Manifest.permission.BLUETOOTH_CONNECT }
        )
    }
)
public class BluetoothPrinterPlugin extends Plugin {
    private static final UUID SERIAL_PORT_UUID =
        UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    @PluginMethod
    public void print(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            && getPermissionState("bluetooth") != PermissionState.GRANTED) {
            requestPermissionForAlias("bluetooth", call, "bluetoothPermissionCallback");
            return;
        }
        printTicket(call);
    }

    @PermissionCallback
    private void bluetoothPermissionCallback(PluginCall call) {
        if (getPermissionState("bluetooth") == PermissionState.GRANTED) {
            printTicket(call);
        } else {
            call.reject("Se necesita permiso para usar la impresora Bluetooth.");
        }
    }

    private void printTicket(PluginCall call) {
        final String text = call.getString("text", "");
        final String requestedName = call.getString("deviceName", "Bluetooth Printer");
        final boolean printLogo = call.getBoolean("printLogo", true);
        if (text.trim().isEmpty()) {
            call.reject("El ticket está vacío.");
            return;
        }

        getBridge().executeOnMainThread(() ->
            new Thread(() -> {
                BluetoothSocket socket = null;
                try {
                    BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
                    if (adapter == null) {
                        call.reject("Esta tablet no tiene Bluetooth.");
                        return;
                    }
                    if (!adapter.isEnabled()) {
                        call.reject("Activa Bluetooth para imprimir.");
                        return;
                    }

                    BluetoothDevice printer = findPrinter(adapter.getBondedDevices(), requestedName);
                    if (printer == null) {
                        call.reject("Empareja una impresora llamada “Bluetooth Printer” en Ajustes.");
                        return;
                    }

                    socket = printer.createRfcommSocketToServiceRecord(SERIAL_PORT_UUID);
                    socket.connect();
                    OutputStream output = socket.getOutputStream();
                    output.write(new byte[] { 0x1B, 0x40 });
                    if (printLogo) {
                        writeTicketLogo(output);
                    }
                    output.write(text.getBytes(Charset.forName("CP850")));
                    output.write(new byte[] { 0x0A, 0x0A, 0x0A });
                    output.flush();

                    JSObject result = new JSObject();
                    result.put("deviceName", printer.getName());
                    call.resolve(result);
                } catch (SecurityException error) {
                    call.reject("Android no autorizó el acceso a Bluetooth.", error);
                } catch (Exception error) {
                    call.reject("No fue posible conectar con la impresora Bluetooth.", error);
                } finally {
                    if (socket != null) {
                        try { socket.close(); } catch (Exception ignored) { }
                    }
                }
            }).start()
        );
    }

    /**
     * Sends the bundled logo using the ESC/POS GS v 0 raster command. The
     * ordered dithering preserves colored details on a monochrome thermal
     * printer without requiring a second bitmap in the web application.
     */
    private void writeTicketLogo(OutputStream output) throws Exception {
        Bitmap source = BitmapFactory.decodeResource(
            getContext().getResources(),
            R.drawable.ticket_logo
        );
        if (source == null) return;

        final int maxWidth = 320;
        int width = Math.min(maxWidth, source.getWidth());
        int height = Math.max(1, Math.round(source.getHeight() * (width / (float) source.getWidth())));
        Bitmap bitmap = source.getWidth() == width
            ? source
            : Bitmap.createScaledBitmap(source, width, height, true);

        int widthBytes = (width + 7) / 8;
        byte[] raster = new byte[widthBytes * height];
        int[][] bayer4 = {
            { 0,  8,  2, 10 },
            { 12, 4, 14,  6 },
            { 3, 11,  1,  9 },
            { 15, 7, 13,  5 }
        };

        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int color = bitmap.getPixel(x, y);
                int alpha = (color >>> 24) & 0xFF;
                int red = (color >>> 16) & 0xFF;
                int green = (color >>> 8) & 0xFF;
                int blue = color & 0xFF;
                // Composite transparent pixels over the white ticket paper.
                int luminance = (299 * red + 587 * green + 114 * blue) / 1000;
                luminance = (luminance * alpha + 255 * (255 - alpha)) / 255;
                int threshold = 48 + bayer4[y & 3][x & 3] * 11;
                if (luminance < threshold) {
                    raster[y * widthBytes + (x / 8)] |= (byte) (0x80 >> (x & 7));
                }
            }
        }

        output.write(new byte[] { 0x1B, 0x61, 0x01 }); // Center alignment.

        // Low-cost thermal printers have a very small receive buffer. Sending
        // the complete 255-row bitmap at once makes some models print only its
        // first strip. Rasterize it in 24-row bands so every part is consumed.
        final int rowsPerBand = 24;
        for (int firstRow = 0; firstRow < height; firstRow += rowsPerBand) {
            int bandHeight = Math.min(rowsPerBand, height - firstRow);
            output.write(new byte[] {
                0x1D, 0x76, 0x30, 0x00,
                (byte) (widthBytes & 0xFF), (byte) ((widthBytes >> 8) & 0xFF),
                (byte) (bandHeight & 0xFF), (byte) ((bandHeight >> 8) & 0xFF)
            });
            output.write(raster, firstRow * widthBytes, bandHeight * widthBytes);
            output.flush();
            try { Thread.sleep(35); } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw interrupted;
            }
        }
        output.write(new byte[] { 0x0A, 0x1B, 0x61, 0x00 }); // Feed and restore left alignment.
        output.flush();

        if (bitmap != source) bitmap.recycle();
        source.recycle();
    }

    private BluetoothDevice findPrinter(Set<BluetoothDevice> devices, String requestedName) {
        if (devices == null) return null;
        String expected = requestedName.trim().toLowerCase(Locale.ROOT);
        BluetoothDevice fallback = null;
        for (BluetoothDevice device : devices) {
            String name = device.getName();
            if (name == null) continue;
            String normalized = name.toLowerCase(Locale.ROOT);
            if (normalized.equals(expected)) return device;
            if (normalized.contains(expected) || normalized.contains("printer")) fallback = device;
        }
        return fallback;
    }
}
