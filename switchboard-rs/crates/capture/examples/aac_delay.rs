fn main() -> anyhow::Result<()> {
    let p = std::env::temp_dir().join("sb-aac-impulse.mp4");
    switchboard_capture::audio::debug_aac_impulse(&p)?;
    println!("{}", p.display());
    Ok(())
}
