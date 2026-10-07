//! Game library discovery (Steam `libraryfolders.vdf` + `appmanifest_*.acf`,
//! Epic `*.item` manifests) and running/foreground game detection.
//! Port of `src/main/services/game-discovery.ts` without icon extraction.

use crate::games::{GameId, normalize_name};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LibrarySource {
    Steam,
    Epic,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DetectedGame {
    pub name: String,
    pub source: LibrarySource,
    pub install_dir: PathBuf,
    pub executable_path: Option<PathBuf>,
    /// `steam://rungameid/<id>` or `com.epicgames.launcher://apps/<app>?action=launch`.
    pub launch_uri: Option<String>,
    pub steam_app_id: Option<String>,
}

impl DetectedGame {
    fn identity_key(&self) -> String {
        let key = self
            .executable_path
            .as_ref()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_else(|| self.install_dir.to_string_lossy().into_owned());
        key.trim_end_matches(['\\', '/']).to_lowercase()
    }
}

/// Find the library entry for a supported game (app ID first, then name).
pub fn find_detected(game: GameId, games: &[DetectedGame]) -> Option<&DetectedGame> {
    games.iter().find(|g| {
        g.steam_app_id
            .as_deref()
            .is_some_and(|id| game.steam_app_ids().contains(&id))
            || game
                .library_names()
                .contains(&normalize_name(&g.name).as_str())
            || (game == GameId::Battlefield6
                && g.executable_path
                    .as_ref()
                    .and_then(|p| p.file_name())
                    .is_some_and(|f| f.eq_ignore_ascii_case("bf6.exe")))
    })
}

#[derive(Debug, Clone)]
pub struct DiscoveryOptions {
    /// Override Steam roots (tests). `None` = Program Files + registry.
    pub steam_roots: Option<Vec<PathBuf>>,
    /// Override Epic manifest directories (tests). `None` = %ProgramData%.
    pub epic_manifest_dirs: Option<Vec<PathBuf>>,
    /// Read `SteamPath`/`InstallPath` from the registry when roots are not overridden.
    pub query_registry: bool,
}

impl Default for DiscoveryOptions {
    fn default() -> Self {
        Self {
            steam_roots: None,
            epic_manifest_dirs: None,
            query_registry: cfg!(windows),
        }
    }
}

impl DiscoveryOptions {
    /// Only the given directories; no environment or registry lookups.
    pub fn isolated(steam_roots: Vec<PathBuf>, epic_manifest_dirs: Vec<PathBuf>) -> Self {
        Self {
            steam_roots: Some(steam_roots),
            epic_manifest_dirs: Some(epic_manifest_dirs),
            query_registry: false,
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct ScanResult {
    pub games: Vec<DetectedGame>,
    /// Privacy-safe, user-presentable problems (unreadable manifests).
    pub warnings: Vec<String>,
}

/// Scan Steam and Epic libraries. Blocking file I/O proportional to the
/// number of installed games (typically a few milliseconds); call it off the
/// UI thread and cache the result.
pub fn scan_games(options: &DiscoveryOptions) -> ScanResult {
    let mut warnings = Vec::new();
    let mut games = scan_steam(options, &mut warnings);
    games.extend(scan_epic(options, &mut warnings));
    let mut seen = HashSet::new();
    games.retain(|g| seen.insert(g.identity_key()));
    games.sort_by_key(|g| g.name.to_lowercase());
    ScanResult { games, warnings }
}

fn steam_roots(options: &DiscoveryOptions) -> Vec<PathBuf> {
    if let Some(roots) = &options.steam_roots {
        return roots.clone();
    }
    let mut roots = Vec::new();
    for var in ["ProgramFiles(x86)", "ProgramFiles"] {
        if let Some(dir) = std::env::var_os(var) {
            roots.push(PathBuf::from(dir).join("Steam"));
        }
    }
    if options.query_registry {
        roots.extend(sys::steam_registry_paths());
    }
    roots
}

fn scan_steam(options: &DiscoveryOptions, warnings: &mut Vec<String>) -> Vec<DetectedGame> {
    let mut libraries: Vec<PathBuf> = Vec::new();
    let mut seen = HashSet::new();
    let mut add = |path: PathBuf, libraries: &mut Vec<PathBuf>| {
        let key = path
            .to_string_lossy()
            .replace('/', "\\")
            .trim_end_matches('\\')
            .to_lowercase();
        if seen.insert(key) {
            libraries.push(path);
        }
    };
    for root in steam_roots(options) {
        if !root.is_dir() {
            continue;
        }
        add(root.clone(), &mut libraries);
        let file = root.join("steamapps").join("libraryfolders.vdf");
        match std::fs::read_to_string(&file) {
            Ok(contents) => {
                for path in parse_library_paths(&contents) {
                    add(PathBuf::from(path), &mut libraries);
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => warnings.push(format!(
                "Steam libraries could not be read from {}.",
                root.display()
            )),
        }
    }

    let mut games = Vec::new();
    for library in libraries {
        let steamapps = library.join("steamapps");
        let entries = match std::fs::read_dir(&steamapps) {
            Ok(entries) => entries,
            Err(e) => {
                if e.kind() != std::io::ErrorKind::NotFound {
                    warnings.push(format!(
                        "A Steam library could not be scanned at {}.",
                        library.display()
                    ));
                }
                continue;
            }
        };
        for entry in entries.flatten() {
            let file_name = entry.file_name().to_string_lossy().into_owned();
            let Some(app_id) = manifest_app_id(&file_name) else {
                continue;
            };
            let Ok(contents) = std::fs::read_to_string(entry.path()) else {
                warnings.push(format!(
                    "A Steam game manifest could not be read at {}.",
                    entry.path().display()
                ));
                continue;
            };
            let (Some(name), Some(install)) = (
                vdf_string(&contents, "name"),
                vdf_string(&contents, "installdir"),
            ) else {
                continue;
            };
            let install_dir = steamapps.join("common").join(&install);
            if !install_dir.is_dir() {
                continue;
            }
            games.push(DetectedGame {
                name,
                source: LibrarySource::Steam,
                install_dir,
                executable_path: None,
                launch_uri: Some(format!("steam://rungameid/{app_id}")),
                steam_app_id: Some(app_id),
            });
        }
    }
    games
}

fn scan_epic(options: &DiscoveryOptions, warnings: &mut Vec<String>) -> Vec<DetectedGame> {
    let dirs = options.epic_manifest_dirs.clone().unwrap_or_else(|| {
        std::env::var_os("ProgramData")
            .map(|d| {
                vec![
                    PathBuf::from(d)
                        .join("Epic")
                        .join("EpicGamesLauncher")
                        .join("Data")
                        .join("Manifests"),
                ]
            })
            .unwrap_or_default()
    });
    let mut games = Vec::new();
    for dir in dirs {
        let entries = match std::fs::read_dir(&dir) {
            Ok(entries) => entries,
            Err(e) => {
                if e.kind() != std::io::ErrorKind::NotFound {
                    warnings.push(format!(
                        "Epic Games manifests could not be read from {}.",
                        dir.display()
                    ));
                }
                continue;
            }
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if !path
                .extension()
                .is_some_and(|e| e.eq_ignore_ascii_case("item"))
            {
                continue;
            }
            match std::fs::read_to_string(&path).map(|c| parse_epic_manifest(&c)) {
                Ok(Ok(Some(game))) if game.install_dir.is_dir() => games.push(game),
                Ok(Ok(_)) => {}
                _ => warnings.push(format!(
                    "An Epic Games manifest could not be read at {}.",
                    path.display()
                )),
            }
        }
    }
    games
}

/// Parse one Epic `.item` manifest (JSON). `Ok(None)` when it lacks a name or
/// install location. Does not check the filesystem.
pub fn parse_epic_manifest(contents: &str) -> Result<Option<DetectedGame>, serde_json::Error> {
    let value: serde_json::Value = serde_json::from_str(contents)?;
    let text = |key: &str| {
        value
            .get(key)
            .and_then(|v| v.as_str())
            .map(str::trim)
            .unwrap_or("")
            .to_owned()
    };
    let name = text("DisplayName");
    let install = text("InstallLocation");
    if name.is_empty() || install.is_empty() {
        return Ok(None);
    }
    let install_dir = PathBuf::from(&install);
    let executable = text("LaunchExecutable");
    let executable_path = (!executable.is_empty()).then(|| {
        let p = PathBuf::from(&executable);
        if p.is_absolute() {
            p
        } else {
            install_dir.join(p)
        }
    });
    let app_name = text("AppName");
    Ok(Some(DetectedGame {
        name,
        source: LibrarySource::Epic,
        install_dir,
        executable_path,
        launch_uri: (!app_name.is_empty()).then(|| {
            format!(
                "com.epicgames.launcher://apps/{}?action=launch",
                percent_encode(&app_name)
            )
        }),
        steam_app_id: None,
    }))
}

fn percent_encode(value: &str) -> String {
    let mut out = String::new();
    for b in value.bytes() {
        if b.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&b) {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

fn manifest_app_id(file_name: &str) -> Option<String> {
    let lower = file_name.to_ascii_lowercase();
    let id = lower.strip_prefix("appmanifest_")?.strip_suffix(".acf")?;
    (!id.is_empty() && id.bytes().all(|b| b.is_ascii_digit())).then(|| id.to_owned())
}

#[derive(Debug, PartialEq)]
enum VdfToken {
    Str(String),
    Open,
    Close,
}

/// Tokenize Valve KeyValues text: quoted strings (`\\` and `\"` escapes),
/// braces, `//` comments. Unquoted tokens are read up to whitespace.
fn vdf_tokens(contents: &str) -> Vec<VdfToken> {
    let mut tokens = Vec::new();
    let mut chars = contents.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '{' => tokens.push(VdfToken::Open),
            '}' => tokens.push(VdfToken::Close),
            '"' => {
                let mut s = String::new();
                while let Some(c) = chars.next() {
                    match c {
                        '"' => break,
                        '\\' => match chars.peek() {
                            Some('\\') | Some('"') => s.push(chars.next().unwrap()),
                            _ => s.push('\\'),
                        },
                        _ => s.push(c),
                    }
                }
                tokens.push(VdfToken::Str(s));
            }
            '/' if chars.peek() == Some(&'/') => {
                for c in chars.by_ref() {
                    if c == '\n' {
                        break;
                    }
                }
            }
            c if c.is_whitespace() => {}
            c => {
                let mut s = String::from(c);
                while let Some(&n) = chars.peek() {
                    if n.is_whitespace() || n == '{' || n == '}' || n == '"' {
                        break;
                    }
                    s.push(n);
                    chars.next();
                }
                tokens.push(VdfToken::Str(s));
            }
        }
    }
    tokens
}

/// Every `"key" "value"` pair whose key matches (case-insensitive).
fn vdf_values(contents: &str, key: &str) -> Vec<String> {
    let tokens = vdf_tokens(contents);
    tokens
        .windows(2)
        .filter_map(|pair| match pair {
            [VdfToken::Str(k), VdfToken::Str(v)] if k.eq_ignore_ascii_case(key) => {
                Some(v.trim().to_owned())
            }
            _ => None,
        })
        .filter(|v| !v.is_empty())
        .collect()
}

/// First value for `key` in a VDF/ACF document.
pub fn vdf_string(contents: &str, key: &str) -> Option<String> {
    vdf_values(contents, key).into_iter().next()
}

/// Library paths listed in `libraryfolders.vdf`.
pub fn parse_library_paths(contents: &str) -> Vec<String> {
    vdf_values(contents, "path")
}

/// Which supported games are running and which (if any) owns the
/// foreground window.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct GameDetection {
    /// Running supported games, in `GameId::SUPPORTED` priority order.
    pub running: Vec<GameId>,
    pub foreground: Option<GameId>,
}

impl GameDetection {
    /// The game Auto Capture should follow: the foreground game, else the
    /// highest-priority running one (a game stays active while alt-tabbed,
    /// like the old automatic-game capture source).
    pub fn active(&self) -> Option<GameId> {
        self.foreground.or_else(|| self.running.first().copied())
    }
}

/// Build a detection result from `(pid, image name)` pairs (testable core).
pub fn detect_from_processes<'a>(
    processes: impl IntoIterator<Item = (u32, &'a str)>,
    foreground_pid: Option<u32>,
) -> GameDetection {
    let mut running = Vec::new();
    let mut foreground = None;
    for (pid, name) in processes {
        if let Some(game) = GameId::from_executable(name) {
            if !running.contains(&game) {
                running.push(game);
            }
            if foreground_pid == Some(pid) && pid != 0 {
                foreground = Some(game);
            }
        }
    }
    running.sort_by_key(|g| GameId::SUPPORTED.iter().position(|s| s == g));
    GameDetection {
        running,
        foreground,
    }
}

/// Enumerate processes once (ToolHelp snapshot, which works for protected
/// anti-cheat processes because it opens no process handle) and read the
/// foreground window's PID. Cost: measured ~11 ms per call on a desktop with
/// a few hundred processes (the snapshot includes per-thread data); no
/// handles are retained. Call it sparingly: on foreground changes when
/// [`foreground_game`] found nothing, or every few seconds at most while
/// Auto Capture is enabled. Never while it is disabled.
pub fn detect_games() -> GameDetection {
    sys::detect_games()
}

/// The supported game owning the foreground window, if any. Cheap (one
/// `OpenProcess` with query-limited rights and an image-name query, tens of
/// microseconds); falls back to a ToolHelp snapshot only when the
/// foreground process denies even limited queries.
pub fn foreground_game() -> Option<GameId> {
    sys::foreground_game()
}

/// The game Auto Capture should follow: [`foreground_game`] when a supported
/// game is in front (cheap), else the highest-priority running supported
/// game from a full [`detect_games`] snapshot (~11 ms). Suitable for
/// `EVENT_SYSTEM_FOREGROUND` handling plus a slow (5 s) poll to notice exits.
pub fn active_game() -> Option<GameId> {
    foreground_game().or_else(|| detect_games().active())
}

#[cfg(windows)]
mod sys {
    use super::GameDetection;
    use std::path::PathBuf;
    use windows::Win32::Foundation::{CloseHandle, ERROR_SUCCESS};
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW,
        TH32CS_SNAPPROCESS,
    };
    use windows::Win32::System::Registry::{
        HKEY, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ, RegGetValueW,
    };
    use windows::Win32::System::Threading::{
        OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
        QueryFullProcessImageNameW,
    };
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};
    use windows::core::{HSTRING, PWSTR};

    fn foreground_pid() -> Option<u32> {
        unsafe {
            let hwnd = GetForegroundWindow();
            let mut pid = 0u32;
            if !hwnd.is_invalid() {
                GetWindowThreadProcessId(hwnd, Some(&mut pid));
            }
            (pid != 0).then_some(pid)
        }
    }

    pub fn foreground_game() -> Option<crate::games::GameId> {
        let pid = foreground_pid()?;
        let name = unsafe {
            match OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
                Ok(handle) => {
                    let mut buffer = [0u16; 1024];
                    let mut len = buffer.len() as u32;
                    let ok = QueryFullProcessImageNameW(
                        handle,
                        PROCESS_NAME_WIN32,
                        PWSTR(buffer.as_mut_ptr()),
                        &mut len,
                    )
                    .is_ok();
                    let _ = CloseHandle(handle);
                    ok.then(|| String::from_utf16_lossy(&buffer[..len as usize]))
                }
                Err(_) => None,
            }
        };
        match name {
            Some(name) => crate::games::GameId::from_executable(&name),
            // Access denied (protected process): fall back to the snapshot.
            None => detect_games().foreground,
        }
    }

    pub fn detect_games() -> GameDetection {
        let foreground_pid = foreground_pid();
        let mut processes: Vec<(u32, String)> = Vec::new();
        unsafe {
            let Ok(snapshot) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else {
                return GameDetection::default();
            };
            let mut entry = PROCESSENTRY32W {
                dwSize: size_of::<PROCESSENTRY32W>() as u32,
                ..Default::default()
            };
            let mut ok = Process32FirstW(snapshot, &mut entry).is_ok();
            while ok {
                let len = entry
                    .szExeFile
                    .iter()
                    .position(|&c| c == 0)
                    .unwrap_or(entry.szExeFile.len());
                let name = String::from_utf16_lossy(&entry.szExeFile[..len]);
                // Only keep candidates; most processes are not games.
                if crate::games::GameId::from_executable(&name).is_some() {
                    processes.push((entry.th32ProcessID, name));
                }
                ok = Process32NextW(snapshot, &mut entry).is_ok();
            }
            let _ = CloseHandle(snapshot);
        }
        super::detect_from_processes(
            processes.iter().map(|(p, n)| (*p, n.as_str())),
            foreground_pid,
        )
    }

    pub fn steam_registry_paths() -> Vec<PathBuf> {
        [
            (HKEY_CURRENT_USER, "Software\\Valve\\Steam", "SteamPath"),
            (
                HKEY_LOCAL_MACHINE,
                "SOFTWARE\\WOW6432Node\\Valve\\Steam",
                "InstallPath",
            ),
        ]
        .into_iter()
        .filter_map(|(root, key, value)| read_string(root, key, value))
        .map(PathBuf::from)
        .collect()
    }

    fn read_string(root: HKEY, key: &str, value: &str) -> Option<String> {
        let key = HSTRING::from(key);
        let value = HSTRING::from(value);
        let mut buffer = [0u16; 1024];
        let mut bytes = (buffer.len() * 2) as u32;
        let status = unsafe {
            RegGetValueW(
                root,
                &key,
                &value,
                RRF_RT_REG_SZ,
                None,
                Some(buffer.as_mut_ptr().cast()),
                Some(&mut bytes),
            )
        };
        if status != ERROR_SUCCESS {
            return None;
        }
        let len = (bytes as usize / 2).min(buffer.len());
        let text = String::from_utf16_lossy(&buffer[..len]);
        let text = text.trim_end_matches('\0').trim();
        (!text.is_empty()).then(|| text.to_owned())
    }
}

#[cfg(not(windows))]
mod sys {
    use super::GameDetection;
    use std::path::PathBuf;

    pub fn detect_games() -> GameDetection {
        GameDetection::default()
    }

    pub fn foreground_game() -> Option<crate::games::GameId> {
        None
    }

    pub fn steam_registry_paths() -> Vec<PathBuf> {
        Vec::new()
    }
}

/// Test helper: lay out a fake Steam library in `root`.
#[doc(hidden)]
pub fn write_fake_steam_game(
    root: &Path,
    app_id: &str,
    name: &str,
    install: &str,
) -> std::io::Result<PathBuf> {
    let steamapps = root.join("steamapps");
    std::fs::create_dir_all(steamapps.join("common").join(install))?;
    std::fs::write(
        steamapps.join(format!("appmanifest_{app_id}.acf")),
        format!(
            "\"AppState\"\n{{\n\t\"appid\"\t\t\"{app_id}\"\n\t\"name\"\t\t\"{name}\"\n\t\"installdir\"\t\t\"{install}\"\n}}\n"
        ),
    )?;
    Ok(steamapps.join("common").join(install))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TempDir;

    const LIBRARY_FOLDERS: &str = r#""libraryfolders"
{
	"0"
	{
		"path"		"C:\\Program Files (x86)\\Steam"
		"label"		""
		"contentid"		"123"
		"apps"
		{
			"730"		"36000000000"
		}
	}
	"1"
	{
		"path"		"D:\\SteamLibrary"
		"label"		"Games \"fast\""
		"apps"
		{
			"236390"		"20000000000"
		}
	}
}
"#;

    const CS2_ACF: &str = r#""AppState"
{
	"appid"		"730"
	"universe"		"1"
	"name"		"Counter-Strike 2"
	"StateFlags"		"4"
	"installdir"		"Counter-Strike Global Offensive"
	"InstalledDepots"
	{
		"2347771"
		{
			"manifest"		"1"
			"size"		"2"
		}
	}
}
"#;

    #[test]
    fn parses_library_folders() {
        assert_eq!(
            parse_library_paths(LIBRARY_FOLDERS),
            vec![
                "C:\\Program Files (x86)\\Steam".to_owned(),
                "D:\\SteamLibrary".to_owned()
            ]
        );
        assert_eq!(
            vdf_string(LIBRARY_FOLDERS, "label"),
            Some("Games \"fast\"".into())
        );
        // Comments and unquoted tokens do not break parsing.
        let odd = "// header\n\"libraryfolders\" { \"0\" { path \"E:\\\\Games\" } }";
        assert_eq!(parse_library_paths(odd), vec!["E:\\Games".to_owned()]);
    }

    #[test]
    fn parses_app_manifest() {
        assert_eq!(
            vdf_string(CS2_ACF, "name").as_deref(),
            Some("Counter-Strike 2")
        );
        assert_eq!(
            vdf_string(CS2_ACF, "installdir").as_deref(),
            Some("Counter-Strike Global Offensive")
        );
        assert_eq!(
            vdf_string(CS2_ACF, "NAME").as_deref(),
            Some("Counter-Strike 2")
        );
        assert_eq!(vdf_string(CS2_ACF, "missing"), None);
        assert_eq!(
            manifest_app_id("appmanifest_730.acf").as_deref(),
            Some("730")
        );
        assert_eq!(
            manifest_app_id("AppManifest_236390.ACF").as_deref(),
            Some("236390")
        );
        assert_eq!(manifest_app_id("appmanifest_x.acf"), None);
        assert_eq!(manifest_app_id("libraryfolders.vdf"), None);
    }

    #[test]
    fn parses_epic_manifest() {
        let json = r#"{"DisplayName":" Battlefield 6 ","InstallLocation":"C:\\Games\\BF6","LaunchExecutable":"bf6.exe","AppName":"Bf 6"}"#;
        let game = parse_epic_manifest(json).unwrap().unwrap();
        assert_eq!(game.name, "Battlefield 6");
        assert_eq!(
            game.executable_path,
            Some(PathBuf::from("C:\\Games\\BF6").join("bf6.exe"))
        );
        assert_eq!(
            game.launch_uri.as_deref(),
            Some("com.epicgames.launcher://apps/Bf%206?action=launch")
        );
        assert!(
            parse_epic_manifest(r#"{"DisplayName":"x"}"#)
                .unwrap()
                .is_none()
        );
        assert!(parse_epic_manifest("not json").is_err());
    }

    #[test]
    fn scans_isolated_libraries() {
        let temp = TempDir::new("discovery");
        let steam = temp.path().join("Steam");
        let second = temp.path().join("Library2");
        write_fake_steam_game(
            &steam,
            "730",
            "Counter-Strike 2",
            "Counter-Strike Global Offensive",
        )
        .unwrap();
        write_fake_steam_game(&second, "236390", "War Thunder", "War Thunder").unwrap();
        // Manifest whose install dir is missing is skipped.
        std::fs::write(
            steam.join("steamapps").join("appmanifest_1.acf"),
            "\"AppState\" { \"name\" \"Ghost\" \"installdir\" \"Nope\" }",
        )
        .unwrap();
        std::fs::write(
            steam.join("steamapps").join("libraryfolders.vdf"),
            format!(
                "\"libraryfolders\" {{ \"0\" {{ \"path\" \"{}\" }} \"1\" {{ \"path\" \"{}\" }} }}",
                steam.display().to_string().replace('\\', "\\\\"),
                second.display().to_string().replace('\\', "\\\\")
            ),
        )
        .unwrap();
        let epic = temp.path().join("Epic");
        let bf_dir = temp.path().join("BF6");
        std::fs::create_dir_all(&epic).unwrap();
        std::fs::create_dir_all(&bf_dir).unwrap();
        std::fs::write(
            epic.join("abc.item"),
            serde_json::json!({"DisplayName": "Battlefield 6", "InstallLocation": bf_dir, "LaunchExecutable": "bf6.exe"})
                .to_string(),
        )
        .unwrap();
        std::fs::write(epic.join("broken.item"), "{").unwrap();

        let result = scan_games(&DiscoveryOptions::isolated(vec![steam.clone()], vec![epic]));
        let names: Vec<_> = result.games.iter().map(|g| g.name.as_str()).collect();
        assert_eq!(
            names,
            vec!["Battlefield 6", "Counter-Strike 2", "War Thunder"]
        );
        assert_eq!(result.warnings.len(), 1);
        let cs2 = find_detected(GameId::CounterStrike2, &result.games).unwrap();
        assert_eq!(
            cs2.install_dir,
            steam
                .join("steamapps")
                .join("common")
                .join("Counter-Strike Global Offensive")
        );
        assert_eq!(cs2.launch_uri.as_deref(), Some("steam://rungameid/730"));
        assert!(find_detected(GameId::WarThunder, &result.games).is_some());
        assert!(find_detected(GameId::Battlefield6, &result.games).is_some());
        assert!(find_detected(GameId::Wardogs, &result.games).is_none());
    }

    #[test]
    fn process_detection_core() {
        let procs = [
            (4, "System"),
            (100, "steam.exe"),
            (200, "aces.exe"),
            (300, "cs2.exe"),
            (301, "cs2.exe"),
        ];
        let d = detect_from_processes(procs, Some(200));
        assert_eq!(d.running, vec![GameId::CounterStrike2, GameId::WarThunder]);
        assert_eq!(d.foreground, Some(GameId::WarThunder));
        assert_eq!(d.active(), Some(GameId::WarThunder));
        let d = detect_from_processes(procs, Some(100));
        assert_eq!(
            (d.foreground, d.active()),
            (None, Some(GameId::CounterStrike2))
        );
        assert_eq!(
            detect_from_processes([(1, "explorer.exe")], Some(1)).active(),
            None
        );
    }

    #[test]
    fn live_detection_does_not_panic() {
        // Real system calls; results depend on the machine.
        let d = detect_games();
        if let Some(fg) = foreground_game() {
            assert!(d.running.contains(&fg));
        }
        let _ = active_game();
    }
}
