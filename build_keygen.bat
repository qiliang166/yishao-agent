@echo off
echo ============================================
echo  Build Yishao Agent License Key Generator
echo ============================================
echo.

pyinstaller build_keygen.spec

echo.
if exist "dist\YishaoAgent-KeyGen.exe" (
    echo [OK] KeyGen EXE built successfully!
    echo       Output: dist\YishaoAgent-KeyGen.exe
) else (
    echo [FAIL] Build failed. Check errors above.
)
pause
