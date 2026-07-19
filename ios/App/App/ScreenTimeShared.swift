import Foundation
import FamilyControls
import ManagedSettings

/// Shared between the main app and the MindcareShieldMonitor extension via the app group.
enum MindcareScreenTime {
    static let appGroupId = "group.com.spidey.cogni"
    static let selectionKey = "mindcare.screenTime.selection.v1"
    static let unlockUntilKey = "mindcare.screenTime.unlockUntil.v1"
    static let shieldActiveKey = "mindcare.screenTime.shieldActive.v1"

    static var defaults: UserDefaults? {
        UserDefaults(suiteName: appGroupId)
    }

    @available(iOS 16.0, *)
    static var shieldStore: ManagedSettingsStore {
        ManagedSettingsStore(named: ManagedSettingsStore.Name("mindcare.shield"))
    }

    @available(iOS 16.0, *)
    static func loadSelection() -> FamilyActivitySelection {
        guard let data = defaults?.data(forKey: selectionKey),
              let selection = try? JSONDecoder().decode(FamilyActivitySelection.self, from: data)
        else { return FamilyActivitySelection() }
        return selection
    }

    @available(iOS 16.0, *)
    static func saveSelection(_ selection: FamilyActivitySelection) {
        guard let data = try? JSONEncoder().encode(selection) else { return }
        defaults?.set(data, forKey: selectionKey)
    }

    @available(iOS 16.0, *)
    static func selectionCount(_ selection: FamilyActivitySelection) -> Int {
        selection.applicationTokens.count + selection.categoryTokens.count + selection.webDomainTokens.count
    }

    /// Applies (or clears, if the selection is empty) the shield and marks any unlock as over.
    @available(iOS 16.0, *)
    static func applyShield() {
        let selection = loadSelection()
        let store = shieldStore
        if selectionCount(selection) > 0 {
            store.shield.applications = selection.applicationTokens.isEmpty ? nil : selection.applicationTokens
            store.shield.applicationCategories = selection.categoryTokens.isEmpty
                ? nil
                : .specific(selection.categoryTokens)
            store.shield.webDomains = selection.webDomainTokens.isEmpty ? nil : selection.webDomainTokens
            defaults?.set(true, forKey: shieldActiveKey)
        } else {
            store.clearAllSettings()
            defaults?.set(false, forKey: shieldActiveKey)
        }
        defaults?.set(0.0, forKey: unlockUntilKey)
    }

    @available(iOS 16.0, *)
    static func clearShield(until: Date) {
        shieldStore.clearAllSettings()
        defaults?.set(false, forKey: shieldActiveKey)
        defaults?.set(until.timeIntervalSince1970, forKey: unlockUntilKey)
    }
}
