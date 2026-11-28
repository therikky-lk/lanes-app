export function waitForCanPlay(audio: EventTarget, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const finish = () => {
      clearTimeout(timeout);
      audio.removeEventListener("canplay", finish);
      audio.removeEventListener("error", finish);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timeout = setTimeout(finish, 3000);
    audio.addEventListener("canplay", finish);
    audio.addEventListener("error", finish);
    signal.addEventListener("abort", finish);
  });
}
