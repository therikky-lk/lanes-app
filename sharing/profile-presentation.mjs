const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Account avatars may be uploaded raster images, not just remote HTTPS URLs.
// Do not permit SVG/HTML data URLs or arbitrary data payloads.
export function profileImage(value, accountOrigin) {
  if (typeof value !== "string" || !value) return "";
  if (value.startsWith("data:")) {
    if (value.length > 8 * 1024 * 1024) return "";
    return /^data:image\/(?:jpeg;base64,\/9j\/|png;base64,iVBORw0KGgo|gif;base64,R0lGOD[dl]h|webp;base64,UklGR)[A-Za-z0-9+/=]+$/.test(value) ? value : "";
  }
  if (value.length > 4096) return "";
  try {
    const url = value.startsWith("/") && !value.startsWith("//") ? new URL(value, accountOrigin) : new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

export function renderUnavailableProfilePage() {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Профиль приватный — Lane</title><meta name="robots" content="noindex"><meta name="color-scheme" content="light dark">
<style>
:root{color-scheme:light dark;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;--bg:#f5f5f7;--surface:#fff;--text:#18181b;--muted:#71717a;--border:#e4e4e7}
@media(prefers-color-scheme:dark){:root{--bg:#0d0d10;--surface:#17171b;--text:#f4f4f5;--muted:#a1a1aa;--border:#29292e}}
*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:calc(env(safe-area-inset-top,0px) + 28px) 20px calc(env(safe-area-inset-bottom,0px) + 28px);background:var(--bg);color:var(--text);text-align:center}main{width:min(100%,480px)}.brand{font-size:14px;letter-spacing:.22em;font-weight:750;margin-bottom:26px}.card{padding:36px 24px;border:1px solid var(--border);border-radius:22px;background:var(--surface)}.lock{font-size:32px;margin-bottom:18px}h1{font-size:26px;line-height:1.2;margin:0 0 14px}p{font-size:14px;line-height:1.65;color:var(--muted);margin:0}a{display:inline-flex;justify-content:center;align-items:center;min-height:44px;padding:11px 20px;margin-top:24px;border-radius:11px;background:var(--text);color:var(--surface);text-decoration:none;font-size:14px;font-weight:650}a:focus-visible{outline:2px solid var(--text);outline-offset:4px}
</style></head><body><main><div class="brand">LANE</div><section class="card"><div class="lock" aria-hidden="true">🔒</div><h1>Профиль приватный или недоступен</h1><p>Владелец мог закрыть свой профиль. Чтобы он был виден по ссылке, нужно включить «Публичный профиль» в настройках Lane.</p><a href="/">На главную Lane</a></section></main></body></html>`;
}

export function renderProfilePage(share, origin) {
  const profile = share.profile;
  const name = profile.displayName || profile.username || "Lane";
  const description = profile.bio || (profile.username ? `@${profile.username} в Lane` : "Музыкальный профиль в Lane");
  const open = `lane://share?id=${encodeURIComponent(share.id)}`;
  const intent = `intent://share?id=${encodeURIComponent(share.id)}#Intent;scheme=lane;package=com.therikky.lane;S.browser_fallback_url=${encodeURIComponent(`${origin}/s/${share.id}`)};end`;
  const artwork = (url, initial, className) => url
    ? `<img class="${className}" src="${escape(url)}" alt="" referrerpolicy="no-referrer">`
    : `<span class="${className} placeholder" aria-hidden="true">${escape(initial)}</span>`;
  const musicLink = (type, id) => `lane://${type}?id=${encodeURIComponent(id)}`;
  const artist = profile.artist ? `<a class="music-row artist" href="${escape(musicLink("artist", profile.artist.id))}">${artwork(profile.artist.coverUrl, profile.artist.name.slice(0, 1), "artwork")}<span class="music-title"><strong>${escape(profile.artist.name)}</strong></span><span class="play" aria-hidden="true">↗</span></a>` : "";
  const tracks = (profile.tracks || []).map(track => `<a class="music-row" href="${escape(musicLink("track", track.id))}" aria-label="${escape(`Слушать ${track.title} в Lane`)}">${artwork(track.coverUrl, "♪", "artwork")}<span class="music-title"><strong>${escape(track.title)}</strong><small>${escape(track.artists)}</small></span><span class="play" aria-hidden="true">▶</span></a>`).join("");
  const thumbnail = `${origin}/thumb/${encodeURIComponent(share.id)}.jpg`;
  const imageType = profile.avatarUrl.startsWith("data:") ? profile.avatarUrl.slice(5, profile.avatarUrl.indexOf(";")) : "image/jpeg";
  const count = value => Number.isFinite(value) ? escape(new Intl.NumberFormat("ru").format(Math.max(0, value))) : "—";
  const minutes = Number.isFinite(profile.listenedDurationMs) ? Math.floor(Math.max(0, profile.listenedDurationMs) / 60000) : null;
  const listening = minutes == null ? "—" : minutes >= 60 ? `${Math.floor(minutes / 60)} ч ${minutes % 60} мин` : `${minutes} мин`;
  const stats = `<dl class="stats"><div><dt>Время прослушивания</dt><dd>${listening}</dd></div><div><dt>В избранном</dt><dd>${count(profile.likedTracksCount)}</dd></div><div><dt>Подписчики</dt><dd>${count(profile.followersCount)}</dd></div></dl>`;
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark"><meta name="theme-color" content="#0d0d10" media="(prefers-color-scheme: dark)"><meta name="theme-color" content="#f5f5f7" media="(prefers-color-scheme: light)">
<title>${escape(name)} — Lane</title><meta name="description" content="${escape(description)}">
<meta property="og:type" content="profile"><meta property="og:site_name" content="Lane"><meta property="og:title" content="${escape(name)} — Lane"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${escape(origin)}/s/${share.id}">
${profile.avatarUrl ? `<meta property="og:image" content="${escape(thumbnail)}"><meta property="og:image:type" content="${escape(imageType)}"><meta name="twitter:image" content="${escape(thumbnail)}">` : ""}
<meta name="twitter:card" content="summary"><meta name="twitter:title" content="${escape(name)} — Lane"><meta name="twitter:description" content="${escape(description)}">
<style>
:root{color-scheme:light dark;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;--canvas:#f5f5f7;--surface:#fff;--control:#eeeef1;--text:#18181b;--muted:#71717a;--border:#e4e4e7;--button:#18181b;--button-text:#fff}
@media(prefers-color-scheme:dark){:root{--canvas:#0d0d10;--surface:#17171b;--control:#242429;--text:#f4f4f5;--muted:#a1a1aa;--border:#29292e;--button:#f4f4f5;--button-text:#18181b}}
*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--text);min-height:100svh;padding:calc(env(safe-area-inset-top,0px) + 28px) 18px calc(env(safe-area-inset-bottom,0px) + 28px);-webkit-font-smoothing:antialiased}main{width:min(100%,720px);margin:0 auto}.brand{text-align:center;font-size:14px;font-weight:750;letter-spacing:.22em;margin:4px 0 26px}.card{background:var(--surface);border:1px solid var(--border);border-radius:22px;overflow:hidden}.banner{display:block;width:100%;aspect-ratio:3/1;object-fit:cover;background:radial-gradient(ellipse at 10% 0%,#8886,transparent 65%),var(--control)}.body{padding:0 26px 26px}.identity{position:relative;display:flex;align-items:flex-start;gap:18px;margin-top:-32px}.avatar{height:112px;width:112px;flex-shrink:0;border:6px solid var(--surface);border-radius:50%;object-fit:cover;background:var(--control)}.placeholder{display:grid;place-items:center;color:var(--muted);font-size:40px;font-weight:700}.name{min-width:0;padding-top:48px}h1{margin:0;font-size:clamp(24px,5vw,34px);line-height:1.15;overflow-wrap:anywhere;letter-spacing:-.025em}.username{color:var(--muted);margin:7px 0 0;font-size:14px}.bio{font-size:14px;line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere;margin:22px 0 0}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}.button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:11px 20px;border-radius:11px;background:var(--button);color:var(--button-text);font-size:14px;font-weight:650;text-decoration:none}.secondary{background:var(--control);color:var(--text)}.android-open{display:none}.music{margin:26px 0 0}.music h2{font-size:21px;letter-spacing:-.02em;margin:0 0 14px}.music-list{padding:10px 16px;border:1px solid var(--border);border-radius:18px;background:var(--surface)}.music-row{display:flex;align-items:center;gap:13px;padding:12px 0;color:var(--text);text-decoration:none}.music-row+.music-row{border-top:1px solid var(--border)}.artwork{height:52px;width:52px;flex-shrink:0;object-fit:cover;border-radius:10px;font-size:22px;background:var(--control)}.artist .artwork{border-radius:50%}.music-title{display:flex;flex-direction:column;gap:5px;min-width:0;flex:1}.music-title strong,.music-title small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.music-title strong{font-size:14px;font-weight:650}.music-title small,.hint{font-size:12px;color:var(--muted)}.play{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:var(--control);font-size:13px;flex-shrink:0}.hint{margin:12px 0;text-align:center;line-height:1.6}a:focus-visible{outline:2px solid var(--text);outline-offset:4px}a:hover{filter:brightness(.92)}
@media(max-width:480px){body{padding-left:14px;padding-right:14px}.body{padding:0 18px 20px}.identity{gap:12px;margin-top:-26px}.avatar{width:90px;height:90px;border-width:5px}.name{padding-top:39px}.actions .button{flex:1;padding-left:12px;padding-right:12px}.brand{margin-bottom:20px}}
@supports(font:-apple-system-body){body{font-family:system-ui,-apple-system,sans-serif}}
.identity{flex-direction:column;align-items:center;gap:12px;text-align:center}.name{padding-top:0;width:100%}h1{font-size:clamp(28px,5vw,36px)}.bio{text-align:center}.actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.button{min-width:0;text-align:center;overflow-wrap:anywhere}
.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:24px 0 0;padding-top:18px;border-top:1px solid var(--border);text-align:center}.stats>div{display:flex;flex-direction:column;gap:7px;min-width:0}.stats dt{order:2;font-size:11px;line-height:1.4;color:var(--muted);overflow-wrap:anywhere}.stats dd{order:1;margin:0;font-size:16px;font-weight:650;line-height:1.4;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.empty-music{margin:0;padding:16px;font-size:13px;line-height:1.6;color:var(--muted)}
</style></head><body><main><div class="brand">LANE</div><section class="card">
${profile.banner ? `<img class="banner" src="${escape(profile.banner)}" alt="" referrerpolicy="no-referrer">` : '<div class="banner"></div>'}
<div class="body"><div class="identity">${artwork(profile.avatarUrl, name.slice(0, 1).toUpperCase(), "avatar")}<div class="name"><h1>${escape(name)}</h1>${profile.username ? `<p class="username">@${escape(profile.username)}</p>` : ""}</div></div>
${profile.bio ? `<p class="bio">${escape(profile.bio)}</p>` : ""}${stats}<div class="actions"><a class="button" href="${escape(open)}">Открыть в Lane</a><a class="button secondary" href="https://github.com/therikky-lk/lanes-app/releases/latest" target="_blank" rel="noopener noreferrer">Скачать Lane</a></div>
<a class="android-open" href="${escape(intent)}">Открыть на Android</a></div></section>
${artist || tracks ? `<section class="music"><h2>${artist ? "Любимый исполнитель" : "Любимый трек"}</h2><div class="music-list">${artist}${tracks}</div><p class="hint">${artist ? "Нажмите на исполнителя, чтобы открыть его музыку в Lane." : "Нажмите на трек, чтобы послушать его в Lane."}</p></section>` : '<section class="music"><h2>Любимая музыка</h2><div class="music-list"><p class="empty-music">Любимый трек или исполнитель пока не выбран.</p></div></section>'}
</main></body></html>`;
}
