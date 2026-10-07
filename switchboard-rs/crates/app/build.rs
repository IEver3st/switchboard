fn main() {
    println!("cargo:rerun-if-changed=assets/switchboard.ico");
    // Build identity, so the window can tell when the background service is
    // an older build than itself. Changes whenever the app's source does.
    println!("cargo:rerun-if-changed=src");
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    println!("cargo:rustc-env=SWITCHBOARD_BUILD={stamp}");
    let mut res = winresource::WindowsResource::new();
    // Resource id 1: used for the exe icon and loaded by the tray.
    res.set_icon_with_id("assets/switchboard.ico", "1");
    res.set("ProductName", "Switchboard");
    res.set("FileDescription", "Switchboard");
    res.compile().expect("compile Windows resources");
}
