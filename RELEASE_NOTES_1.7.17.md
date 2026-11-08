# Lane 1.7.17

## Improvements

- Playlist imports now keep tracks beyond the first 100 and report incomplete saves instead of silently finishing with a partial playlist.
- Custom playlist covers retain more detail when saved and synced between devices.
- Added an optional setting to remember the selected Library category and grid/list layout when returning to Library.
- Added a setting to show or hide the Liked Songs, Cached Songs, and On this device shortcuts in Library.
- Cached tracks now show a green saved indicator beside the track title.
- Standardized track-list search buttons and improved Library navigation spacing.
- Track actions menus no longer scroll the page or their contents while open.
- Adding a track to a playlist now sends the track details already available in the interface, avoiding an unnecessary catalog lookup.
- Local-file tracks are now stored as regular playlist entries containing metadata only, so adding them is no longer limited by the playlist description size. The audio remains on its original device.

## Fixes

- Improved the alignment of navigation icons, pinned covers, and the divider in the desktop sidebar.
- Made the mobile Library header fully opaque so list items do not show through it.
