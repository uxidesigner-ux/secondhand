// Run from the repository root on macOS:
// swift -module-cache-path ../work/share-card-build/module-cache scripts/generate-share-card.swift
// Reuses the app icon's exact vector outline; the Korean caption is outlined too.
import AppKit
import CoreText
import Foundation

let source = try String(contentsOfFile: "assets/used-app-icon-1.2.0.svg", encoding: .utf8)
func capture(_ pattern: String, in text: String) -> [String] {
    let expression = try! NSRegularExpression(pattern: pattern)
    guard let match = expression.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) else {
        fatalError("Missing source logo geometry: \(pattern)")
    }
    return (1..<match.numberOfRanges).map { String(text[Range(match.range(at: $0), in: text)!]) }
}
let sourcePath = capture("<path d=\"([^\"]+)\"", in: source)[0]
let dotValues = capture("<circle cx=\"([^\"]+)\" cy=\"([^\"]+)\" r=\"([^\"]+)\"", in: source).map { CGFloat(Double($0)!) }
let tokenizer = try NSRegularExpression(pattern: "[MLQCZ]|-?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)")
let tokens = tokenizer.matches(in: sourcePath, range: NSRange(sourcePath.startIndex..., in: sourcePath)).map {
    String(sourcePath[Range($0.range, in: sourcePath)!])
}
var index = 0
func coordinate() -> CGFloat { defer { index += 1 }; return CGFloat(Double(tokens[index])!) }
func point() -> CGPoint { CGPoint(x: coordinate(), y: coordinate()) }
let logoPath = CGMutablePath()
while index < tokens.count {
    let command = tokens[index]; index += 1
    switch command {
    case "M": logoPath.move(to: point())
    case "L": logoPath.addLine(to: point())
    case "Q":
        let control = point(), destination = point()
        logoPath.addQuadCurve(to: destination, control: control)
    case "C":
        let first = point(), second = point(), destination = point()
        logoPath.addCurve(to: destination, control1: first, control2: second)
    case "Z": logoPath.closeSubpath()
    default: fatalError("Unsupported source path command: \(command)")
    }
}
let dot = CGRect(x: dotValues[0]-dotValues[2], y: dotValues[1]-dotValues[2], width: dotValues[2]*2, height: dotValues[2]*2)
let bounds = logoPath.boundingBoxOfPath.union(dot)
let logoScale: CGFloat = 440 / bounds.width
let logoX: CGFloat = 600 - bounds.midX * logoScale
let logoY: CGFloat = 315 - bounds.midY * logoScale

let caption = "원하는 제품, 일단 찾아봐"
let font = NSFont.systemFont(ofSize: 40, weight: .semibold)
let line = CTLineCreateWithAttributedString(NSAttributedString(string: caption, attributes: [.font: font, .kern: -0.7]))
let captionPath = CGMutablePath()
for run in CTLineGetGlyphRuns(line) as! [CTRun] {
    let count = CTRunGetGlyphCount(run)
    var glyphs = [CGGlyph](repeating: 0, count: count)
    var positions = [CGPoint](repeating: .zero, count: count)
    CTRunGetGlyphs(run, CFRange(location: 0, length: 0), &glyphs)
    CTRunGetPositions(run, CFRange(location: 0, length: 0), &positions)
    let runFont = (CTRunGetAttributes(run) as NSDictionary)[kCTFontAttributeName] as! CTFont
    for glyphIndex in 0..<count {
        if let path = CTFontCreatePathForGlyph(runFont, glyphs[glyphIndex], nil) {
            captionPath.addPath(path, transform: CGAffineTransform(translationX: positions[glyphIndex].x, y: positions[glyphIndex].y))
        }
    }
}
let captionBounds = captionPath.boundingBoxOfPath
let captionX: CGFloat = 600 - captionBounds.midX
let captionY: CGFloat = 120 - captionBounds.midY
precondition(captionBounds.width < 1000, "Caption must remain in the safe area")

let context = CGContext(data: nil, width: 1200, height: 630, bitsPerComponent: 8, bytesPerRow: 1200 * 4,
                        space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
context.setFillColor(red: 1, green: 1, blue: 1, alpha: 1)
context.fill(CGRect(x: 0, y: 0, width: 1200, height: 630))
context.saveGState()
context.translateBy(x: logoX, y: logoY)
context.scaleBy(x: logoScale, y: logoScale)
context.setFillColor(red: 25/255, green: 31/255, blue: 40/255, alpha: 1)
context.addPath(logoPath); context.fillPath()
context.setFillColor(red: 49/255, green: 130/255, blue: 246/255, alpha: 1)
context.fillEllipse(in: dot)
context.restoreGState()
context.saveGState()
context.translateBy(x: captionX, y: captionY)
context.setFillColor(red: 51/255, green: 61/255, blue: 75/255, alpha: 1)
context.addPath(captionPath); context.fillPath()
context.restoreGState()

func number(_ value: CGFloat) -> String { String(format: "%.4f", Double(value)) }
func serialized(_ path: CGPath) -> String {
    var output = ""
    path.applyWithBlock { element in
        let e = element.pointee
        func p(_ i: Int) -> String { "\(number(e.points[i].x)) \(number(e.points[i].y))" }
        switch e.type {
        case .moveToPoint: output += "M\(p(0))"
        case .addLineToPoint: output += "L\(p(0))"
        case .addQuadCurveToPoint: output += "Q\(p(0)) \(p(1))"
        case .addCurveToPoint: output += "C\(p(0)) \(p(1)) \(p(2))"
        case .closeSubpath: output += "Z"
        @unknown default: break
        }
    }
    return output
}
let vector = """
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="USED. 원하는 제품, 일단 찾아봐">
<rect width="1200" height="630" fill="#fff"/>
<g transform="translate(\(number(logoX)) \(number(630-logoY))) scale(\(number(logoScale)) \(number(-logoScale)))">
<path d="\(sourcePath)" fill="#191f28"/>
<circle cx="\(number(dotValues[0]))" cy="\(number(dotValues[1]))" r="\(number(dotValues[2]))" fill="#3182f6"/>
</g>
<g transform="translate(\(number(captionX)) \(number(630-captionY))) scale(1 -1)" aria-label="\(caption)"><path d="\(serialized(captionPath))" fill="#333d4b"/></g>
</svg>
"""
let directory = URL(fileURLWithPath: "assets/share", isDirectory: true)
try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
let name = "used-share-1.5.0"
let bitmap = NSBitmapImageRep(cgImage: context.makeImage()!)
let png = bitmap.representation(using: .png, properties: [:])!
try png.write(to: directory.appendingPathComponent(name + ".png"))
try vector.write(to: directory.appendingPathComponent(name + ".svg"), atomically: true, encoding: .utf8)
let outputs = URL(fileURLWithPath: "../outputs", isDirectory: true)
try FileManager.default.createDirectory(at: outputs, withIntermediateDirectories: true)
try png.write(to: outputs.appendingPathComponent(name + ".png"))
print("Created \(name): 1200×630 PNG, \(png.count) bytes; exact app logo centered at600,315, width440; caption centered at600,510.")
