// Update information must be written into the runtime BEFORE electron-builder
// compresses the app and calculates its embedded blockmap / latest-linux.yml.
export const UPDATE_INFORMATION =
  "gh-releases-zsync|therikky-lk|lanes-app|latest|Lane-*-x86_64.AppImage.zsync";

export function embedUpdateInformation(runtime, information = UPDATE_INFORMATION) {
  if (runtime.subarray(0, 4).toString("hex") !== "7f454c46"
    || runtime[4] !== 2 || runtime[5] !== 1) {
    throw new Error("Expected a little-endian ELF64 AppImage runtime");
  }
  const sectionOffset = Number(runtime.readBigUInt64LE(40));
  const sectionSize = runtime.readUInt16LE(58);
  const sectionCount = runtime.readUInt16LE(60);
  const stringsIndex = runtime.readUInt16LE(62);
  if (sectionSize < 64 || !sectionCount || stringsIndex >= sectionCount
    || !Number.isSafeInteger(sectionOffset)
    || sectionOffset + sectionSize * sectionCount > runtime.length) {
    throw new Error("Invalid ELF section table");
  }
  const section = (index) => sectionOffset + index * sectionSize;
  const range = (header) => {
    const offset = Number(runtime.readBigUInt64LE(header + 24));
    const size = Number(runtime.readBigUInt64LE(header + 32));
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size)
      || offset < 0 || size < 0 || offset + size > runtime.length) {
      throw new Error("Invalid ELF section bounds");
    }
    return { offset, size };
  };
  const strings = range(section(stringsIndex));
  for (let index = 0; index < sectionCount; index++) {
    const header = section(index);
    const nameOffset = runtime.readUInt32LE(header);
    if (nameOffset >= strings.size) continue;
    const start = strings.offset + nameOffset;
    const end = runtime.indexOf(0, start);
    if (end < start || end >= strings.offset + strings.size) continue;
    if (runtime.toString("utf8", start, end) !== ".upd_info") continue;
    const { offset, size } = range(header);
    const bytes = Buffer.from(information, "utf8");
    if (bytes.includes(0) || bytes.length >= size) {
      throw new Error("Update information does not fit the runtime section");
    }
    const result = Buffer.from(runtime);
    result.fill(0, offset, offset + size);
    bytes.copy(result, offset);
    return result;
  }
  throw new Error("AppImage runtime has no .upd_info section");
}
