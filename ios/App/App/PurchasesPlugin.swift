import Capacitor
import Foundation
import StoreKit

// Cogni · In-App Purchase bridge (StoreKit 2)
// ---------------------------------------------------------------------------
// Apple requires IAP for anything that unlocks features inside the app, so the
// native build cannot use the Stripe flow the web uses. This exposes the four
// calls the paywall needs: read the products (for localized prices), buy one,
// restore, and report what the user currently owns.
//
// The signed transaction (JWS) is handed back to the web layer, which posts it
// to the verify-apple-purchase Edge Function. That function — not this file —
// decides what the user is entitled to, so a jailbroken client can't grant
// itself Pro by lying to JavaScript.
//
// Product ids must match App Store Connect exactly.
@objc(PurchasesPlugin)
public class PurchasesPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PurchasesPlugin"
    public let jsName = "Purchases"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getEntitlement", returnType: CAPPluginReturnPromise)
    ]

    static let productIds = [
        "com.spidey.cogni.pro.yearly",
        "com.spidey.cogni.pro.weekly"
    ]

    // Keeps entitlement fresh when a renewal or refund lands while the app runs.
    private var updatesTask: Task<Void, Never>?

    override public func load() {
        guard #available(iOS 15.0, *) else { return }
        updatesTask = Task.detached { [weak self] in
            for await update in Transaction.updates {
                guard case .verified(let transaction) = update else { continue }
                await transaction.finish()
                self?.notifyListeners("entitlementChanged", data: [
                    "productId": transaction.productID
                ])
            }
        }
    }

    deinit { updatesTask?.cancel() }

    // MARK: - Products

    @objc func getProducts(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else {
            call.resolve(["available": false, "products": []])
            return
        }
        Task {
            do {
                let products = try await Product.products(for: Self.productIds)
                call.resolve([
                    "available": true,
                    "products": products.map(Self.describe)
                ])
            } catch {
                call.resolve([
                    "available": false,
                    "products": [],
                    "error": error.localizedDescription
                ])
            }
        }
    }

    // Everything the paywall needs to render a price without hardcoding one.
    // displayPrice is already localized to the user's storefront.
    @available(iOS 15.0, *)
    private static func describe(_ product: Product) -> [String: Any] {
        var info: [String: Any] = [
            "id": product.id,
            "displayName": product.displayName,
            "displayPrice": product.displayPrice,
            "price": NSDecimalNumber(decimal: product.price).doubleValue,
            "currencyCode": product.priceFormatStyle.currencyCode
        ]
        if let period = product.subscription?.subscriptionPeriod {
            info["periodUnit"] = String(describing: period.unit).lowercased()
            info["periodValue"] = period.value
        }
        // An introductory offer is what makes a "free trial" claim truthful.
        if let intro = product.subscription?.introductoryOffer {
            info["introDisplayPrice"] = intro.displayPrice
            info["introPeriodUnit"] = String(describing: intro.period.unit).lowercased()
            info["introPeriodValue"] = intro.period.value
            info["introIsFreeTrial"] = intro.paymentMode == .freeTrial
        }
        return info
    }

    // MARK: - Purchase

    @objc func purchase(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else {
            call.reject("In-app purchase requires iOS 15 or later.")
            return
        }
        guard let productId = call.getString("productId") else {
            call.reject("productId is required")
            return
        }
        Task {
            do {
                let products = try await Product.products(for: [productId])
                guard let product = products.first else {
                    call.reject("Unknown product: \(productId)")
                    return
                }
                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    guard case .verified(let transaction) = verification else {
                        // StoreKit itself couldn't vouch for this receipt.
                        call.reject("Could not verify the purchase.")
                        return
                    }
                    await transaction.finish()
                    call.resolve([
                        "status": "purchased",
                        "productId": transaction.productID,
                        // The server re-verifies this; the client is never trusted.
                        "jws": verification.jwsRepresentation,
                        "originalTransactionId": String(transaction.originalID)
                    ])
                case .userCancelled:
                    call.resolve(["status": "cancelled"])
                case .pending:
                    // Ask-to-Buy and similar: entitlement arrives later via
                    // Transaction.updates and the server notification.
                    call.resolve(["status": "pending"])
                @unknown default:
                    call.resolve(["status": "unknown"])
                }
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    // MARK: - Restore

    // Apple requires a restore path for subscriptions at review.
    @objc func restore(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else {
            call.reject("In-app purchase requires iOS 15 or later.")
            return
        }
        Task {
            do {
                try await AppStore.sync()
                let entitlement = await Self.currentEntitlement()
                call.resolve(entitlement)
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func getEntitlement(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else {
            call.resolve(["active": false])
            return
        }
        Task { call.resolve(await Self.currentEntitlement()) }
    }

    // The newest still-valid subscription among our products, with its JWS so
    // the server can confirm it independently.
    @available(iOS 15.0, *)
    private static func currentEntitlement() async -> [String: Any] {
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result,
                  productIds.contains(transaction.productID) else { continue }
            if let revoked = transaction.revocationDate, revoked <= Date() { continue }
            if let expires = transaction.expirationDate, expires <= Date() { continue }
            return [
                "active": true,
                "productId": transaction.productID,
                "originalTransactionId": String(transaction.originalID),
                "expiresAt": transaction.expirationDate?.timeIntervalSince1970 ?? 0,
                "jws": result.jwsRepresentation
            ]
        }
        return ["active": false]
    }
}
