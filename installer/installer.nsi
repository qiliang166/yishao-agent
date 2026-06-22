; 一勺食谱课件Agent — NSIS Installer
; Requirements: NSIS 3.x (https://nsis.sourceforge.io)

Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"

; ── Metadata ──
!define PRODUCT_NAME "一勺食谱课件Agent"
!define PRODUCT_NAME_EN "YishaoAgent"
!define PRODUCT_VERSION "1.0.0"
!define PRODUCT_PUBLISHER "一勺食谱课件Agent"
!define PRODUCT_WEB_SITE "https://github.com/yishao-agent/yishao-agent"
!define PRODUCT_UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME_EN}"

Name "${PRODUCT_NAME} v${PRODUCT_VERSION}"
OutFile "..\dist\${PRODUCT_NAME_EN}-Setup-${PRODUCT_VERSION}.exe"
InstallDir "$PROGRAMFILES64\${PRODUCT_NAME_EN}"
RequestExecutionLevel admin

; ── Interface Settings ──
!define MUI_ABORTWARNING
!define MUI_ICON "${NSISDIR}\Contrib\Graphics\Icons\modern-install.ico"
!define MUI_UNICON "${NSISDIR}\Contrib\Graphics\Icons\modern-uninstall.ico"

; ── Pages ──
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "..\LICENSE.txt"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "SimpChinese"

; ── Install Section ──
Section "Install"
  SetOutPath "$INSTDIR"

  ; Copy all application files
  File /r /x "__pycache__" /x "*.pyc" /x "node_modules" /x ".git" /x "dist" /x "installer" /x ".superpowers" /x "*.db" /x "*.db-wal" /x "*.db-shm" "..\*.*"

  ; Create data directories
  CreateDirectory "$INSTDIR\backend\data"
  CreateDirectory "$INSTDIR\backend\data\audio"
  CreateDirectory "$INSTDIR\backend\data\exports"
  CreateDirectory "$INSTDIR\backend\data\backups"
  CreateDirectory "$INSTDIR\backend\data\prompts"
  CreateDirectory "$INSTDIR\backend\data\templates"
  CreateDirectory "$INSTDIR\backend\data\projects"

  ; ── Shortcuts ──
  CreateDirectory "$SMPROGRAMS\${PRODUCT_NAME}"
  CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk" "$INSTDIR\start.bat" "" "$INSTDIR\installer\yishao.ico" 0
  CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\start.bat" "" "$INSTDIR\installer\yishao.ico" 0
  CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}\卸载 ${PRODUCT_NAME}.lnk" "$INSTDIR\uninst.exe"

  ; ── Uninstaller ──
  WriteUninstaller "$INSTDIR\uninst.exe"

  ; ── Registry ──
  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "UninstallString" "$INSTDIR\uninst.exe"
  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "Publisher" "${PRODUCT_PUBLISHER}"
  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "URLInfoAbout" "${PRODUCT_WEB_SITE}"
  WriteRegDWORD HKLM "${PRODUCT_UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "${PRODUCT_UNINST_KEY}" "NoRepair" 1

  ; Estimate size
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKLM "${PRODUCT_UNINST_KEY}" "EstimatedSize" "$0"
SectionEnd

; ── Uninstall Section ──
Section "Uninstall"
  ; Remove shortcuts
  Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
  Delete "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk"
  Delete "$SMPROGRAMS\${PRODUCT_NAME}\卸载 ${PRODUCT_NAME}.lnk"
  RMDir "$SMPROGRAMS\${PRODUCT_NAME}"

  ; Remove installed files
  RMDir /r "$INSTDIR"

  ; Remove registry
  DeleteRegKey HKLM "${PRODUCT_UNINST_KEY}"
SectionEnd
