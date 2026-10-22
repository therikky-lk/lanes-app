// Minimal ID3v2.2/2.3/2.4 reader: title, artist, album, cover art and embedded
// lyrics. Enough for user-uploaded MP3s without pulling in a tagging library.

export interface Id3Tags {
  title?: string;
  artist?: string;
  album?: string;
  cover?: { mime: string; data: Uint8Array };
  lyrics?: string;
}

function synchsafe(b: Uint8Array, o: number): number {
  return ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
}

/** ID3 "latin1" frames written by Russian taggers are really cp1251 */
function looksLikeCp1251(bytes: Uint8Array): boolean {
  let high = 0;
  let letters = 0;
  for (const c of bytes) {
    if (c >= 0xc0) high++;
    if (c >= 0xc0 || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) letters++;
  }
  return letters > 0 && high / letters > 0.34;
}

function decodeText(bytes: Uint8Array, encoding: number): string {
  const label =
    encoding === 1 ? "utf-16" : encoding === 2 ? "utf-16be" : encoding === 3 ? "utf-8" : looksLikeCp1251(bytes) ? "windows-1251" : "latin1";
  let text: string;
  try {
    text = new TextDecoder(label).decode(bytes);
  } catch {
    text = new TextDecoder("latin1").decode(bytes);
  }
  // latin1 frames from Russian taggers are usually cp1251; utf-8 needs no help
  return text.replace(/\u0000+$/g, "").replace(/^﻿/, "").trim();
}

/** index right after a zero terminator for the given encoding */
function skipTerminated(bytes: Uint8Array, start: number, encoding: number): number {
  if (encoding === 1 || encoding === 2) {
    for (let i = start; i + 1 < bytes.length; i += 2) if (bytes[i] === 0 && bytes[i + 1] === 0) return i + 2;
  } else {
    for (let i = start; i < bytes.length; i++) if (bytes[i] === 0) return i + 1;
  }
  return bytes.length;
}

export function parseId3(buf: ArrayBuffer): Id3Tags {
  const b = new Uint8Array(buf);
  const tags: Id3Tags = {};
  if (b.length < 10 || b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return tags; // "ID3"
  const version = b[3];
  const flags = b[5];
  const size = synchsafe(b, 6);
  let pos = 10;
  const end = Math.min(b.length, 10 + size);
  if (flags & 0x40 && version >= 3) {
    // extended header
    const ext = version === 4 ? synchsafe(b, pos) : ((b[pos] << 24) | (b[pos + 1] << 16) | (b[pos + 2] << 8) | b[pos + 3]) + 4;
    pos += ext;
  }
  const idLen = version === 2 ? 3 : 4;
  const headLen = version === 2 ? 6 : 10;

  while (pos + headLen <= end) {
    const id = String.fromCharCode(...b.subarray(pos, pos + idLen));
    if (!/^[A-Z0-9]+$/.test(id)) break;
    let frameSize: number;
    if (version === 2) frameSize = (b[pos + 3] << 16) | (b[pos + 4] << 8) | b[pos + 5];
    else if (version === 4) frameSize = synchsafe(b, pos + 4);
    else frameSize = (b[pos + 4] << 24) | (b[pos + 5] << 16) | (b[pos + 6] << 8) | b[pos + 7];
    const dataStart = pos + headLen;
    const data = b.subarray(dataStart, Math.min(end, dataStart + frameSize));
    pos = dataStart + frameSize;
    if (frameSize <= 0 || data.length === 0) continue;

    const enc = data[0];
    switch (id) {
      case "TIT2":
      case "TT2":
        tags.title = decodeText(data.subarray(1), enc);
        break;
      case "TPE1":
      case "TP1":
        tags.artist = decodeText(data.subarray(1), enc).replace(/\u0000/g, ", ");
        break;
      case "TALB":
      case "TAL":
        tags.album = decodeText(data.subarray(1), enc);
        break;
      case "USLT":
      case "ULT": {
        // enc, 3-byte language, description\0, text
        const textStart = skipTerminated(data, 4, enc);
        const text = decodeText(data.subarray(textStart), enc);
        if (text) tags.lyrics = text;
        break;
      }
      case "APIC": {
        const mimeEnd = skipTerminated(data, 1, 0);
        const mime = new TextDecoder("latin1").decode(data.subarray(1, mimeEnd - 1)) || "image/jpeg";
        const descEnd = skipTerminated(data, mimeEnd + 1, enc); // +1 skips the picture type byte
        if (!tags.cover || data[mimeEnd] === 3) tags.cover = { mime, data: data.slice(descEnd) };
        break;
      }
      case "PIC": {
        const format = new TextDecoder("latin1").decode(data.subarray(1, 4)).toLowerCase();
        const descEnd = skipTerminated(data, 5, enc);
        if (!tags.cover) tags.cover = { mime: format === "png" ? "image/png" : "image/jpeg", data: data.slice(descEnd) };
        break;
      }
    }
  }
  return tags;
}

/** "Artist - Title.mp3" -> { artist, title } */
export function tagsFromFileName(name: string): { title: string; artist?: string } {
  const base = name.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/_/g, " ").trim();
  const m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(base);
  return m ? { artist: m[1].trim(), title: m[2].trim() } : { title: base };
}
