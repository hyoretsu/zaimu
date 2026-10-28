import Tauri
import UIKit
import WebKit
import ObjectiveC
import UserNotifications

final class PushPlugin: Plugin, UNUserNotificationCenterDelegate {
 private static var callbacksInstalled = false
 private var pendingInvoke: Invoke?
 private var pendingUrl: String?
 private var tokenObserver: NSObjectProtocol?
 private var failureObserver: NSObjectProtocol?
 @objc func pending(_ invoke: Invoke) { var result: [String: Any] = ["url": NSNull()]; if let url = pendingUrl { result["url"] = url }; invoke.resolve(result); pendingUrl = nil }
 override func load(webview: WKWebView) {
  installAPNsCallbacks()
  UNUserNotificationCenter.current().delegate = self
  tokenObserver = NotificationCenter.default.addObserver(forName: Notification.Name("zaimuPushToken"), object: nil, queue: .main) { [weak self] note in
   guard let self = self, let token = note.object as? String else { return }
   self.pendingInvoke?.resolve(["platform": "IOS", "address": token]); self.pendingInvoke = nil
   self.trigger("token", data: ["platform": "IOS", "address": token])
  }
  failureObserver = NotificationCenter.default.addObserver(forName: Notification.Name("zaimuPushFailure"), object: nil, queue: .main) { [weak self] _ in
   self?.pendingInvoke?.reject("Não foi possível registrar notificações."); self?.pendingInvoke = nil
  }
 }
 @objc func register(_ invoke: Invoke) {
  UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
   DispatchQueue.main.async {
    guard granted else { invoke.reject("Permissão de notificações não concedida."); return }
    self.pendingInvoke = invoke
    UIApplication.shared.registerForRemoteNotifications()
   }
  }
 }
 func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completion: @escaping (UNNotificationPresentationOptions) -> Void) { completion([.banner, .sound]) }
 func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completion: @escaping () -> Void) {
  if let url = response.notification.request.content.userInfo["url"] as? String { pendingUrl = url; trigger("open", data: ["url": url]) }
  completion()
 }
 private func installAPNsCallbacks() {
  guard !Self.callbacksInstalled else { return }; Self.callbacksInstalled = true
  guard let delegate = UIApplication.shared.delegate, let cls = object_getClass(delegate) else { return }
  let success = #selector(UIApplicationDelegate.application(_:didRegisterForRemoteNotificationsWithDeviceToken:))
  let originalSuccess = class_getInstanceMethod(cls, success).map { method_getImplementation($0) }
  let successBlock: @convention(block) (AnyObject, UIApplication, NSData) -> Void = { receiver, application, data in
   if let original = originalSuccess {
    typealias Callback = @convention(c) (AnyObject, Selector, UIApplication, NSData) -> Void
    unsafeBitCast(original, to: Callback.self)(receiver, success, application, data)
   }
   NotificationCenter.default.post(name: Notification.Name("zaimuPushToken"), object: (data as Data).map { String(format: "%02x", $0) }.joined())
  }
  class_replaceMethod(cls, success, imp_implementationWithBlock(successBlock), "v@:@@")
  let failure = #selector(UIApplicationDelegate.application(_:didFailToRegisterForRemoteNotificationsWithError:))
  let originalFailure = class_getInstanceMethod(cls, failure).map { method_getImplementation($0) }
  let failureBlock: @convention(block) (AnyObject, UIApplication, NSError) -> Void = { receiver, application, error in
   if let original = originalFailure {
    typealias Callback = @convention(c) (AnyObject, Selector, UIApplication, NSError) -> Void
    unsafeBitCast(original, to: Callback.self)(receiver, failure, application, error)
   }
   NotificationCenter.default.post(name: Notification.Name("zaimuPushFailure"), object: nil)
  }
  class_replaceMethod(cls, failure, imp_implementationWithBlock(failureBlock), "v@:@@")
 }
 deinit { if let observer = tokenObserver { NotificationCenter.default.removeObserver(observer) }; if let observer = failureObserver { NotificationCenter.default.removeObserver(observer) } }
}

@_cdecl("init_plugin_push")
func initPlugin() -> Plugin { PushPlugin() }
