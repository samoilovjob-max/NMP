# Запуск: откройте PowerShell и выполните:
#   Set-ExecutionPolicy -Scope Process Bypass -Force
#   cd C:\Users\Serg_PTZ\Desktop\NMP
#   powershell -File .\push-images.ps1
#
# Или просто скопируйте команды ниже по одной.

$ErrorActionPreference = "Stop"
Set-Location "C:\Users\Serg_PTZ\Desktop\NMP"

Write-Host "`n=== Файлы в папке NMP ===" -ForegroundColor Cyan
Get-ChildItem -File | Select-Object Name, Length
Write-Host "`n=== Папка images (если есть) ===" -ForegroundColor Cyan
if (Test-Path images) { Get-ChildItem images -File | Select-Object Name, Length } else { Write-Host "(пока нет)" }

# Создаём images и копируем туда все картинки из корня
New-Item -ItemType Directory -Force -Path images | Out-Null
$ext = @("*.jpg","*.jpeg","*.png","*.webp","*.gif","*.svg","*.JPG","*.JPEG","*.PNG","*.WEBP")
Get-ChildItem -File -Include $ext -Path . | ForEach-Object {
  Copy-Item $_.FullName -Destination (Join-Path "images" $_.Name) -Force
  Write-Host "Скопировано в images\: $($_.Name)"
}
# Также подхватить вложенные папки с картинками (кроме .git)
Get-ChildItem -Directory | Where-Object { $_.Name -notin @(".git","images","css","js") } | ForEach-Object {
  Get-ChildItem $_.FullName -Recurse -File -Include $ext | ForEach-Object {
    Copy-Item $_.FullName -Destination (Join-Path "images" $_.Name) -Force
    Write-Host "Скопировано в images\: $($_.Name)"
  }
}

Write-Host "`n=== Итог images\ ===" -ForegroundColor Cyan
Get-ChildItem images -File | Select-Object Name, Length

# Git
git remote -v
git fetch origin
git checkout cursor/northern-magical-place-landing-5097
if ($LASTEXITCODE -ne 0) {
  git checkout -b cursor/northern-magical-place-landing-5097
}
git pull origin cursor/northern-magical-place-landing-5097 --allow-unrelated-histories 2>$null
git add images
git status
git commit -m "Add brand and product images from Desktop NMP"
git push -u origin cursor/northern-magical-place-landing-5097

Write-Host "`nГотово. Напишите агенту: запушил" -ForegroundColor Green
