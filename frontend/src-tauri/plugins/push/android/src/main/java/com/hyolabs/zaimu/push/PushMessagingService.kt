package com.hyolabs.zaimu.push

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class PushMessagingService: FirebaseMessagingService() {
 override fun onNewToken(token: String) { PushPlugin.instance?.refreshed(token) }
 override fun onMessageReceived(message: RemoteMessage) {
  val title = message.notification?.title ?: return
  val url = message.data["url"] ?: return
  if(Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
  val manager = getSystemService(NotificationManager::class.java)
  if(Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(NotificationChannel("transfers", "Transferências de contas", NotificationManager.IMPORTANCE_DEFAULT))
  val intent = packageManager.getLaunchIntentForPackage(packageName) ?: return
  intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP).putExtra("zaimu_url", url)
  val pending = PendingIntent.getActivity(this, url.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  val notification = NotificationCompat.Builder(this, "transfers").setSmallIcon(applicationInfo.icon).setContentTitle(title).setContentText(message.notification?.body).setContentIntent(pending).setAutoCancel(true).build()
  NotificationManagerCompat.from(this).notify((message.data["tag"] ?: url).hashCode(), notification)
 }
}
