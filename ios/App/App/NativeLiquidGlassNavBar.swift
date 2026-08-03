import Combine
import SwiftUI

enum NativeLiquidNavTab: String, CaseIterable, Identifiable {
    case home
    case exercises
    case assessments
    case statistics

    var id: String { rawValue }
    var webSection: String { rawValue }

    init?(webSection: String) {
        self.init(rawValue: webSection)
    }

    var title: String {
        switch self {
        case .home: return "Home"
        case .exercises: return "Train"
        case .assessments: return "Tests"
        case .statistics: return "You"
        }
    }

    var symbolName: String {
        switch self {
        case .home: return "house"
        case .exercises: return "square.grid.2x2"
        case .assessments: return "doc.text"
        case .statistics: return "person"
        }
    }
}

final class NativeLiquidNavModel: ObservableObject {
    @Published var selected: NativeLiquidNavTab = .home
    /// Tabs currently wearing an attention dot. The web app owns this state and
    /// pushes it over the `cogniNav` bridge — see `syncNativeTabBadges()`.
    @Published var badgedTabs: Set<NativeLiquidNavTab> = []
    var onSelect: ((NativeLiquidNavTab) -> Void)?

    func select(_ tab: NativeLiquidNavTab) {
        guard selected != tab else { return }
        selected = tab
        onSelect?(tab)
    }

    func setBadge(_ tab: NativeLiquidNavTab, shown: Bool) {
        if shown { badgedTabs.insert(tab) } else { badgedTabs.remove(tab) }
    }
}

/// The attention dot on a tab. It breathes and throws off a halo so it reads as
/// "do this" rather than as a static ornament — the same language as the pulsing
/// IQ test card the tab leads to.
private struct NavBadgeDot: View {
    private static let tint = Color(red: 1.0, green: 0.23, blue: 0.19)
    private static let size: CGFloat = 8

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var haloExpanded = false
    @State private var breathing = false

    var body: some View {
        ZStack {
            if !reduceMotion {
                Circle()
                    .stroke(Self.tint, lineWidth: 1.5)
                    .frame(width: Self.size, height: Self.size)
                    .scaleEffect(haloExpanded ? 2.4 : 1)
                    .opacity(haloExpanded ? 0 : 0.8)
            }
            Circle()
                .fill(Self.tint)
                .frame(width: Self.size, height: Self.size)
                .overlay(Circle().stroke(Color.black.opacity(0.28), lineWidth: 1))
                .scaleEffect(breathing ? 1.16 : 1)
        }
        .onAppear {
            // Reduce Motion keeps the plain dot: still an unmissable marker, no movement.
            guard !reduceMotion else { return }
            // Non-autoreversing so the halo always travels outward, never sucks back in.
            withAnimation(.easeOut(duration: 1.7).repeatForever(autoreverses: false)) {
                haloExpanded = true
            }
            withAnimation(.easeInOut(duration: 0.85).repeatForever(autoreverses: true)) {
                breathing = true
            }
        }
    }
}

struct NativeLiquidGlassNavBar: View {
    @ObservedObject var model: NativeLiquidNavModel
    @Namespace private var selectionNamespace

    var body: some View {
        if #available(iOS 26.0, *) {
            GlassEffectContainer(spacing: 10) {
                navContent
                    .padding(6)
                    .glassEffect(.regular.interactive(), in: Capsule())
            }
        } else {
            navContent
                .padding(6)
                .background(.ultraThinMaterial, in: Capsule())
                .overlay(Capsule().stroke(.white.opacity(0.12), lineWidth: 1))
                .shadow(color: .black.opacity(0.32), radius: 18, x: 0, y: 10)
        }
    }

    private var navContent: some View {
        HStack(spacing: 6) {
            ForEach(NativeLiquidNavTab.allCases) { tab in
                Button {
                    model.select(tab)
                } label: {
                    VStack(spacing: 3) {
                        Image(systemName: tab.symbolName)
                            .font(.system(size: 20, weight: .semibold))
                            // Sits on the glyph's top-right the way a native tab
                            // badge does, and is drawn outside the dimmed
                            // foregroundStyle so it stays bright on an unselected tab.
                            .overlay(alignment: .topTrailing) {
                                if model.badgedTabs.contains(tab) {
                                    NavBadgeDot()
                                        .offset(x: 7, y: -2)
                                        .transition(.scale.combined(with: .opacity))
                                }
                            }
                        Text(tab.title)
                            .font(.system(size: 11.5, weight: .medium, design: .default))
                            .lineLimit(1)
                    }
                    .frame(width: 66, height: 66)
                    .foregroundStyle(model.selected == tab ? Color.white : Color.white.opacity(0.48))
                    .background {
                        if model.selected == tab {
                            Capsule()
                                .fill(Color.white.opacity(0.12))
                                .overlay(Capsule().stroke(Color.white.opacity(0.11), lineWidth: 1))
                                .matchedGeometryEffect(id: "nativeLiquidSelection", in: selectionNamespace)
                        }
                    }
                    .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(tab.title)
                .accessibilityValue(model.badgedTabs.contains(tab) ? "Not started yet" : "")
                .accessibilityAddTraits(model.selected == tab ? .isSelected : [])
            }
        }
        .fixedSize()
        .animation(.spring(response: 0.34, dampingFraction: 0.72), value: model.badgedTabs)
    }
}
