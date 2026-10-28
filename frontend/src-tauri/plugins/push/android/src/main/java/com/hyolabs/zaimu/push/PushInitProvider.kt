package com.hyolabs.zaimu.push

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.net.Uri
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions

class PushInitProvider: ContentProvider() {
 override fun onCreate(): Boolean {
  val app = context ?: return false
  val prefs = app.getSharedPreferences("zaimu_push", 0)
  val appId = prefs.getString("appId", null) ?: return true
  if(FirebaseApp.getApps(app).isEmpty()) {
   FirebaseApp.initializeApp(app, FirebaseOptions.Builder().setApplicationId(appId).setApiKey(prefs.getString("apiKey", "")!!).setProjectId(prefs.getString("projectId", "")!!).setGcmSenderId(prefs.getString("senderId", "")!!).build())
  }
  return true
 }
 override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor? = null
 override fun getType(uri: Uri): String? = null
 override fun insert(uri: Uri, values: ContentValues?): Uri? = null
 override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0
 override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int = 0
}
