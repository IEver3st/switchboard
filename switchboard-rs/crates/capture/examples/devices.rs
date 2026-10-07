//! Lists the audio devices Settings offers: `cargo run --example devices`.
fn main() {
    let d = switchboard_capture::list_audio_devices();
    for (kind, list) in [("output", &d.outputs), ("input", &d.inputs)] {
        for dev in list {
            println!("{kind}: {}{}", dev.name, if dev.is_default { " (default)" } else { "" });
        }
    }
}
