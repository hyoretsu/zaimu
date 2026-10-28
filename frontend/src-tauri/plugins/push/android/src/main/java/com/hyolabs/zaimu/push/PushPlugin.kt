package com.hyolabs.zaimu.push

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.os.Build
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import app.tauri.plugin.PermissionState
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging

@InvokeArg
class AndroidConfig { lateinit var appId: String; lateinit var apiKey: String; lateinit var projectId: String; lateinit var senderId: String }
@InvokeArg
class RegisterArgs { var android: AndroidConfig? = null }

@TauriPlugin(permissions = [Permission(alias = "notifications", strings = [Manifest.permission.POST_NOTIFICATIONS])])
class PushPlugin(private val host: Activity): Plugin(host) {
 companion object { var instance: PushPlugin? = null }
 private var pendingUrl: String? = null
 @Command fun pending(invoke: Invoke) { invoke.resolve(JSObject().put("url", pendingUrl)); pendingUrl = null }
 override fun load(webView: android.webkit.WebView) { instance = this; open(host.intent) }
 @Command
 fun register(invoke: Invoke) {
  if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
   requestPermissionForAlias("notifications", invoke, "permissionResult")
  } else token(invoke)
 }
 @PermissionCallback
 private fun permissionResult(invoke: Invoke) {
  if (getPermissionState("notifications") == PermissionState.GRANTED) token(invoke)
  else invoke.reject("Permissão de notificações não concedida.")
 }
 private fun token(invoke: Invoke) {
  try {
   if (FirebaseApp.getApps(host).isEmpty()) {
    val config = invoke.parseArgs(RegisterArgs::class.java).android
    if(config == null) { invoke.reject("FCM não configurado."); return }
    host.getSharedPreferences("zaimu_push", 0).edit().putString("appId",config.appId).putString("apiKey",config.apiKey).putString("projectId",config.projectId).putString("senderId",config.senderId).apply()
    FirebaseApp.initializeApp(host, FirebaseOptions.Builder().setApplicationId(config.appId).setApiKey(config.apiKey).setProjectId(config.projectId).setGcmSenderId(config.senderId).build())
   }
   FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
    if(task.isSuccessful) invoke.resolve(JSObject().put("platform", "ANDROID").put("address", task.result))
    else invoke.reject("Não foi possível registrar notificações.")
   }
  } catch (_: Exception) { invoke.reject("Não foi possível configurar notificações.") }
 }
 fun refreshed(token: String) { trigger("token", JSObject().put("platform", "ANDROID").put("address", token)) }
 override fun onNewIntent(intent: Intent) { open(intent) }
 private fun open(intent: Intent?) {
  val url = intent?.getStringExtra("zaimu_url") ?: intent?.getStringExtra("url") ?: return
  pendingUrl = url
  trigger("open", JSObject().put("url", url))
 }
}
