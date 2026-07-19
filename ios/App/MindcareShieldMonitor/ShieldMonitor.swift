import DeviceActivity
import ManagedSettings

/// Runs in the background when a purchased unlock window ends and puts the shields back up,
/// even if Mindcare itself is closed.
final class ShieldMonitor: DeviceActivityMonitor {
    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)
        MindcareScreenTime.applyShield()
    }
}
