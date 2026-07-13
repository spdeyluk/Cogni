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
    var onSelect: ((NativeLiquidNavTab) -> Void)?

    func select(_ tab: NativeLiquidNavTab) {
        guard selected != tab else { return }
        selected = tab
        onSelect?(tab)
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
                .accessibilityAddTraits(model.selected == tab ? .isSelected : [])
            }
        }
        .fixedSize()
    }
}
