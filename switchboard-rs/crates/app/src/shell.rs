//! Explorer integration: open, reveal, and recycle files.

use std::path::Path;

use windows::Win32::UI::Shell::{
    FO_DELETE, FOF_ALLOWUNDO, FOF_NOCONFIRMATION, FOF_NOERRORUI, FOF_SILENT, SHFILEOPSTRUCTW, SHFileOperationW,
    ShellExecuteW,
};
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
use windows::core::{HSTRING, PCWSTR, w};

pub fn open(path: &Path) {
    unsafe {
        ShellExecuteW(None, w!("open"), &HSTRING::from(path.as_os_str()), PCWSTR::null(), PCWSTR::null(), SW_SHOWNORMAL);
    }
}

/// Opens the file's folder in Explorer with the file selected. Runs on its
/// own thread: the shell call may wait for Explorer.
pub fn reveal(path: &Path) {
    use windows::Win32::System::Com::{COINIT_APARTMENTTHREADED, CoInitializeEx, CoUninitialize};
    use windows::Win32::UI::Shell::{ILCreateFromPathW, ILFree, SHOpenFolderAndSelectItems};
    let path = path.to_path_buf();
    std::thread::spawn(move || unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let pidl = ILCreateFromPathW(&HSTRING::from(path.as_os_str()));
        let shown = !pidl.is_null() && SHOpenFolderAndSelectItems(pidl, None, 0).is_ok();
        if !pidl.is_null() {
            ILFree(Some(pidl));
        }
        if !shown && let Some(dir) = path.parent() {
            open(dir);
        }
        CoUninitialize();
    });
}

/// Drags a file out of the window, as if from Explorer: into Discord, a
/// browser upload or a folder. Blocks until the drop finishes; call it on the
/// window's thread right after the drag starts.
pub fn drag_file(path: &Path) -> anyhow::Result<()> {
    use windows::Win32::System::Com::IDataObject;
    use windows::Win32::System::Ole::{DROPEFFECT_COPY, OleInitialize};
    use windows::Win32::UI::Shell::{BHID_DataObject, IShellItem, SHCreateItemFromParsingName, SHDoDragDrop};
    unsafe {
        // Already initialized on the window thread; harmless if so.
        let _ = OleInitialize(None);
        let item: IShellItem = SHCreateItemFromParsingName(&HSTRING::from(path.as_os_str()), None)?;
        let data: IDataObject = item.BindToHandler(None, &BHID_DataObject)?;
        // No drop source: the shell supplies one, with the file's drag image.
        SHDoDragDrop(None, &data, None, DROPEFFECT_COPY)?;
    }
    Ok(())
}

pub fn open_folder(path: &Path) {
    let _ = std::fs::create_dir_all(path);
    open(path);
}

/// Moves a clip to the Recycle Bin so a delete can be undone, together with
/// its cursor track when it has one: one operation, restored together.
pub fn recycle(path: &Path) -> anyhow::Result<()> {
    let mut from: Vec<u16> = path.as_os_str().encode_wide_vec();
    from.push(0);
    let track = switchboard_capture::cursor_track_path(path);
    if track != path && track.is_file() {
        from.extend(track.as_os_str().encode_wide_vec());
        from.push(0);
    }
    from.push(0);
    let mut op = SHFILEOPSTRUCTW {
        wFunc: FO_DELETE,
        pFrom: PCWSTR(from.as_ptr()),
        fFlags: (FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT | FOF_NOERRORUI).0 as u16,
        ..Default::default()
    };
    let r = unsafe { SHFileOperationW(&mut op) };
    anyhow::ensure!(r == 0 && !op.fAnyOperationsAborted.as_bool(), "Windows could not move the clip to the Recycle Bin");
    Ok(())
}

trait EncodeWideVec {
    fn encode_wide_vec(&self) -> Vec<u16>;
}

impl EncodeWideVec for std::ffi::OsStr {
    fn encode_wide_vec(&self) -> Vec<u16> {
        use std::os::windows::ffi::OsStrExt;
        self.encode_wide().collect()
    }
}

/// Puts a file on the clipboard as a file drop, so it can be pasted into
/// Discord, Explorer or a browser upload.
pub fn copy_file(path: &Path) -> anyhow::Result<()> {
    use windows::Win32::Foundation::{HANDLE, HGLOBAL};
    use windows::Win32::System::DataExchange::{CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData};
    use windows::Win32::System::Memory::{GMEM_MOVEABLE, GlobalAlloc, GlobalLock, GlobalUnlock};
    use windows::Win32::UI::Shell::DROPFILES;
    const CF_HDROP: u32 = 15;
    let mut wide: Vec<u16> = path.as_os_str().encode_wide_vec();
    wide.extend_from_slice(&[0, 0]);
    let header = std::mem::size_of::<DROPFILES>();
    let size = header + wide.len() * 2;
    unsafe {
        let mem: HGLOBAL = GlobalAlloc(GMEM_MOVEABLE, size)?;
        let ptr = GlobalLock(mem) as *mut u8;
        anyhow::ensure!(!ptr.is_null(), "out of memory");
        let df = DROPFILES { pFiles: header as u32, fWide: true.into(), ..Default::default() };
        std::ptr::copy_nonoverlapping(&df as *const _ as *const u8, ptr, header);
        std::ptr::copy_nonoverlapping(wide.as_ptr() as *const u8, ptr.add(header), wide.len() * 2);
        let _ = GlobalUnlock(mem);
        OpenClipboard(None)?;
        let result = EmptyClipboard().and_then(|_| SetClipboardData(CF_HDROP, Some(HANDLE(mem.0))).map(|_| ()));
        let _ = CloseClipboard();
        result?;
    }
    Ok(())
}
