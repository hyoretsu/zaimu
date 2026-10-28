fn main() {
    tauri_plugin::Builder::new(&["register", "pending"])
        .android_path("android")
        .ios_path("ios")
        .build();
}
