<p align="center">
  <img src="build/icon.png" width="112" alt="Lane">
</p>

<h1 align="center">Lane</h1>

<p align="center">
  <strong>Твоя музыка. Твой вайб. Твой Lane.</strong>
</p>

<p align="center">
  Музыкальный плеер для Windows, Android и Linux.
  <br>
  Персональное радио, тексты песен и твоя собственная музыкальная библиотека — в одном приложении.
</p>

<p align="center">
  <a href="https://github.com/therikky-lk/lanes-app/releases/download/releases/Lane-latest-setup.exe">
    <img src="https://img.shields.io/badge/Download-Windows-0078D4?style=for-the-badge&logo=windows&logoColor=white" alt="Download for Windows">
  </a>
  <a href="https://github.com/therikky-lk/lanes-app/releases/download/releases/Lane-latest.AppImage">
    <img src="https://img.shields.io/badge/Download-Linux-FCC624?style=for-the-badge&logo=linux&logoColor=black" alt="Download for Linux">
  </a>
  <a href="https://github.com/therikky-lk/lanes-app/releases/download/releases/Lane-latest.apk">
    <img src="https://img.shields.io/badge/Download-Android-3DDC84?style=for-the-badge&logo=android&logoColor=white" alt="Download for Android">
  </a>
</p>

---

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
| Linux (x86_64) | `Lane-*-x86_64.AppImage` — сделай файл исполняемым и запусти |
| Android 7+ | `Lane-vx.x.x.apk` - просто скачай |
| Ubuntu / Debian / Linux Mint | Установи пакет `lane_*_amd64.deb` |
| Fedora / openSUSE | Установи пакет `lane-*.x86_64.rpm` |

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
- Node.js
- pnpm
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
pnpm exec vite build
```

Для Linux:

```bash
pnpm exec electron-builder --linux
```

Для Windows:

```bash
pnpm exec electron-builder --win
```

Готовые пакеты появятся в каталоге `release/`.

---

## 💙 О Lane

Lane создан для тех, кто хочет не просто включать музыку, а находить свой звук, возвращаться к любимым трекам и открывать новых исполнителей.

**Меньше поиска. Больше музыки. Больше твоего вайба.**

[Скачать Lane](https://github.com/therikky-lk/lanes-app/releases) · [Исходный код](https://github.com/therikky-lk/lanes-app)
