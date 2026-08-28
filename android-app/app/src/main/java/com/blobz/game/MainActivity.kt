package com.blobz.game

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var overlay: LinearLayout
    private lateinit var statusText: TextView
    private val handler = Handler(Looper.getMainLooper())
    private var nsdManager: NsdManager? = null
    private var gameServer: GameServer? = null
    private val SERVER_PORT = 3000
    private var pageReady = false
    private var pendingConnect: String? = null
    private var joined = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        hideSystemUi()

        val root = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )

        // WebView loads the bundled client. The app drives it: host starts an
        // in-app server and connects to localhost; joiners connect to a discovered
        // LAN host. No terminal, no PC, no internet required.
        webView = WebView(this)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            builtInZoomControls = false
            displayZoomControls = false
        }
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: android.webkit.WebView?, url: String?) {
                pageReady = true
                pendingConnect?.let {
                    val url2 = it
                    pendingConnect = null
                    connectWebView(url2)
                }
            }
        }
        webView.setBackgroundColor(0xff16213e.toInt())
        webView.loadUrl("file:///android_asset/index.html")

        overlay = buildOverlay()

        val frame = android.widget.FrameLayout(this)
        frame.addView(webView, root)
        frame.addView(overlay, root)
        setContentView(frame)

        nsdManager = getSystemService(Context.NSD_SERVICE) as NsdManager
    }

    private fun hideSystemUi() {
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        )
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemUi()
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    private fun buildOverlay(): LinearLayout {
        val ctx = this
        val layout = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(0xCC0b1020.toInt())
            setPadding(40, 40, 40, 40)
        }
        val title = TextView(ctx).apply {
            text = "Blobz.io"
            textSize = 34f
            setTextColor(0xffffffff.toInt())
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 24)
        }
        statusText = TextView(ctx).apply {
            text = "Play on the same WiFi. One phone hosts, others join automatically."
            textSize = 14f
            setTextColor(0xffc9c9d6.toInt())
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 24)
        }
        val hostBtn = Button(ctx).apply {
            text = "Host LAN Game"
            setOnClickListener { startHost() }
            setPadding(20, 16, 20, 16)
            setAllCaps(false)
        }
        val joinBtn = Button(ctx).apply {
            text = "Join LAN Game"
            setOnClickListener { startJoin() }
            setPadding(20, 16, 20, 16)
            setAllCaps(false)
        }
        val soloBtn = Button(ctx).apply {
            text = "Solo / Offline"
            setOnClickListener { overlay.visibility = View.GONE }
            setPadding(20, 16, 20, 16)
            setAllCaps(false)
        }
        layout.addView(title)
        layout.addView(statusText)
        layout.addView(hostBtn)
        layout.addView(joinBtn)
        layout.addView(soloBtn)
        return layout
    }

    private fun setStatus(text: String) {
        handler.post { statusText.text = text }
    }

    private fun showOverlay() {
        handler.post { overlay.visibility = View.VISIBLE }
    }

    private fun hideOverlay() {
        handler.post { overlay.visibility = View.GONE }
    }

    // ---------------- Host ----------------
    private fun startHost() {
        joined = true
        setStatus("Starting game on this device…")
        try {
            gameServer = GameServer(SERVER_PORT)
            gameServer?.start()
        } catch (e: Exception) {
            setStatus("Could not start host: ${e.message}")
            return
        }
        registerService()
        // Give the in-app server a moment to bind, then connect our own WebView.
        handler.postDelayed({
            connectWebView("ws://127.0.0.1:$SERVER_PORT")
            hideOverlay()
        }, 700)
    }

    private fun registerService() {
        try {
            val info = NsdServiceInfo().apply {
                serviceName = "Blobz"
                serviceType = "_blobz._tcp."
                port = SERVER_PORT
            }
            nsdManager?.registerService(info, NsdManager.PROTOCOL_DNS_SD, registrationListener)
        } catch (e: Exception) {
            Log.w("Blobz", "NSD register failed: ${e.message}")
        }
    }

    private val registrationListener = object : NsdManager.RegistrationListener {
        override fun onServiceRegistered(serviceInfo: NsdServiceInfo) {
            setStatus("Hosting — friends on this WiFi can join!")
        }
        override fun onRegistrationFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
            Log.w("Blobz", "register failed $errorCode")
        }
        override fun onServiceUnregistered(serviceInfo: NsdServiceInfo) {}
        override fun onUnregistrationFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {}
    }

    // ---------------- Join ----------------
    private fun startJoin() {
        setStatus("Scanning for a LAN game…")
        try {
            nsdManager?.discoverServices("_blobz._tcp.", NsdManager.PROTOCOL_DNS_SD, discoveryListener)
        } catch (e: Exception) {
            setStatus("Could not scan: ${e.message}")
        }
    }

    private val resolveListener = object : NsdManager.ResolveListener {
        override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
            Log.w("Blobz", "resolve failed $errorCode")
        }
        override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
            if (joined) return
            joined = true
            val host = serviceInfo.host ?: return
            val url = "ws://${host.hostAddress}:${serviceInfo.port}"
            Log.i("Blobz", "LAN server found: $url")
            connectWebView(url)
            hideOverlay()
        }
    }

    private val discoveryListener = object : NsdManager.DiscoveryListener {
        override fun onDiscoveryStarted(regType: String) {}
        override fun onDiscoveryStopped(serviceType: String) {}
        override fun onServiceFound(service: NsdServiceInfo) {
            if (service.serviceType?.contains("blobz") == true) {
                nsdManager?.resolveService(service, resolveListener)
            }
        }
        override fun onServiceLost(service: NsdServiceInfo) {}
        override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
            setStatus("Scan failed. Try Host on one device.")
        }
        override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}
    }

    private fun connectWebView(url: String) {
        val js = "window.blobzConnect && window.blobzConnect('$url');"
        if (pageReady) {
            webView.evaluateJavascript(js, null)
        } else {
            pendingConnect = url
        }
    }

    override fun onDestroy() {
        try {
            nsdManager?.stopServiceDiscovery(discoveryListener)
        } catch (_: Exception) {}
        try {
            nsdManager?.unregisterService(registrationListener)
        } catch (_: Exception) {}
        gameServer?.shutdown()
        super.onDestroy()
    }
}
