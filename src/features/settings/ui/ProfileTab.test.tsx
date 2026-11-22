import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ProfileTab from "./ProfileTab";

const mocks = vi.hoisted(() => ({
  request: vi.fn(), updateProfile: vi.fn(), navigate: vi.fn(),
  share: vi.fn(), toast: vi.fn(), getProfile: vi.fn(),
  mobile: false,
  dialog: vi.fn(),
  user: { id: "listener", username: "listener", displayName: "Listener", bio: "", isPublic: true },
}));
vi.mock("@/features/auth", () => ({ useAuthStore: Object.assign((selector: (state: unknown) => unknown) => selector({ user: mocks.user }), { getState: () => ({ updateProfile: mocks.updateProfile }) }) }));
vi.mock("@/shared/api", () => ({ api: { getUserProfile: mocks.getProfile } }));
vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/languages", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/shared/ui/UserAvatar", () => ({ default: () => <span /> }));
vi.mock("@/shared/utils/share", () => ({ shareEntity: mocks.share, SHARE_BASE_URL: "https://lane-app.site" }));
vi.mock("@/shared/ui/Toast", () => ({ showToast: mocks.toast }));
vi.mock("@/shared/hooks/useIsMobile", () => ({ useIsMobile: () => mocks.mobile }));
vi.mock("@/shared/ui/Dialog", () => ({ default: (props: { open: boolean; children: React.ReactNode }) => {
  mocks.dialog(props);
  return props.open ? <div role="dialog">{props.children}</div> : null;
} }));
vi.mock("@/features/covers/ui/CoverImage", () => ({ default: () => <span /> }));
vi.mock("@/features/player", () => ({ playerEngine: { playTrack: vi.fn() } }));
vi.mock("./AvatarEditor", () => ({ default: () => <span /> }));
vi.mock("./ProfileMusicPicker", () => ({ default: (props: { onTrack: (track: unknown) => Promise<void>; onArtist: (artist: unknown) => Promise<void> }) => <div data-testid="music-picker">
  <button onClick={() => void props.onArtist({ id: "artist-1", name: "Artist", coverUrl: "" })}>select-artist</button>
  <button onClick={() => void props.onTrack({ id: "dQw4w9WgXcQ", title: "Favorite song", artists: "Artist", coverUrl: "", durationMs: 1000, playCount: 0 })}>select-track</button>
</div> }));
vi.mock("../store/profileCustomization", () => ({
  emptyProfile: { banner: null, links: [], artist: null, tracks: [] },
  profileOwner: () => "liner:listener", profileRequest: mocks.request,
}));
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const button = (text: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === text || item.getAttribute("aria-label") === text)!;
const click = (text: string) => act(async () => { button(text).click(); });
const type = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => act(async () => {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
});
const submit = () => act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.clearAllMocks();
  mocks.mobile = false;
  mocks.user.isPublic = true;
  mocks.share.mockResolvedValue("copied");
  mocks.request.mockResolvedValue({ banner: null, links: [], artist: null, tracks: [] });
  mocks.updateProfile.mockResolvedValue(mocks.user);
  mocks.getProfile.mockReset().mockResolvedValue({ id: "listener", followersCount: 7, listenedDurationMs: 5400000, likedTracksCount: 42 });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

it("edits account fields inside settings and keeps the editor open on server failure", async () => {
  await act(async () => root.render(<ProfileTab />));
  await click("settings.profile.edit");
  const fields = container.querySelectorAll<HTMLInputElement>("form input");
  await type(fields[0], "New name");
  await type(fields[1], "new_username");
  await type(container.querySelector("textarea")!, "My music");
  mocks.updateProfile.mockRejectedValueOnce(new Error("offline"));
  await submit();
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("settings.profile.save_failed");
  await submit();
  expect(mocks.updateProfile).toHaveBeenLastCalledWith({ displayName: "New name", username: "new_username", bio: "My music", isPublic: true });
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(mocks.navigate).not.toHaveBeenCalled();
});

it("shows account fields in a desktop modal with explicit Close and Save actions", async () => {
  await act(async () => root.render(<ProfileTab />));
  await click("settings.profile.edit");
  expect(container.querySelector('[role="tablist"]')).toBeNull();
  expect(container.querySelector(".lane-profile-editor-summary")).toBeNull();
  expect(container.querySelector(".lane-profile-favorites")).not.toBeNull();
  expect(button("common.cancel")).toBeUndefined();
  expect(button("common.close")).toBeDefined();
  expect(mocks.dialog).toHaveBeenLastCalledWith(expect.objectContaining({ bottomSheet: false, closeOnBackdrop: false, closeOnEscape: false }));
  expect(container.querySelector("[data-sheet-handle]")).toBeNull();
  expect(container.querySelector(".lane-profile-account-fields")).not.toBeNull();
  expect(container.querySelectorAll("form input")).toHaveLength(2);
  expect(container.querySelector("textarea")).not.toBeNull();
  expect(container.textContent).not.toContain("settings.profile.add_bio");
});

