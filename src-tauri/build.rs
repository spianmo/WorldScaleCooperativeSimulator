fn main() {
    #[cfg(target_os = "macos")]
    {
        cc::Build::new()
            .file("src/macos_location.m")
            .flag("-fobjc-arc")
            .flag_if_supported("-fmodules")
            .compile("ws_macos_location");
        println!("cargo:rerun-if-changed=src/macos_location.m");
        println!("cargo:rustc-link-lib=framework=CoreLocation");
        println!("cargo:rustc-link-lib=framework=Foundation");
    }

    tauri_build::build()
}
