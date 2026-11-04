fn main() {
    tauri_plugin::Builder::new(&["register", "pending", "clock"])
        .android_path("android")
        .ios_path("ios")
        .build();
}