it("closes without saving when Close is pressed", async () => {
  await act(async () => root.render(<ProfileTab />));
  await click("settings.profile.edit");
  await click("common.close");
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(mocks.updateProfile).not.toHaveBeenCalled();
});

it("keeps the draggable sheet on mobile, without backdrop dismissal", async () => {
  mocks.mobile = true;
  await act(async () => root.render(<ProfileTab />));
  await click("settings.profile.edit");
  expect(mocks.dialog).toHaveBeenLastCalledWith(expect.objectContaining({ bottomSheet: true, closeOnBackdrop: false, closeOnEscape: false }));
  expect(container.querySelector("[data-sheet-handle]")).not.toBeNull();
  expect(button("common.close")).toBeDefined();
});

it("blocks customization after a failed read so existing remote data cannot be overwritten", async () => {
  mocks.request.mockRejectedValueOnce(new Error("offline"));
  await act(async () => root.render(<ProfileTab />));
  expect(container.querySelector<HTMLButtonElement>(".lane-profile-banner-upload")!.disabled).toBe(true);
  await click("settings.profile.retry");
  expect(container.querySelector<HTMLButtonElement>(".lane-profile-banner-upload")!.disabled).toBe(false);
});

it("opens editing with the profile action and saves privacy only through the editor switch", async () => {
  await act(async () => root.render(<ProfileTab />));
  const pencil = button("settings.profile.edit");
  expect(pencil.getAttribute("aria-label")).toBe("settings.profile.edit");
  expect(pencil.textContent).toBe("settings.profile.edit");
  expect(button("common.share")).toBeDefined();
  await act(async () => pencil.click());
  expect(mocks.updateProfile).not.toHaveBeenCalled();
  const privacy = container.querySelector<HTMLButtonElement>('[aria-label="settings.profile.public_profile.title"]')!;
  expect(privacy.getAttribute("aria-pressed")).toBe("true");
  await act(async () => privacy.click());
  expect(privacy.getAttribute("aria-pressed")).toBe("false");
  expect(mocks.updateProfile).not.toHaveBeenCalled();
  await submit();
  expect(mocks.updateProfile).toHaveBeenCalledWith({ displayName: "Listener", username: "listener", bio: null, isPublic: false });
});

it("opens the banner file picker when the banner is clicked", async () => {
  await act(async () => root.render(<ProfileTab />));
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  const spy = vi.spyOn(input, "click");
  await act(async () => container.querySelector<HTMLButtonElement>(".lane-profile-banner-upload")!.click());
  expect(spy).toHaveBeenCalledOnce();
});

it("shares the signed-in profile and confirms copying the link", async () => {
  await act(async () => root.render(<ProfileTab />));
  await click("common.share");
  expect(mocks.share).toHaveBeenCalledWith("profile", "liner:listener", { title: "Listener" });
  expect(mocks.toast).toHaveBeenCalledWith("sharing.copied", "checkmark");
});

it("opens privacy settings for a private profile without publishing it automatically", async () => {
  mocks.user.isPublic = false;
  await act(async () => root.render(<ProfileTab />));
  await click("common.share");
  expect(mocks.share).not.toHaveBeenCalled();
  expect(mocks.updateProfile).not.toHaveBeenCalled();
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="settings.profile.public_profile.title"]')?.getAttribute("aria-pressed")).toBe("false");
});

it("reports a share failure and allows retrying", async () => {
  mocks.share.mockRejectedValueOnce(new Error("offline"));
  await act(async () => root.render(<ProfileTab />));
  await click("common.share");
  expect(mocks.toast).toHaveBeenCalledWith("sharing.failed", "error");
  expect(button("common.share").disabled).toBe(false);
  await click("common.share");
  expect(mocks.share).toHaveBeenCalledTimes(2);
});

it.each(["track", "artist"])("saves selected favorite %s to the account", async kind => {
  await act(async () => root.render(<ProfileTab />));
  expect(button("settings.profile.choose_artist")).toBeUndefined();
  expect(button("settings.profile.add_song")).toBeUndefined();
  expect(button("settings.profile.favorites").getAttribute("aria-haspopup")).toBe("dialog");
  await click("settings.profile.favorites");
  expect(container.querySelector('[data-testid="music-picker"]')).not.toBeNull();
  await click(`select-${kind}`);
  expect(mocks.request).toHaveBeenLastCalledWith("liner:listener", kind === "artist"
    ? { artist: { id: "artist-1", name: "Artist", coverUrl: "" }, tracks: [] }
    : { tracks: [{ id: "dQw4w9WgXcQ", title: "Favorite song", artists: "Artist", coverUrl: "", durationMs: 1000, playCount: 0 }], artist: null });
});

