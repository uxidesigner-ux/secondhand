// Run on macOS: swift -module-cache-path ../work/icon-build/module-cache scripts/generate-app-icons.swift
// Uses the same Apple system black weight as the home wordmark, then saves outlines.
import AppKit
import CoreText
import Foundation

let version = "1.2.0"
let size: CGFloat = 130
let font = NSFont.systemFont(ofSize: size, weight: .black)
let attributes: [NSAttributedString.Key: Any] = [.font: font, .kern: -1.7 / 29 * size]
let line = CTLineCreateWithAttributedString(NSAttributedString(string: "USED", attributes: attributes))
let textPath = CGMutablePath()
for run in CTLineGetGlyphRuns(line) as! [CTRun] {
    let count = CTRunGetGlyphCount(run)
    var glyphs = [CGGlyph](repeating: 0, count: count)
    var positions = [CGPoint](repeating: .zero, count: count)
    CTRunGetGlyphs(run, CFRange(location: 0, length: 0), &glyphs)
    CTRunGetPositions(run, CFRange(location: 0, length: 0), &positions)
    let ctFont = (CTRunGetAttributes(run) as NSDictionary)[kCTFontAttributeName] as! CTFont
    for index in 0..<count {
        if let glyph = CTFontCreatePathForGlyph(ctFont, glyphs[index], nil) {
            let translate = CGAffineTransform(translationX: positions[index].x, y: positions[index].y)
            textPath.addPath(glyph, transform: translate)
        }
    }
}
let textBounds = textPath.boundingBoxOfPath
let diameter = 6 / 29 * size
let gap = 4 / 29 * size
let dotBounds = CGRect(x: textBounds.maxX + gap, y: textBounds.minY + size * 0.025, width: diameter, height: diameter)
let logoBounds = textBounds.union(dotBounds)
let scale = 376 / logoBounds.width
let offsetX = 256 - logoBounds.midX * scale
let offsetY = 256 - logoBounds.midY * scale

func number(_ value: CGFloat) -> String { String(format: "%.4f", Double(value)) }
var svgPath = ""
textPath.applyWithBlock { element in
    let e = element.pointee
    func p(_ i: Int) -> String { "\(number(e.points[i].x)) \(number(e.points[i].y))" }
    switch e.type {
    case .moveToPoint: svgPath += "M\(p(0))"
    case .addLineToPoint: svgPath += "L\(p(0))"
    case .addQuadCurveToPoint: svgPath += "Q\(p(0)) \(p(1))"
    case .addCurveToPoint: svgPath += "C\(p(0)) \(p(1)) \(p(2))"
    case .closeSubpath: svgPath += "Z"
    @unknown default: break
    }
}
// SVG y increases downward; flip the glyph group around the center of the canvas.
let svg = """
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="USED 파란 도트 로고">
<rect width="512" height="512" fill="#fff"/>
<g transform="translate(\(number(offsetX)) \(number(512 - offsetY))) scale(\(number(scale)) \(number(-scale)))">
<path d="\(svgPath)" fill="#191f28"/>
<circle cx="\(number(dotBounds.midX))" cy="\(number(dotBounds.midY))" r="\(number(diameter / 2))" fill="#3182f6"/>
</g></svg>
"""
try svg.write(toFile: "assets/used-app-icon-\(version).svg", atomically: true, encoding: .utf8)
try svg.write(toFile: "assets/favicon-\(version).svg", atomically: true, encoding: .utf8)
for (pixels, filename) in [(180, "apple-touch-icon"), (192, "icon-192"), (512, "icon-512")] {
    let canvas = CGContext(data: nil, width: pixels, height: pixels, bitsPerComponent: 8, bytesPerRow: pixels * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    canvas.setFillColor(red: 1, green: 1, blue: 1, alpha: 1)
    canvas.fill(CGRect(x: 0, y: 0, width: pixels, height: pixels))
    canvas.scaleBy(x: CGFloat(pixels) / 512, y: CGFloat(pixels) / 512)
    canvas.translateBy(x: offsetX, y: offsetY)
    canvas.scaleBy(x: scale, y: scale)
    canvas.setFillColor(red: 25/255, green: 31/255, blue: 40/255, alpha: 1)
    canvas.addPath(textPath)
    canvas.fillPath()
    canvas.setFillColor(red: 49/255, green: 130/255, blue: 246/255, alpha: 1)
    canvas.fillEllipse(in: dotBounds)
    let bitmap = NSBitmapImageRep(cgImage: canvas.makeImage()!)
    try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "assets/\(filename)-\(version).png"))
}
print("Created USED. icons \(version); font \(font.fontName); visible logo width376/512.")
