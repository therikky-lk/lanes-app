import AVFoundation
import Capacitor
import Foundation
import WebKit

final class LaneBridgeViewController: CAPBridgeViewController {
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        publishSafeAreaInsets()
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        publishSafeAreaInsets()
    }

    private func publishSafeAreaInsets() {
        guard let webView else { return }
        let insets = view.safeAreaInsets
        webView.evaluateJavaScript("""
            (() => {
                const style = document.documentElement?.style;
                if (!style) return;
                style.setProperty("--lane-ios-safe-top", "\(insets.top)px");
                style.setProperty("--lane-ios-safe-right", "\(insets.right)px");
                style.setProperty("--lane-ios-safe-bottom", "\(insets.bottom)px");
                style.setProperty("--lane-ios-safe-left", "\(insets.left)px");
            })()
            """)
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(LaneHttpPlugin())
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
        } catch {
            NSLog("Lane audio session setup failed: %@", error.localizedDescription)
        }

        #if targetEnvironment(simulator)
        if ProcessInfo.processInfo.arguments.contains("--lane-smoke-test") {
            checkRenderer(attempts: 60)
        } else if ProcessInfo.processInfo.arguments.contains("--lane-glass-test") {
            checkGlass(attempts: 60)
        } else if ProcessInfo.processInfo.arguments.contains("--lane-account-test") {
            if ProcessInfo.processInfo.arguments.contains("--lane-capture-gallery") {
                webView?.configuration.userContentController.addScriptMessageHandler(
                    self, contentWorld: .page, name: "laneQACapture"
                )
            }
            checkAccount(attempts: 60)
        }
        #endif
    }

    #if targetEnvironment(simulator)
    private func writeTestResult(_ text: String, named name: String) {
        guard let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else { return }
        try? FileManager.default.createDirectory(at: caches, withIntermediateDirectories: true)
        try? Data(text.utf8).write(to: caches.appendingPathComponent(name), options: .atomic)
    }

    private func checkRenderer(attempts: Int) {
        guard attempts > 0 else { return }
        // This verifies the bundled React UI (not just a successful native launch)
        // and that WebKit can play a short, local WAV without provider accounts.
        let probe = """
        if (window.Capacitor?.getPlatform() !== "ios" ||
            !document.querySelector("#root button, #root a, #root input")) return false;
        const bytes = new Uint8Array(844).fill(128);
        const view = new DataView(bytes.buffer);
        const tag = (at, text) => bytes.set(new TextEncoder().encode(text), at);
        tag(0, "RIFF"); view.setUint32(4, 836, true); tag(8, "WAVE");
        tag(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
        view.setUint16(22, 1, true); view.setUint32(24, 8000, true);
        view.setUint32(28, 8000, true); view.setUint16(32, 1, true);
        view.setUint16(34, 8, true); tag(36, "data"); view.setUint32(40, 800, true);
        const url = URL.createObjectURL(new Blob([bytes], {type: "audio/wav"}));
        const audio = new Audio(url);
        try {
            return await new Promise(resolve => {
                audio.onended = () => resolve(true);
                audio.onerror = () => resolve(false);
                setTimeout(() => resolve(false), 3000);
                audio.play().catch(() => resolve(false));
            });
        } finally { audio.pause(); URL.revokeObjectURL(url); }
        """
        webView?.callAsyncJavaScript(probe, arguments: [:], in: nil, in: .page) { [weak self] result in
            if case .success(let value) = result, (value as? Bool) == true {
                self?.writeTestResult("Lane renderer and WebKit audio ready\n", named: "lane-smoke-ready")
            } else {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    self?.checkRenderer(attempts: attempts - 1)
                }
            }
        }
    }

    private func checkGlass(attempts: Int) {
        guard attempts > 0 else { return }
        // Exercise the dock's bundled CSS, including the low-end override.
        let probe = """
        if (!document.querySelector("#root button, #root a, #root input")) return null;
        document.activeElement?.blur();
        await new Promise(resolve => setTimeout(resolve, 400));
        window.scrollTo(0, 0);
        const root = document.documentElement;
        root.classList.add("lane-mobile", "lane-low-end");
        const stage = document.createElement("section");
        stage.style.cssText = "position:fixed;z-index:2147483647;inset:env(safe-area-inset-top) 0 env(safe-area-inset-bottom);padding:22px 12px;color:white;background:#141414;font:15px system-ui;overflow:hidden";
        const background = "repeating-linear-gradient(0deg, #121212 0 4px, #ededed 4px 8px)";
        stage.innerHTML = '<h1 style="font-size:22px;margin:0 0 12px">Lane • Standard blur</h1>' +
          '<p style="margin:0 0 24px">iPhone Simulator · bundled app styles</p>' +
          '<div style="display:flex;gap:8px">' +
          '<div style="flex:1;min-width:0"><p>Dock blur</p><div data-mobile-dock style="height:224px;padding:12px;background:' + background + '"><nav class="lane-dock-glass" style="height:200px"></nav></div></div>' +
          '<div style="flex:1;min-width:0"><p>Blur disabled</p><div data-mobile-dock style="height:224px;padding:12px;background:' + background + '"><nav class="lane-dock-glass" style="height:200px;backdrop-filter:none!important;-webkit-backdrop-filter:none!important"></nav></div></div>' +
          '</div>';
        document.body.appendChild(stage);
        const [glass, control] = stage.querySelectorAll(".lane-dock-glass");
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const describe = (el) => {
            const {x, y, width, height} = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            return {x, y, width, height, filter: style.backdropFilter || style.webkitBackdropFilter};
        };
        return JSON.stringify({
            userAgent: navigator.userAgent,
            devicePixelRatio: window.devicePixelRatio,
            viewport: {width: window.innerWidth, height: window.innerHeight},
            reducedTransparency: matchMedia("(prefers-reduced-transparency: reduce)").matches,
            blurSupported: CSS.supports("backdrop-filter", "blur(14px)"),
            theme: root.dataset.colorTheme,
            lens: glass.style.getPropertyValue("--lane-glass-filter"),
            glass: describe(glass),
            control: describe(control)
        }, null, 2);
        """
        webView?.callAsyncJavaScript(probe, arguments: [:], in: nil, in: .page) { [weak self] result in
            if case .success(let value) = result, let report = value as? String {
                self?.writeTestResult(report + "\n", named: "lane-glass-ready")
            } else {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    self?.checkGlass(attempts: attempts - 1)
                }
            }
        }
    }

    private func checkAccount(attempts: Int) {
        guard attempts > 0,
              let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else { return }
        let credentialsFile = caches.appendingPathComponent("lane-qa-credentials")
        guard let data = try? Data(contentsOf: credentialsFile),
              let credentials = try? JSONDecoder().decode([String: String].self, from: data),
              let email = credentials["email"], let password = credentials["password"] else {
            writeTestResult("{\"login\":\"missing credentials\"}\n", named: "lane-account-ready")
            return
        }
        let probe = """
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        const wait = async (condition, ms) => {
            for (const end = Date.now() + ms; Date.now() < end; ) {
                if (condition()) return true;
                await delay(150);
            }
            return false;
        };
        const input = document.querySelector('input[name="email"]');
        const secret = document.querySelector('input[name="password"]');
        if (!input?.form || !secret) return null;
        const form = input.form;
        let submitSeen = false;
        form.addEventListener("submit", () => { submitSeen = true; }, {once: true});
        const requests = [];
        const originalFetch = window.fetch;
        window.fetch = async function (resource, init) {
            let endpoint;
            try {
                const path = new URL(resource instanceof Request ? resource.url : resource, location.href).pathname;
                endpoint = {"/v1/auth/challenge": "challenge", "/v1/auth/login": "login", "/v1/me": "profile"}[path];
            } catch {}
            const entry = endpoint ? {endpoint, outcome: "pending"} : null;
            if (entry) requests.push(entry);
            try {
                const response = await originalFetch.call(this, resource, init);
                if (entry) { entry.outcome = "response"; entry.status = response.status; }
                return response;
            } catch (error) {
                if (entry) entry.outcome = error?.name === "AbortError" ? "aborted" : "network failure";
                throw error;
            }
        };
        const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        for (const [field, value] of [[input, email], [secret, password]]) {
            setValue.call(field, value);
            field.dispatchEvent(new Event("input", {bubbles: true}));
        }
        await delay(150);
        form.requestSubmit();
        const frame = () => document.querySelector("[data-lane-frame]");
        const loginResult = () => document.querySelector('[role="dialog"] iframe, iframe[src*="turnstile"]');
        try {
            await wait(() => frame() || loginResult() || form.dataset.authFailure, 60000);
        } finally {
            window.fetch = originalFetch;
        }
        const diagnostic = {submitSeen, requests, submitting: form.dataset.authSubmitting === "true",
            failure: form.dataset.authFailure, httpStatus: form.dataset.authHttpStatus};
        if (!frame()) return JSON.stringify({
            login: loginResult() ? "human verification required" : form.dataset.authFailure ? "rejected" : "did not open signed-in home",
            ...diagnostic
        });
        document.activeElement?.blur();
        const results = {};
        const captures = {};
        const layout = {};
        const checks = {};
        const geometry = () => {
            const viewport = window.visualViewport;
            const root = document.documentElement;
            const dock = document.querySelector("[data-mobile-dock] a");
            const frame = document.querySelector("[data-lane-frame]");
            const frameBounds = frame?.getBoundingClientRect();
            const probe = document.createElement("span");
            probe.style.cssText = "position:fixed;visibility:hidden;padding-top:var(--lane-safe-top);padding-bottom:var(--lane-safe-bottom)";
            document.body.appendChild(probe);
            const {paddingTop, paddingBottom} = getComputedStyle(probe);
            probe.remove();
            return {
                scale: viewport?.scale, viewportWidth: viewport?.width, rootWidth: root.clientWidth,
                screenWidth: screen.width, offsetLeft: viewport?.offsetLeft, pageLeft: viewport?.pageLeft,
                safeTop: parseFloat(paddingTop), safeBottom: parseFloat(paddingBottom),
                frameLeft: frameBounds?.left, frameRight: frameBounds?.right,
                navigationAnimation: frame?.querySelector(".page-transition") ? getComputedStyle(frame.querySelector(".page-transition")).animationName : null,
                tapAction: dock ? getComputedStyle(dock).touchAction : null
            };
        };
        const capture = async (name) => {
            const handler = window.webkit?.messageHandlers?.laneQACapture;
            if (!handler) return;
            await delay(280);
            try { captures[name] = await handler.postMessage(name) === true; }
            catch { captures[name] = false; }
        };
        const routes = [
            ["/", "[data-page-scroller]", "01-home"],
            ["/search", 'form[role="search"]', "02-search"],
            ["/library", "[data-page-scroller]", "03-library"],
            ["/library/cached", "[data-page-scroller]", "04-cached"],
            ["/local", "[data-page-scroller]", "05-local"],
            ["/recent", "[data-page-scroller]", "06-recent"],
            ["/settings", ".lane-settings-page", "07-settings"],
            ...["Appearance", "Profile", "Playback", "Audio", "Storage", "Connect", "Youtube", "YandexMusic", "Spotify", "About"]
                .map((tab, index) => ["/settings/" + tab, ".lane-settings-page", (8 + index).toString().padStart(2, "0") + "-settings-" + tab.toLowerCase()])
        ];
        const navigate = async (path) => {
            const link = document.querySelector(`nav a[href="#${path}"]`);
            if (link) link.click();
            else location.hash = path;
            await delay(450);
        };
        for (const [path, selector, name] of homeOnly ? routes.slice(0, 1) : routes) {
            await navigate(path);
            results[path] = await wait(() =>
                location.hash.split("?")[0] === "#" + path && frame()?.querySelector(selector), 4000);
            if (results[path]) {
                layout[path] = geometry();
                if (path === "/") {
                    const hero = document.querySelector("[data-lane-home] .lane-vibe-hero canvas");
                    checks.homeCanvasTop = hero?.getBoundingClientRect().top;
                }
                await capture(name);
            }
        }
        const extras = {};
        if (!homeOnly && window.webkit?.messageHandlers?.laneQACapture) {
            const interact = async (name, trigger, expected) => {
                const button = typeof trigger === "string" ? document.querySelector(trigger) : trigger();
                if (!button) { extras[name] = "trigger unavailable"; return false; }
                button.click();
                if (!await wait(() => document.querySelector(expected), 2500)) {
                    extras[name] = "surface not visible"; return false;
                }
                await capture(name);
                extras[name] = "opened";
                return true;
            };
            const byText = (container, text) => () => Array.from(document.querySelectorAll(container + " button"))
                .find(button => text.test(button.textContent.trim()));
            const selectButtons = () => [...document.querySelectorAll(".lane-settings-page button[aria-haspopup=listbox]")];
            await navigate("/settings/Appearance");
            if (await interact("32-language-options", () => selectButtons()[0], '[role="listbox"]')) selectButtons()[0]?.click();
            if (await interact("33-theme-options", () => selectButtons()[1], '[role="listbox"]')) selectButtons()[1]?.click();
            await navigate("/settings/Profile");
            await interact("34-edit-profile", byText(".lane-settings-page", /^edit(?: profile)?$/i), ".lane-profile-dialog");
            const libraryHeader = ".lane-library-mobile-header";
            await navigate("/library");
            await interact("20-library-view-menu", libraryHeader + ' button[aria-label="More"]', "[data-dropdown-menu]");
            await navigate("/search");
            await navigate("/library");
            if (await interact("21-library-add-menu", libraryHeader + " button:first-of-type", "[data-dropdown-menu]")) {
                await interact("22-create-playlist", byText("[data-dropdown-menu]", /create|new playlist/i), '[role="dialog"], [aria-label="Choose cover"]');
                const close = document.querySelector('[role="dialog"] button[aria-label="Close"], button[aria-label="Close"]');
                close?.click();
            }
            await navigate("/search");
            await navigate("/library");
            const add = document.querySelector(libraryHeader + " button:first-of-type");
            add?.click();
            if (await wait(() => document.querySelector("[data-dropdown-menu]"), 1500)) {
                if (await interact("35-import-playlist", byText("[data-dropdown-menu]", /import/i), '[role="dialog"]')) {
                    const dialog = document.querySelector('[data-dialog-container] [role="dialog"]');
                    const field = dialog?.querySelector("input");
                    const viewport = window.visualViewport;
                    if (dialog && field && viewport) {
                        const fullHeight = viewport.height;
                        field.focus({preventScroll: true});
                        const keyboardVisible = await wait(() => fullHeight - viewport.height > 90, 3500);
                        if (keyboardVisible) {
                            await delay(450);
                            const dialogTop = dialog.getBoundingClientRect().top - viewport.offsetTop;
                            const safeTop = geometry().safeTop;
                            checks.importWithKeyboard = {dialogTop, safeTop, pass: dialogTop >= safeTop - 2};
                            await capture("36-import-keyboard");
                        } else {
                            checks.importWithKeyboard = {keyboardVisible: false};
                        }
                        field.blur();
                    }
                }
                document.querySelector('[role="dialog"] button[aria-label="Close"]')?.click();
            }
            await navigate("/search");
            const search = document.querySelector('input[type="search"]');
            if (search?.form) {
                setValue.call(search, "Daft Punk");
                search.dispatchEvent(new Event("input", {bubbles: true}));
                await delay(700);
                search.form.requestSubmit();
                await delay(1600);
                await capture("23-search-results");
                extras["23-search-results"] = "query submitted";
                byText('[aria-label="Search"]', /^tracks$|^songs$/i)()?.click();
                await wait(() => document.querySelector("[data-reorder-item]"), 6000);
                if (await interact("30-track-actions", '[data-reorder-item] button[aria-label="More options"]', ".lane-track-actions-sheet, [data-dropdown-menu]")) {
                    document.querySelector('.lane-track-actions-sheet button[aria-label="Close"]')?.click();
                }
                const track = document.querySelector("[data-reorder-item]");
                if (track) {
                    track.click();
                    if (await wait(() => document.querySelector('[data-mobile-dock] [data-player-progress]'), 4000)) {
                        await capture("31-mini-player");
                    }
                }
            }
            await navigate("/player");
            if (await wait(() => location.hash === "#/player" &&
                document.querySelector("[data-visual-quality] [data-player-artwork]"), 2000)) {
                await capture("24-player");
                const playerActions = [
                    ["25-player-queue", "Queue", '[aria-label="Close"], [role="dialog"]'],
                    ["26-player-lyrics", "Lyrics", "[data-lyrics-mode]"],
                    ["27-player-comments", "Comments", '[role="dialog"], [data-no-sheet-drag]'],
                    ["28-player-equalizer", "Equalizer", '[role="dialog"], [data-no-sheet-drag]'],
                    ["29-player-speed", "Speed", '[role="dialog"], [data-no-sheet-drag]']
                ];
                for (const [name, label, expected] of playerActions) {
                    await interact(name, 'button[aria-label="' + label + '"]', expected);
                    await navigate("/");
                    await navigate("/player");
                }
            } else {
                extras["24-player"] = "fullscreen player unavailable with no selected track";
            }
        }
        const dock = document.querySelector(".lane-dock-glass");
        return JSON.stringify({login: "passed", ...diagnostic, homeOnly, routes: results, layout, checks, captures, extras,
            liquidGlassVisible: Array.from(document.querySelectorAll("button, [role=option]"))
                .some(node => node.textContent.trim() === "Liquid Glass"),
            theme: document.documentElement.dataset.colorTheme,
            dockFilter: dock ? getComputedStyle(dock).backdropFilter : null
        }, null, 2);
        """
        let homeOnly = ProcessInfo.processInfo.arguments.contains("--lane-home-only")
        webView?.callAsyncJavaScript(probe, arguments: ["email": email, "password": password, "homeOnly": homeOnly], in: nil, in: .page) { [weak self] result in
            if case .success(let value) = result, let report = value as? String {
                try? FileManager.default.removeItem(at: credentialsFile)
                self?.writeTestResult(report + "\n", named: "lane-account-ready")
            } else if case .failure = result {
                try? FileManager.default.removeItem(at: credentialsFile)
                self?.writeTestResult("{\"login\":\"simulator interaction failed\"}\n", named: "lane-account-ready")
            } else {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    self?.checkAccount(attempts: attempts - 1)
                }
            }
        }
    }
    #endif
}

