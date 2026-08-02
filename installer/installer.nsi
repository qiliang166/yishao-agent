; YishaoAgent — NSIS Installer
; Packages the PyInstaller-built portable exe into a proper Windows installer.
; Requirements: NSIS 3.x (https://nsis.sourceforge.io)

Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"

; ── Metadata ──
!define PRODUCT_NAME "一勺笔录(SOP)智能体"
!define PRODUCT_NAME_EN "YishaoAgent"
!define PRODUCT_VERSION "1.0.0"
!define PRODUCT_PUBLISHER "一勺笔录(SOP)智能体"
!define PRODUCT_WEB_SITE "https://github.com/yishao-agent/yishao-agent"
!define PRODUCT_UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME_EN}"

Name "${PRODUCT_NAME} v${PRODUCT_VERSION}"
OutFile "..\dist\${PRODUCT_NAME_EN}-Setup-${PRODUCT_VERSION}.exe"
InstallDir "$PROGRAMFILES64\${PRODUCT_NAME_EN}"
RequestExecutionLevel admin

; Allow silent install: /S and /D=<path>
SilentInstall normal

; Register in 64-bit registry hive (NSIS is 32-bit, redirected by default)
SetRegView 64

; ── Interface Settings ──
!define MUI_ABORTWARNING
!define MUI_ICON "${NSISDIR}\Contrib\Graphics\Icons\modern-install.ico"
!define MUI_UNICON "${NSISDIR}\Contrib\Graphics\Icons\modern-uninstall.ico"

; ── Pages ──
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "..\EULA.txt"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM

; Custom uninstall page: ask whether to keep user data
Var KeepUserData
!define MUI_PAGE_CUSTOMFUNCTION_PRE un.KeepDataPre
!insertmacro MUI_UNPAGE_COMPONENTS
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"

; ── .onInit: architecture check, don't clobber /D= ──
Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "This application requires 64-bit Windows.$\n$\nPlease run this installer on a 64-bit system."
    Abort
  ${EndIf}
FunctionEnd

; ── Install Section ──
Section "Install"
  ; Machine-wide install: shortcuts go to All Users
  SetShellVarContext all
  SetOutPath "$INSTDIR"

  ; Copy the PyInstaller-built portable executable
  ; This file is staged by build.ps1 before makensis runs
  File /nonfatal "..\dist\YishaoAgent.exe"
  IfErrors 0 +2
    MessageBox MB_OK|MB_ICONSTOP "YishaoAgent.exe not found in dist\. Run build_desktop.ps1 first to build the portable exe, then rebuild the installer."
    Abort "Missing YishaoAgent.exe"

  ; Create writable data directories (populated at runtime by the app)
  CreateDirectory "$INSTDIR\data"
  CreateDirectory "$INSTDIR\data\audio"
  CreateDirectory "$INSTDIR\data\exports"
  CreateDirectory "$INSTDIR\data\backups"
  CreateDirectory "$INSTDIR\data\prompts"
  CreateDirectory "$INSTDIR\data\templates"
  CreateDirectory "$INSTDIR\data\projects"

  ; ── Shortcuts (all users) ──
  CreateDirectory "$SMPROGRAMS\${PRODUCT_NAME}"
  CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk" "$INSTDIR\YishaoAgent.exe"
  CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\YishaoAgent.exe"
  CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}\卸载 ${PRODUCT_NAME}.lnk" "$INSTDIR\uninst.exe"

  ; ── Uninstaller ──
  WriteUninstaller "$INSTDIR\uninst.exe"

  ; ── Install log ──
  WriteINIStr "$INSTDIR\install.log" "Install" "Version" "${PRODUCT_VERSION}"
  WriteINIStr "$INSTDIR\install.log" "Install" "Date" "${__DATE__}"
  WriteINIStr "$INSTDIR\install.log" "Install" "Path" "$INSTDIR"

  ; ── Registry (Add/Remove Programs) ──
  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "UninstallString" "$INSTDIR\uninst.exe"
  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "Publisher" "${PRODUCT_PUBLISHER}"
  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "URLInfoAbout" "${PRODUCT_WEB_SITE}"
  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "DisplayIcon" "$INSTDIR\YishaoAgent.exe"
  WriteRegDWORD HKLM "${PRODUCT_UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "${PRODUCT_UNINST_KEY}" "NoRepair" 1

  ; Estimate size
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKLM "${PRODUCT_UNINST_KEY}" "EstimatedSize" "$0"
SectionEnd

; ── Installer error handling ──
Function .onInstFailed
  RMDir /r "$INSTDIR"
  MessageBox MB_OK|MB_ICONSTOP "Installation failed. The install directory has been cleaned up."
FunctionEnd

; ── Uninstall: custom page to ask about user data ──
Function un.KeepDataPre
  StrCpy $KeepUserData "1"  ; default: keep
FunctionEnd

Section /o "Remove user data (projects, prompts, settings)" un.RemoveData
  StrCpy $KeepUserData "0"
SectionEnd

Section "-un.Main"
  ; Machine-wide: target All Users shortcuts
  SetShellVarContext all

  ; Remove shortcuts
  Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
  Delete "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk"
  Delete "$SMPROGRAMS\${PRODUCT_NAME}\卸载 ${PRODUCT_NAME}.lnk"
  RMDir "$SMPROGRAMS\${PRODUCT_NAME}"

  ; Remove program files (but preserve data if user chose to keep)
  ${If} $KeepUserData == "1"
    ; Delete only the exe and uninstaller, keep data/
    Delete "$INSTDIR\YishaoAgent.exe"
    Delete "$INSTDIR\uninst.exe"
    Delete "$INSTDIR\install.log"
    ; Remove empty directories (won't remove non-empty data/)
    RMDir "$INSTDIR"
    MessageBox MB_OK|MB_ICONINFORMATION "User data (projects, prompts, settings) has been preserved in:$\n$INSTDIR\data"
  ${Else}
    ; Full removal
    RMDir /r "$INSTDIR"
  ${EndIf}

  ; Remove registry
  DeleteRegKey HKLM "${PRODUCT_UNINST_KEY}"
SectionEnd

; ── Get install dir for uninstall ──
Function un.onInit
  SetShellVarContext all
  ReadRegStr $INSTDIR HKLM "${PRODUCT_UNINST_KEY}" "InstallLocation"
  ${If} $INSTDIR == ""
    StrCpy $INSTDIR "$PROGRAMFILES64\${PRODUCT_NAME_EN}"
  ${EndIf}
FunctionEnd
