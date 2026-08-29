// swift-tools-version:5.9
// Minimal Swift Package manifest so that automated tooling (e.g. GitHub
// CodeQL's autobuilder) can discover and compile the watchOS companion
// app's Swift sources. The shipping app itself is still generated with
// XcodeGen (see project.yml) and built via `xcodegen generate`.
import PackageDescription

let package = Package(
    name: "WorkoutWatch",
    platforms: [.macOS(.v13), .watchOS(.v9)],
    targets: [
        .target(
            name: "WorkoutWatch",
            path: "Sources",
            exclude: ["Info.plist"]
        )
    ]
)
