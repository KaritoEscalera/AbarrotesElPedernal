package com.abarroteselpedernal.app;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
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
