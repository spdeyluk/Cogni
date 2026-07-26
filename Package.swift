// swift-tools-version: 5.9
import PackageDescription

// Pure-Swift, deterministic math item generation engine for Cogni.
//
// This package is intentionally standalone and UI-free: it is the item bank that
// both the iOS app and 1v1 ranked play draw from. Determinism is load-bearing —
// two clients seeded with the same match seed must generate a byte-identical item
// sequence offline (see Sources/Cogni/Math/README.md).
let package = Package(
    name: "Cogni",
    platforms: [
        .iOS(.v15),
        .macOS(.v12)
    ],
    products: [
        .library(name: "Cogni", targets: ["Cogni"])
    ],
    targets: [
        .target(
            name: "Cogni",
            path: "Sources/Cogni",
            exclude: ["Math/README.md"]
        ),
        .testTarget(
            name: "CogniTests",
            dependencies: ["Cogni"],
            path: "Tests/CogniTests"
        )
    ]
)
