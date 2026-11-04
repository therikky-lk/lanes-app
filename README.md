<p align="center">
  <img src="build/icon.png" width="112" alt="Lane">
</p>

<h1 align="center">Lane</h1>

<p align="center">
  <strong>Твоя музыка. Твой вайб. Твой Lane.</strong>
</p>

<p align="center">
  Музыкальный плеер для Windows, macOS, Android и Linux.
  <br>
  Персональное радио, тексты песен и твоя собственная музыкальная библиотека — в одном приложении.
</p>

<p align="center">
  <a href="https://github.com/therikky-lk/lanes-app/releases/download/releases/Lane-latest-setup.exe">
    <img src="https://img.shields.io/badge/Download-Windows-0078D4?style=for-the-badge&logo=windows&logoColor=white" alt="Download for Windows">
  </a>
  <a href="https://github.com/therikky-lk/lanes-app/releases/download/releases/Lane-latest-arm64.dmg">
    <img src="https://img.shields.io/badge/Download-macOS%20(Apple%20Silicon)-000000?style=for-the-badge&logo=apple&logoColor=white" alt="Download for macOS (Apple Silicon)">
  </a>
  <a href="https://github.com/therikky-lk/lanes-app/releases/download/releases/Lane-latest-x64.dmg">
    <img src="https://img.shields.io/badge/Download-macOS%20(Intel)-555555?style=for-the-badge&logo=apple&logoColor=white" alt="Download for macOS (Intel)">
  </a>
  <p>
</p>
  <a href="https://github.com/therikky-lk/lanes-app/releases/download/releases/Lane-latest.AppImage">
    <img src="https://img.shields.io/badge/Download-Linux-FCC624?style=for-the-badge&logo=linux&logoColor=black" alt="Download for Linux">
  </a>
  <a href="https://github.com/therikky-lk/lanes-app/releases/download/releases/Lane-latest.apk">
    <img src="https://img.shields.io/badge/Download-Android-3DDC84?style=for-the-badge&logo=android&logoColor=white" alt="Download for Android">
  </a>
</p>


## ✨ Возможности

### 🎧 Мой вайб
Бесконечный персональный музыкальный поток, который подстраивается под твои предпочтения. Lane использует лайки и историю прослушивания, чтобы подбирать музыку, а живой градиент на главной странице пульсирует в ритме воспроизведения.

### 🎤 Тексты песен
Тексты для большинства треков благодаря нескольким источникам: Liner, LRCLIB и YouTube Music. Поддерживаются синхронизированные строки, обычный текст и собственные LRC-файлы. Если нужного текста нет, его можно вставить вручную или загрузить с устройства.

### 🎵 Твоя музыкальная библиотека
Добавляй локальные треки в форматах MP3, FLAC, M4A и OGG. Lane считывает метаданные, обложки и встроенные тексты из аудиофайлов. Твоя локальная музыка хранится на устройстве.

### 🔗 Импорт плейлистов Spotify
Импортируй плейлисты по ссылке и сохраняй оригинальные обложки. Перенести любимую музыку в Lane становится проще.

### 🌅 Ежедневные миксы
10 миксов примерно по 50 треков, сформированных на основе твоих любимых исполнителей. Подборки обновляются каждый день, чтобы знакомая музыка сочеталась с новыми открытиями.

### 💿 Полные дискографии
Исследуй альбомы и синглы любимых исполнителей в одном месте. Переключайся между сеткой обложек и компактным списком.

### 🎮 Discord Rich Presence
Показывай, что слушаешь, прямо в Discord. Поддерживается работа с Discord из Flatpak и Snap, а также Vesktop, Equibop и Legcord. Lane автоматически переподключается после перезапуска Discord.

---

## 📥 Установка

Скачай последнюю версию Lane со страницы [GitHub Releases](https://github.com/therikky-lk/lanes-app/releases).

| Платформа | Установка |
|---|---|
| Windows 10/11 | `Lane-Setup-*.exe` — установщик или `Lane-*-portable.exe` — портативная версия |
| Linux (x86_64) | `Lane-*-x64.AppImage` — сделай файл исполняемым и запусти |
| macOS Intel / Apple Silicon | `Lane-*-x64.dmg` / `Lane-*-arm64.dmg` — перенеси Lane в Applications |
| Android 7+ | `Lane-*.apk` — скачай и разреши установку из этого источника |
| Ubuntu / Debian / Linux Mint | Установи пакет `lane_*_amd64.deb` |
| Fedora / openSUSE | Установи пакет `lane-*.x86_64.rpm` |

### Windows

Запусти установщик `Lane-Setup-*.exe` или portable-версию `Lane-*-portable.exe`.

### macOS

Выбери DMG для своего процессора: `arm64` для Apple Silicon, `x64` для Intel. Перенеси Lane в Applications и запускай оттуда.

Сборки 1.7.8 имеют локальную подпись (ad hoc), но не сертификат Developer ID и не нотарификацию Apple. Это исправляет отсутствие подписи пакета, однако Gatekeeper может по-прежнему блокировать скачанное приложение. После попытки запуска разреши открытие Lane в «Системные настройки → Конфиденциальность и безопасность».

Если macOS сообщает «приложение повреждено», сначала скачай пакет заново и сравни SHA-256 с `SHA256SUMS-macos.txt` в релизе. Для проверенной копии из официального релиза можно удалить карантин только у Lane:

```bash
xattr -dr com.apple.quarantine /Applications/Lane.app
```

Полностью убрать предупреждения Gatekeeper для скачанных сборок можно только с подписью Developer ID и нотарификацией Apple.

### Android

1. Скачай `Lane-*.apk`.
2. Разреши установку из этого источника, если система попросит.
3. Открой APK и установи приложение.

### Linux

Для AppImage:

```bash
chmod +x Lane-*.AppImage
./Lane-*.AppImage
```

Для Ubuntu / Debian / Linux Mint:

```bash
sudo apt install ./lane_*_amd64.deb
```

Для Fedora / openSUSE:

```bash
sudo dnf install ./lane-*.x86_64.rpm
```

---

## 🛠 Сборка из исходников

### Требования
- Node.js 22
- pnpm 10
- Git

### Установка зависимостей

```bash
git clone https://github.com/therikky-lk/lanes-app.git
cd lanes-app
pnpm install
```

### Сборка

Сначала собери приложение:

```bash
pnpm build
```

Для сборки веб-версии без оболочки Electron выполни `pnpm build:web`. Готовые файлы появятся в `dist-web/`.

Для Linux:

```bash
pnpm exec electron-builder --linux
```

Для Windows:

```bash
pnpm exec electron-builder --win
```

Для macOS (на Mac):

```bash
pnpm electron:build:mac
```

Для Android нужны JDK 21 и Android SDK. Версия локальной сборки читается из `package.json`; CI может переопределить её через `LANE_VERSION_NAME` и `LANE_VERSION_CODE`.

```bash
LANE_TARGET=android pnpm exec vite build --outDir dist-android
pnpm build:potoken
pnpm exec cap sync android
cd android
./gradlew assembleDebug
```

Релизный APK собирается workflow `.github/workflows/release.yml` с ключом подписи. Секреты подписи и пароли не добавляй в исходники.

Готовые пакеты появятся в каталоге `release/`.

---

## 💙 О Lane

Lane создан для тех, кто хочет не просто включать музыку, а находить свой звук, возвращаться к любимым трекам и открывать новых исполнителей.

**Меньше поиска. Больше музыки. Больше твоего вайба.**

[Скачать Lane](https://github.com/therikky-lk/lanes-app/releases) · [Исходный код](https://github.com/therikky-lk/lanes-app)
