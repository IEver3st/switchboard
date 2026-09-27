!include "getProcessInfo.nsh"
Var pid
Var updateBackgroundMode
Var updatePreviousPriority
Var updateProcessesPresent

!ifdef BUILD_UNINSTALLER
  !define UPDATE_FUNCTION_PREFIX "un."
!else
  !define UPDATE_FUNCTION_PREFIX ""
!endif

!macro beginQuietUpdate
  ${If} ${Silent}
  ${AndIf} ${isUpdated}
  ${AndIf} $updateBackgroundMode == ""
    Push $0
    System::Call 'kernel32::GetPriorityClass(p -1) i .r0'
    StrCpy $updatePreviousPriority $0
    # Background mode lowers CPU, memory and disk scheduling priority together.
    System::Call 'kernel32::SetPriorityClass(p -1, i 0x00100000) i .r0'
    ${If} $0 != 0
      StrCpy $updateBackgroundMode "background"
    ${Else}
      StrCpy $updateBackgroundMode "cpu"
    ${EndIf}
    # Idle CPU class is inherited by the previous version's uninstaller too.
    System::Call 'kernel32::SetPriorityClass(p -1, i 0x40)'
    Pop $0
  ${EndIf}
!macroend

!macro preInit
  !ifndef BUILD_UNINSTALLER
    !insertmacro beginQuietUpdate
  !endif
!macroend

!macro customInstall
  # Restore before electron-builder's StartApp, so the app/hosts do not inherit
  # idle priority. Nothing changes machine-wide or survives installer exit.
  ${If} $updateBackgroundMode == "background"
    System::Call 'kernel32::SetPriorityClass(p -1, i 0x00200000)'
  ${EndIf}
  ${If} $updateBackgroundMode != ""
    System::Call 'kernel32::SetPriorityClass(p -1, i $updatePreviousPriority)'
    StrCpy $updateBackgroundMode ""
  ${EndIf}
!macroend

!macro customHeader
  # Reuse the installer process. No PowerShell startup, profiles, WMI queries,
  # or taskkill; query only executable paths through limited-access handles.
  Function ${UPDATE_FUNCTION_PREFIX}FindUpdateProcesses
    Push $0
    Push $1
    Push $2
    Push $3
    Push $4
    Push $5
    Push $6
    Push $7
    Push $8
    Push $9
    Push $R0
    StrCpy $updateProcessesPresent 2
    System::Alloc 65536
    Pop $0
    ${If} $0 P<> 0
      System::Call 'psapi::EnumProcesses(p r0, i 65536, *i .r1) i .r2'
      # A full buffer may omit processes. Fail closed instead of overwriting
      # files while an unchecked process is still running.
      ${If} $2 != 0
      ${AndIf} $1 < 65536
        StrCpy $updateProcessesPresent 0
        System::Call 'kernel32::GetCurrentProcessId() i .r9'
        StrCpy $R0 "$INSTDIR\"
        StrLen $8 $R0
        StrCpy $2 0
        ${DoWhile} $2 < $1
          IntOp $3 $0 + $2
          System::Call '*$3(i .r4)'
          ${If} $4 != 0
          ${AndIf} $4 != $9
            System::Call 'kernel32::OpenProcess(i 0x1000, i 0, i r4) p .r5'
            ${If} $5 P<> 0
              StrCpy $6 ${NSIS_MAX_STRLEN}
              System::Call 'kernel32::QueryFullProcessImageNameW(p r5, i 0, w .r7, *i r6) i .r4'
              System::Call 'kernel32::CloseHandle(p r5)'
              ${If} $4 != 0
                StrCpy $7 $7 $8
                # Include the directory separator: a sibling installation
                # with the same name prefix must never block this update.
                ${If} $7 == $R0
                  StrCpy $updateProcessesPresent 1
                  ${ExitDo}
                ${EndIf}
              ${EndIf}
            ${EndIf}
          ${EndIf}
          IntOp $2 $2 + 4
        ${Loop}
      ${EndIf}
      System::Free $0
    ${EndIf}
    Pop $R0
    Pop $9
    Pop $8
    Pop $7
    Pop $6
    Pop $5
    Pop $4
    Pop $3
    Pop $2
    Pop $1
    Pop $0
  FunctionEnd
!macroend

!macro customCheckAppRunning
  ${If} ${Silent}
  ${AndIf} ${isUpdated}
    # Also runs before the uninstaller's first process check.
    !insertmacro beginQuietUpdate
    Push $R0
    Push $R1
    System::Call 'kernel32::GetTickCount() i .R0'
    ${Do}
      Call ${UPDATE_FUNCTION_PREFIX}FindUpdateProcesses
      ${If} $updateProcessesPresent == 0
        ${ExitDo}
      ${EndIf}
      System::Call 'kernel32::GetTickCount() i .R1'
      IntOp $R1 $R1 - $R0
      ${If} $updateProcessesPresent == 2
      ${OrIf} $R1 >= 30000
        # Give normal app shutdown up to 30 seconds to flush recordings/state.
        # Leave the existing installation intact if it cannot finish safely.
        DetailPrint "Switchboard is still closing. The update can be retried."
        SetErrorLevel 1618
        Quit
      ${EndIf}
      Sleep 500
    ${Loop}
    Pop $R1
    Pop $R0
  ${Else}
    # Preserve the interactive installer's existing close/retry behavior.
    !insertmacro IS_POWERSHELL_AVAILABLE
    !insertmacro _CHECK_APP_RUNNING
  ${EndIf}
!macroend
