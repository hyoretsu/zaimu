#[cfg(any(target_os = "android", target_os = "ios"))]
use tauri::Manager;
use tauri::{plugin::{Builder, TauriPlugin}, Runtime};

#[cfg(any(target_os = "android", target_os = "ios"))]
struct Push<R: Runtime>(tauri::plugin::PluginHandle<R>);

#[tauri::command]
async fn register<R: Runtime>(app: tauri::AppHandle<R>, android: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        app.state::<Push<R>>().0.run_mobile_plugin("register", serde_json::json!({"android": android})).map_err(|error| error.to_string())
    }
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let _ = (app, android);
        Err("Push disponível no navegador e nos aplicativos Android/iOS.".into())
    }
}

#[tauri::command]
async fn pending<R: Runtime>(app: tauri::AppHandle<R>) -> Result<serde_json::Value, String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    { app.state::<Push<R>>().0.run_mobile_plugin("pending", serde_json::json!({})).map_err(|error| error.to_string()) }
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    { let _ = app; Ok(serde_json::json!({"url": null})) }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("push")
        .invoke_handler(tauri::generate_handler![register, pending])
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            let handle = api.register_android_plugin("com.hyolabs.zaimu.push", "PushPlugin")?;
            #[cfg(target_os = "ios")]
            let handle = api.register_ios_plugin(init_plugin_push)?;
            #[cfg(any(target_os = "android", target_os = "ios"))]
            app.manage(Push(handle));
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            let _ = (app, api);
            Ok(())
        })
        .build()
}

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_push);
