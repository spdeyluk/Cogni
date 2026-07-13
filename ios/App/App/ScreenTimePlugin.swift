import Capacitor
import DeviceActivity
import FamilyControls
import SwiftUI
import UIKit

@objc(ScreenTimePlugin)
public class ScreenTimePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ScreenTimePlugin"
    public let jsName = "ScreenTime"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "presentAppPicker", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unlock", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "lockNow", returnType: CAPPluginReturnPromise)
    ]

    private static let unlockActivity = DeviceActivityName("cogni.unlock")

    @objc func getStatus(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else {
            call.resolve([
                "available": false,
                "authorized": false,
                "selectionCount": 0,
                "shieldActive": false,
                "unlockUntil": 0
            ])
            return
        }
        let defaults = CogniScreenTime.defaults
        var unlockUntil = defaults?.double(forKey: CogniScreenTime.unlockUntilKey) ?? 0
        if unlockUntil > 0, unlockUntil <= Date().timeIntervalSince1970 {
            // The unlock expired while nothing was watching; re-shield now.
            DeviceActivityCenter().stopMonitoring([Self.unlockActivity])
            CogniScreenTime.applyShield()
            unlockUntil = 0
        }
        let selection = CogniScreenTime.loadSelection()
        call.resolve([
            "available": true,
            "authorized": AuthorizationCenter.shared.authorizationStatus == .approved,
            "selectionCount": CogniScreenTime.selectionCount(selection),
            "shieldActive": defaults?.bool(forKey: CogniScreenTime.shieldActiveKey) ?? false,
            "unlockUntil": unlockUntil * 1000
        ])
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else {
            call.resolve(["authorized": false, "available": false])
            return
        }
        Task {
            do {
                try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
                call.resolve(["authorized": true])
            } catch {
                call.resolve(["authorized": false])
            }
        }
    }

    @objc func presentAppPicker(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else {
            call.reject("Screen Time requires iOS 16 or later.")
            return
        }
        DispatchQueue.main.async { [weak self] in
            guard let presenter = self?.bridge?.viewController else {
                call.reject("No view controller available to present the picker.")
                return
            }
            let current = CogniScreenTime.loadSelection()
            var host: UIViewController?
            let picker = ScreenTimePickerView(selection: current) { result in
                host?.dismiss(animated: true)
                guard let result else {
                    call.resolve([
                        "selectionCount": CogniScreenTime.selectionCount(current),
                        "cancelled": true
                    ])
                    return
                }
                CogniScreenTime.saveSelection(result)
                // A changed selection ends any active unlock and shields immediately.
                DeviceActivityCenter().stopMonitoring([Self.unlockActivity])
                CogniScreenTime.applyShield()
                call.resolve(["selectionCount": CogniScreenTime.selectionCount(result)])
            }
            let controller = UIHostingController(rootView: picker)
            controller.overrideUserInterfaceStyle = .dark
            host = controller
            presenter.present(controller, animated: true)
        }
    }

    @objc func unlock(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else {
            call.reject("Screen Time requires iOS 16 or later.")
            return
        }
        // DeviceActivity schedules must span at least 15 minutes.
        let minutes = min(720, max(15, call.getInt("minutes") ?? 0))
        let now = Date()
        let end = now.addingTimeInterval(TimeInterval(minutes) * 60)
        let center = DeviceActivityCenter()
        center.stopMonitoring([Self.unlockActivity])
        let units: Set<Calendar.Component> = [.year, .month, .day, .hour, .minute, .second]
        let schedule = DeviceActivitySchedule(
            intervalStart: Calendar.current.dateComponents(units, from: now),
            intervalEnd: Calendar.current.dateComponents(units, from: end),
            repeats: false
        )
        do {
            try center.startMonitoring(Self.unlockActivity, during: schedule)
        } catch {
            call.reject("Could not schedule the re-lock timer: \(error.localizedDescription)")
            return
        }
        CogniScreenTime.clearShield(until: end)
        call.resolve(["unlockUntil": end.timeIntervalSince1970 * 1000])
    }

    @objc func lockNow(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else {
            call.reject("Screen Time requires iOS 16 or later.")
            return
        }
        DeviceActivityCenter().stopMonitoring([Self.unlockActivity])
        CogniScreenTime.applyShield()
        call.resolve([
            "shieldActive": CogniScreenTime.selectionCount(CogniScreenTime.loadSelection()) > 0
        ])
    }
}

@available(iOS 16.0, *)
private struct ScreenTimePickerView: View {
    @State var selection: FamilyActivitySelection
    let onDone: (FamilyActivitySelection?) -> Void

    var body: some View {
        NavigationView {
            FamilyActivityPicker(selection: $selection)
                .navigationTitle("Blocked apps")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { onDone(nil) }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { onDone(selection) }
                    }
                }
        }
        .preferredColorScheme(.dark)
    }
}
