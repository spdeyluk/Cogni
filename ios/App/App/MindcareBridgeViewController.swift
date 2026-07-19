import Capacitor
import SwiftUI
import UIKit
import WebKit

final class MindcareBridgeViewController: CAPBridgeViewController, WKScriptMessageHandler {
    private let nativeNavModel = NativeLiquidNavModel()
    private var nativeNavHost: UIHostingController<NativeLiquidGlassNavBar>?
    private var didInstallNativeNav = false
    private var didInstallMessageHandler = false

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(ScreenTimePlugin())
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        nativeNavModel.onSelect = { [weak self] tab in
            self?.selectWebTab(tab)
        }
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        installNativeNavigationWhenReady()
    }

    deinit {
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "cogniNav")
    }

    private func installNativeNavigationWhenReady() {
        guard let webView else {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in
                self?.installNativeNavigationWhenReady()
            }
            return
        }

        if !didInstallMessageHandler {
            didInstallMessageHandler = true
            webView.configuration.userContentController.add(self, name: "cogniNav")
            webView.configuration.userContentController.addUserScript(
                WKUserScript(source: nativeNavInstallScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
            )
            let installScript = nativeNavInstallScript
            webView.evaluateJavaScript(installScript)
        }

        guard !didInstallNativeNav else { return }
        didInstallNativeNav = true

        let host = UIHostingController(rootView: NativeLiquidGlassNavBar(model: nativeNavModel))
        host.overrideUserInterfaceStyle = .dark
        host.view.backgroundColor = .clear
        host.view.translatesAutoresizingMaskIntoConstraints = false
        host.view.isOpaque = false

        addChild(host)
        view.addSubview(host.view)
        NSLayoutConstraint.activate([
            host.view.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: 9),
            host.view.widthAnchor.constraint(lessThanOrEqualTo: view.widthAnchor, constant: -28),
            host.view.heightAnchor.constraint(equalToConstant: 96)
        ])
        host.didMove(toParent: self)
        nativeNavHost = host
    }

    private func selectWebTab(_ tab: NativeLiquidNavTab) {
        let script = "window.MindcareNativeNav && window.MindcareNativeNav.selectTab('\(tab.webSection)');"
        webView?.evaluateJavaScript(script)
    }

    private var nativeNavInstallScript: String {
        """
        document.documentElement.classList.add('native-liquid-nav');
        if (!document.getElementById('mindcare-native-liquid-nav-style')) {
          const style = document.createElement('style');
          style.id = 'mindcare-native-liquid-nav-style';
          style.textContent = `
            .app-sidebar {
              display: none !important;
              pointer-events: none !important;
            }
            .app-content {
              padding-bottom: calc(130px + env(safe-area-inset-bottom)) !important;
            }
          `;
          document.head.appendChild(style);
        }
        window.dispatchEvent(new CustomEvent('mindcare-native-nav-ready'));
        """
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "cogniNav",
              let payload = message.body as? [String: Any],
              let type = payload["type"] as? String
        else { return }

        if type == "tab",
           let tabName = payload["tab"] as? String,
           let tab = NativeLiquidNavTab(webSection: tabName) {
            nativeNavModel.selected = tab
        }

        if type == "chrome",
           let hidden = payload["hidden"] as? Bool {
            nativeNavHost?.view.isHidden = hidden
        }
    }
}
