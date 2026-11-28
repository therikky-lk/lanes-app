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
        }
        #endif
    }

    #if targetEnvironment(simulator)
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
            if case .success(let value) = result, (value as? Bool) == true,
               let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first {
                try? FileManager.default.createDirectory(at: caches, withIntermediateDirectories: true)
                try? Data("Lane renderer and WebKit audio ready\n".utf8)
                    .write(to: caches.appendingPathComponent("lane-smoke-ready"), options: .atomic)
            } else {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    self?.checkRenderer(attempts: attempts - 1)
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
    let pluginMethods = [CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise)]

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
