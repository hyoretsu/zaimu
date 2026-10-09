"""Local GTK WebView diagnostic. Does not certify Tauri or mobile platforms."""
import argparse
import json
import time
from pathlib import Path

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("WebKit2", "4.1")
from gi.repository import GLib, Gtk, WebKit2

parser = argparse.ArgumentParser()
parser.add_argument("--output", default="/tmp/zaimu-native-webkit.json")
args = parser.parse_args()
origin = "http://127.0.0.1:5173"
routes = ["/", "/accounts", "/credit-cards", "/transactions", "/debts", "/recurring", "/loans", "/settings"]
context = WebKit2.WebContext.new_ephemeral()
# All non-loopback traffic goes to an unavailable local proxy, including subresources.
context.get_website_data_manager().set_network_proxy_settings(
    WebKit2.NetworkProxyMode.CUSTOM,
    WebKit2.NetworkProxySettings.new("http://127.0.0.1:9", ["127.0.0.1", "localhost"]),
)
manager = WebKit2.UserContentManager()
script = r"""
localStorage.setItem('zaimu-auth',JSON.stringify({state:{guestId:'guest_native_performance',isGuestMode:true},version:0}));
const NativeDate=Date;
globalThis.Date=new Proxy(NativeDate,{construct(target,args){return args.length?Reflect.construct(target,args):new NativeDate('2026-10-04T15:00:00Z')},get(target,key){return key==='now'?()=>NativeDate.parse('2026-10-04T15:00:00Z'):Reflect.get(target,key)}});
const nativeFetch=globalThis.fetch;
globalThis.fetch=(input,options)=>{
 const url=new URL(input instanceof Request?input.url:String(input),location.href);
 if(url.origin==='https://ipapi.co')return Promise.resolve(new Response(JSON.stringify({country_code:'BR'}),{headers:{'content-type':'application/json'}}));
 if(!['http://127.0.0.1:5173','http://127.0.0.1:3335'].includes(url.origin))return Promise.reject(new Error('External network refused'));
 return nativeFetch(input,options);
};
globalThis.WebSocket=class {constructor(){throw new Error('WebSocket disabled in offline diagnostic')}};
window.nativePerf={usableAt:0,longTasksSupported:typeof PerformanceObserver!=='undefined'&&PerformanceObserver.supportedEntryTypes.includes('longtask')};
new MutationObserver(()=>{
 if(!window.nativePerf.usableAt&&document.querySelector('main h1')&&!document.querySelector('main .animate-pulse'))
 requestAnimationFrame(()=>requestAnimationFrame(()=>{
  if(!document.querySelector('main .animate-pulse'))window.nativePerf.usableAt ||= performance.now();
 }));
}).observe(document,{childList:true,subtree:true,attributes:true});
"""
manager.add_script(WebKit2.UserScript.new(script, WebKit2.UserContentInjectedFrames.TOP_FRAME, WebKit2.UserScriptInjectionTime.START, None, None))
view = WebKit2.WebView(web_context=context, user_content_manager=manager)
window = Gtk.Window()
window.set_default_size(1280, 900)
window.add(view)
window.connect("destroy", Gtk.main_quit)
samples = []
position = 0
started = time.monotonic()
pending = False


def finish():
    report = {
        "diagnostic": True,
        "globalAcceptance": False,
        "platform": "GTK WebKit2",
        "engine": f"{WebKit2.get_major_version()}.{WebKit2.get_minor_version()}.{WebKit2.get_micro_version()}",
        "fixture": {"owner": "guest_native_performance", "historySize": 0},
        "samples": samples,
        "pending": ["Tauri bridge/startup", "deep links/background", "Android", "iOS", "10k/100k history", "required long task metric"],
    }
    Path(args.output).write_text(json.dumps(report, indent=2) + "\n")
    window.destroy()


def navigate():
    global started
    started = time.monotonic()
    view.load_uri(origin + routes[position])


def receive(webview, result, _):
    global pending, position
    pending = False
    try:
        value = json.loads(webview.evaluate_javascript_finish(result).to_string())
    except Exception:
        value = {}
    ready = value.get("usableAt", 0) > 0 and value.get("path") == routes[position]
    timeout = time.monotonic() - started > 60
    if ready or timeout:
        samples.append({"route": routes[position], **value, "error": "timeout" if timeout and not ready else None})
        position += 1
        if position == len(routes):
            finish()
        else:
            navigate()


def poll():
    global pending
    if position == len(routes):
        return False
    if not pending:
        pending = True
        view.evaluate_javascript("JSON.stringify({...window.nativePerf,path:location.pathname,heading:document.querySelector('main h1')?.textContent ?? null})", -1, None, None, None, receive, None)
    return True


window.show_all()
navigate()
GLib.timeout_add(100, poll)
Gtk.main()
raise SystemExit(0 if all(not row["error"] and row["usableAt"] < 1000 for row in samples) else 1)
