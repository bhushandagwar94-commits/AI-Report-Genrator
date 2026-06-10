$ErrorActionPreference = "Continue"
Write-Host "STEP 1 - Create cache and temp folders on D drive"
mkdir D:\node-cache -Force
mkdir D:\node-cache\npm -Force
mkdir D:\node-cache\yarn -Force
mkdir D:\node-cache\tmp -Force

Write-Host "STEP 2 - Set variables"
$env:TEMP="D:\node-cache\tmp"
$env:TMP="D:\node-cache\tmp"
$env:npm_config_cache="D:\node-cache\npm"
$env:YARN_CACHE_FOLDER="D:\node-cache\yarn"

Write-Host "STEP 3 - Set NPM cache permanently"
npm config set cache D:\node-cache\npm --global

Write-Host "STEP 4 - Set YARN cache"
yarn config set cache-folder D:\node-cache\yarn
yarn config set cacheFolder D:\node-cache\yarn

Write-Host "STEP 5 - Clean partial broken install"
Set-Location D:\GitHub\AI-Report-Genrator
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force server\node_modules -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force frontend\node_modules -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force collector\node_modules -ErrorAction SilentlyContinue

Write-Host "STEP 11 - Freeing C drive Temp files"
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\Temp\*" -ErrorAction SilentlyContinue

Write-Host "STEP 6 - Install Root Dependencies"
yarn install --network-timeout 600000

Write-Host "STEP 7 - Install server dependencies (handled by postinstall usually, but doing explicitly if needed)"
Set-Location D:\GitHub\AI-Report-Genrator\server
yarn install --network-timeout 600000

Write-Host "STEP 8 - Install frontend dependencies"
Set-Location D:\GitHub\AI-Report-Genrator\frontend
yarn install --network-timeout 600000

Write-Host "Install collector dependencies"
Set-Location D:\GitHub\AI-Report-Genrator\collector
yarn install --network-timeout 600000

Write-Host "Done setting up, going to root"
Set-Location D:\GitHub\AI-Report-Genrator
