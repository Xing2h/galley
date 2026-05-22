fn main() {
    println!("cargo:rerun-if-env-changed=GALLEY_UPDATER_PUBKEY");
    println!("cargo:rerun-if-env-changed=GALLEY_UPDATER_ENDPOINT");
    tauri_build::build()
}
