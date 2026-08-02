import Foundation
import PDFKit
import AppKit

guard CommandLine.arguments.count >= 3 else {
    fputs("usage: inspect_pdf input.pdf output-directory\n", stderr)
    exit(2)
}

let input = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)

guard let document = PDFDocument(url: input) else {
    fputs("could not open PDF\n", stderr)
    exit(1)
}

print("pages: \(document.pageCount)")
for index in 0..<document.pageCount {
    guard let page = document.page(at: index) else { continue }
    let box = page.bounds(for: .mediaBox)
    print("--- PAGE \(index + 1) [\(Int(box.width))x\(Int(box.height))] ---")
    print(page.string ?? "")

    let scale: CGFloat = 1.35
    let width = Int(box.width * scale)
    let height = Int(box.height * scale)
    guard let bitmap = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: width,
        pixelsHigh: height,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    ) else { continue }
    NSGraphicsContext.saveGraphicsState()
    guard let context = NSGraphicsContext(bitmapImageRep: bitmap) else { continue }
    NSGraphicsContext.current = context
    NSColor.white.setFill()
    NSRect(x: 0, y: 0, width: width, height: height).fill()
    context.cgContext.scaleBy(x: scale, y: scale)
    page.draw(with: .mediaBox, to: context.cgContext)
    NSGraphicsContext.restoreGraphicsState()
    if let png = bitmap.representation(using: .png, properties: [:]) {
        let name = String(format: "page-%02d.png", index + 1)
        try png.write(to: output.appendingPathComponent(name))
    }
}
