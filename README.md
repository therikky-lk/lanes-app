<p align="center">
  <img src="build/icon.png" width="112" alt="Lane">
</p>

<h1 align="center">Lane</h1>

<p align="center">Музыкальный плеер для Windows и Linux · личная сборка на основе <a href="https://github.com/tryliner/desktop">Liner</a></p>

## Что умеет

- **Мой вайб** — бесконечный персональный поток на главной: радио от ваших лайков и истории, живой градиент, который пульсирует в такт музыке.
- **Тексты почти для всех треков** — сервер Liner, затем LRCLIB (синхронные строки) и YouTube Music (обычный текст). Если текста нет, можно вставить свой LRC или загрузить `.lrc`.
- **Свои треки** — загрузка MP3/FLAC/M4A/OGG с диска; название, исполнитель, обложка и вшитый текст читаются из тегов. Файлы хранятся только на устройстве.
- **Импорт из Spotify** — плейлисты по ссылке, с оригинальной обложкой.
- **Дейли-миксы** — шесть миксов примерно по 50 треков, собранных из ваших любимых исполнителей и обновляемых каждый день.
- **Вся дискография исполнителя** — все альбомы и синглы, сеткой или списком.
- **Discord Rich Presence** — работает с Discord из Flatpak и Snap, Vesktop, Equibop, Legcord; переподключается после перезапуска Discord.

## Установка

Последняя сборка — во вкладке **Releases** (релиз `releases`).

| Система | Файл |
| --- | --- |
| Windows 10/11 | `Lane-Setup-*.exe` (установщик) или `Lane-*-portable.exe` |
| Любой Linux | `Lane-*-x86_64.AppImage` → `chmod +x` и запустить |
| Ubuntu / Debian / Mint | `sudo apt install ./lane_*_amd64.deb` |
| Fedora / openSUSE | `sudo dnf install ./lane-*.x86_64.rpm` (заменит пакет `liner`) |

## Сборка из исходников

```bash
pnpm install
pnpm exec vite build
pnpm exec electron-builder --linux   # или --win
```

Пакеты появятся в `release/`. Новая версия: поднять `version` в `package.json` и отправить тег `vX.Y.Z` — GitHub Actions соберёт всё и обновит релиз.

## Лицензия

Lane основан на [Liner](https://github.com/tryliner/desktop) и распространяется на условиях его лицензии ([LICENSE](LICENSE)): только личное некоммерческое использование, без публичного распространения. Репозиторий приватный.