it("shows only one legacy track, prevents adding anything else and clears the selection", async () => {
  const tracks = ["a", "b", "c"].map(id => ({ id, title: id, artists: "Artist", coverUrl: "", durationMs: 1000, playCount: 0 }));
  mocks.request.mockResolvedValue({ banner: null, links: [], artist: null, tracks });
  await act(async () => root.render(<ProfileTab />));
  expect(button("settings.profile.add_song")).toBeUndefined();
  expect(button("settings.profile.choose_artist")).toBeUndefined();
  expect(container.querySelectorAll(".lane-profile-music-item")).toHaveLength(1);
  expect(container.querySelector(".lane-profile-music-trigger")).toBeNull();
  const remove = container.querySelector<HTMLButtonElement>('[aria-label="settings.profile.remove_song"]')!;
  await act(async () => remove.click());
  expect(remove.classList.contains("lane-profile-remove")).toBe(true);
  expect(mocks.request).toHaveBeenLastCalledWith("liner:listener", { tracks: [], artist: null });
});

it("does not allow adding a track or second artist when an artist is selected", async () => {
  mocks.request.mockResolvedValue({ banner: null, links: [], tracks: [], artist: { id: "artist-1", name: "Artist", coverUrl: "" } });
  await act(async () => root.render(<ProfileTab />));
  expect(button("settings.profile.add_song")).toBeUndefined();
  expect(button("settings.profile.choose_artist")).toBeUndefined();
  await click("settings.profile.remove_artist");
  expect(mocks.request).toHaveBeenLastCalledWith("liner:listener", { tracks: [], artist: null });
});

it("places full-width edit and share actions below the centered identity", async () => {
  await act(async () => root.render(<ProfileTab />));
  const actions = container.querySelector(".lane-profile-header-actions")!;
  const controls = actions.querySelectorAll("button");
  expect(controls).toHaveLength(2);
  expect(controls[0].getAttribute("aria-label")).toBe("settings.profile.edit");
  expect(controls[1].getAttribute("aria-label")).toBe("common.share");
  expect(controls[0].textContent).toBe("settings.profile.edit");
  expect(controls[1].textContent).toBe("common.share");
  expect(container.querySelector(".lane-profile-identity")!.contains(controls[0])).toBe(false);
  expect(container.querySelector(".lane-profile-identity")!.contains(controls[1])).toBe(false);
  expect(container.querySelector(".lane-profile-identity")!.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("shows the same profile statistics as the public page on mobile", async () => {
  mocks.mobile = true;
  await act(async () => root.render(<ProfileTab />));
  expect(mocks.getProfile).toHaveBeenCalledWith("listener");
  const stats = container.querySelector(".lane-profile-stats")!;
  expect(stats.textContent).toContain("settings.profile.followers7");
  expect(stats.textContent).toContain("settings.profile.liked_tracks42");
  expect(stats.querySelector("dd")!.textContent).not.toBe("—");
  expect(stats.compareDocumentPosition(container.querySelector(".lane-profile-header-actions")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("retries a stats failure without blocking profile editing or fabricating zero counts", async () => {
  mocks.getProfile.mockRejectedValueOnce(new Error("offline"));
  await act(async () => root.render(<ProfileTab />));
  expect([...container.querySelectorAll(".lane-profile-stats dd")].map(node => node.textContent)).toEqual(["—", "—", "—"]);
  expect(button("settings.profile.edit").disabled).toBe(false);
  await click("settings.profile.retry");
  expect(container.querySelector(".lane-profile-stats")!.textContent).toContain("settings.profile.followers7");
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

it("refreshes stats when returning to the app without resetting the editor", async () => {
  await act(async () => root.render(<ProfileTab />));
  await click("settings.profile.edit");
  mocks.getProfile.mockResolvedValue({ id: "listener", followersCount: 8, likedTracksCount: 43 });
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(container.querySelector(".lane-profile-stats")!.textContent).toContain("settings.profile.followers8");
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  expect(mocks.request).toHaveBeenCalledTimes(1);
});

it("ignores a stats response after leaving the profile", async () => {
  let resolve!: (value: unknown) => void;
  mocks.getProfile.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await act(async () => root.render(<ProfileTab />));
  await act(async () => root.render(<div>Other page</div>));
  await act(async () => resolve({ followersCount: 100 }));
  expect(container.textContent).toBe("Other page");
});
