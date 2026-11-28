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
    }
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