#if targetEnvironment(simulator)
extension LaneBridgeViewController: WKScriptMessageHandlerWithReply {
    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        guard message.name == "laneQACapture", message.frameInfo.isMainFrame,
              let name = message.body as? String,
              name.range(of: "^[0-9]{2}-[a-z0-9-]{1,45}$", options: .regularExpression) != nil,
              let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else {
            replyHandler(false, nil)
            return
        }
        let ready = caches.appendingPathComponent("lane-qa-capture-ack")
        try? FileManager.default.removeItem(at: ready)
        writeTestResult(name, named: "lane-qa-capture")
        func waitForCapture(_ attempts: Int) {
            if let result = try? String(contentsOf: ready, encoding: .utf8), result == name {
                replyHandler(true, nil)
            } else if attempts > 0 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { waitForCapture(attempts - 1) }
            } else {
                replyHandler(false, nil)
            }
        }
        waitForCapture(name == "01-home" ? 450 : 100)
    }
}
#endif

@objc(LaneHttpPlugin)
final class LaneHttpPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "LaneHttpPlugin"
    let jsName = "LaneHttp"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise)
    ]

    private let cookieSession = URLSession(configuration: .ephemeral)
    private let anonymousSession: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil
        config.httpShouldSetCookies = false
        return URLSession(configuration: config)
    }()

    @objc func request(_ call: CAPPluginCall) {
        guard let rawURL = call.getString("url"), let url = URL(string: rawURL),
              url.scheme == "https", url.host != nil, url.user == nil, url.password == nil else {
            call.reject("Expected an HTTPS URL")
            return
        }
        let withCookies = call.getBool("withCookies") ?? false
        var request = URLRequest(url: url, timeoutInterval: 35)
        request.httpMethod = call.getString("method") ?? "GET"
        request.httpShouldHandleCookies = withCookies
        for (name, value) in call.getObject("headers") ?? [:] {
            if let value = value as? String {
                request.setValue(value, forHTTPHeaderField: name)
            }
        }
        if let body = call.getString("body") {
            guard let bytes = Data(base64Encoded: body) else {
                call.reject("Invalid request body")
                return
            }
            request.httpBody = bytes
        }
        let started = ProcessInfo.processInfo.systemUptime
        let session = withCookies ? cookieSession : anonymousSession
        session.dataTask(with: request) { data, response, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            guard let response = response as? HTTPURLResponse else {
                call.reject("No HTTP response")
                return
            }
            var headers: [String: String] = [:]
            for (name, value) in response.allHeaderFields {
                if let name = name as? String, let value = value as? String,
                   name.caseInsensitiveCompare("set-cookie") != .orderedSame {
                    headers[name.lowercased()] = value
                }
            }
            call.resolve([
                "status": response.statusCode,
                "url": response.url?.absoluteString ?? rawURL,
                "headers": headers,
                "body": (data ?? Data()).base64EncodedString(),
                "bodyMs": (ProcessInfo.processInfo.systemUptime - started) * 1000,
                "via": "urlsession"
            ])
        }.resume()
    }
}
