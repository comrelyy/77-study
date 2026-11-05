$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (!(Test-Path '.venv\Scripts\python.exe')) {
    py -3 -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw '需要可用的 Python 3。请先安装 Python，再运行本脚本。' }
}
& .\.venv\Scripts\python.exe app.py
