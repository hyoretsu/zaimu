// swift-tools-version:5.9
import PackageDescription
let package = Package(name: "tauri-plugin-push", platforms: [.iOS(.v14)], products: [.library(name: "tauri-plugin-push", type: .static, targets: ["PushPlugin"])], dependencies: [.package(name: "Tauri", path: "../.tauri/tauri-api")], targets: [.target(name: "PushPlugin", dependencies: [.byName(name: "Tauri")], path: "Sources")])
