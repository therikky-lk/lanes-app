import AVFoundation
import Capacitor
import Foundation
import WebKit

final class LaneBridgeViewController: CAPBridgeViewController {
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
        // Use the bundled CSS and real lens generator, against a repeatable
        // backdrop. No account, live requests, or credentials are needed.
        let probe = """
        if (!document.querySelector("#root button, #root a, #root input")) return null;
        const root = document.documentElement;
        root.classList.add("lane-mobile");
        root.dataset.colorTheme = "liquid-glass";
        const stage = document.createElement("section");
        stage.style.cssText = "position:fixed;z-index:2147483647;inset:env(safe-area-inset-top) 0 env(safe-area-inset-bottom);padding:22px 12px;color:white;background:#141414;font:15px system-ui";
        const background = "repeating-linear-gradient(0deg, #121212 0 4px, #ededed 4px 8px)";
        stage.innerHTML = '<h1 style="font-size:22px;margin:0 0 12px">Lane • Liquid Glass</h1>' +
          '<p style="margin:0 0 24px">iPhone Simulator · bundled app styles</p>' +
          '<div style="display:flex;gap:8px">' +
          '<div style="flex:1;min-width:0"><p>App effect</p><div data-lane-swatch style="height:224px;padding:12px;background:' + background + '"><div data-liquid-glass="field" style="height:200px;border-radius:24px"></div></div></div>' +
          '<div style="flex:1;min-width:0"><p>Blur disabled</p><div data-lane-swatch style="height:224px;padding:12px;background:' + background + '"><div data-liquid-glass="field" style="height:200px;border-radius:24px;backdrop-filter:none!important;-webkit-backdrop-filter:none!important"></div></div></div>' +
          '</div>';
        document.body.appendChild(stage);
        const [glass, control] = stage.querySelectorAll("[data-liquid-glass]");
        const svgSupport = CSS.supports("backdrop-filter", 'url("#lane-glass-lens")');
        if (svgSupport) {
            for (let i = 0; i < 20 && !glass.style.getPropertyValue("--lane-glass-filter"); i++) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }
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
            svgSupport,
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
    #endif
}

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
