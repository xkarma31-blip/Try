package com.blobz.game

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.wifi.p2p.WifiP2pConfig
import android.net.wifi.p2p.WifiP2pDevice
import android.net.wifi.p2p.WifiP2pDeviceList
import android.net.wifi.p2p.WifiP2pManager
import android.net.nsd.NsdManager
import android.Manifest
import android.net.nsd.NsdServiceInfo
import android.os.Build
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
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var overlay: LinearLayout
    private lateinit var statusText: TextView
    private lateinit var mainButtons: LinearLayout
    private lateinit var roomsPanel: LinearLayout
    private lateinit var roomsContainer: LinearLayout

    private val handler = Handler(Looper.getMainLooper())
    private var nsdManager: NsdManager? = null
    private var gameServer: GameServer? = null
    private val SERVER_PORT = 3000

    private var wifiP2pManager: WifiP2pManager? = null
    private var p2pChannel: WifiP2pManager.Channel? = null
    private var p2pReceiver: BroadcastReceiver? = null

    private val rooms = LinkedHashMap<String, RoomInfo>()
    private data class RoomInfo(val name: String, val host: String, val port: Int, val players: Int)
    private var pageReady = false
    private var pendingConnect: String? = null
    private var wifiDirectJoinPending = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        hideSystemUi()

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

        val root = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        overlay = buildOverlay()

        val frame = FrameLayout(this)
        frame.addView(webView, root)
        frame.addView(overlay, root)
        setContentView(frame)

        nsdManager = getSystemService(Context.NSD_SERVICE) as NsdManager
        setupWifiDirect()
        requestNearbyPermission()
    }

    private fun requestNearbyPermission() {
        val perm = if (Build.VERSION.SDK_INT >= 33) Manifest.permission.NEARBY_WIFI_DEVICES
        else Manifest.permission.ACCESS_FINE_LOCATION
        if (checkSelfPermission(perm) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(perm), 1)
        }
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

    // ---------------- UI ----------------
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
            setPadding(0, 0, 0, 8)
        }
        statusText = TextView(ctx).apply {
            text = "Play on the same WiFi. One phone hosts, others join automatically."
            textSize = 14f
            setTextColor(0xffc9c9d6.toInt())
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 18)
        }

        mainButtons = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
        }
        fun btn(label: String, color: Int = 0xff2a9d8f.toInt(), action: () -> Unit): Button {
            return Button(ctx).apply {
                text = label
                setBackgroundColor(color)
                setTextColor(0xffffffff.toInt())
                setAllCaps(false)
                setPadding(20, 16, 20, 16)
                setOnClickListener { action() }
                val lp = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
                lp.setMargins(0, 0, 0, 12)
                layoutParams = lp
            }
        }
        mainButtons.addView(btn("Host LAN Game") { startHost() })
        mainButtons.addView(btn("Join LAN Game") { startJoinLan() })
        mainButtons.addView(btn("Host (Wi-Fi Direct)") { startHostWifiDirect() })
        mainButtons.addView(btn("Join (Wi-Fi Direct)") { startJoinWifiDirect() })
        mainButtons.addView(btn("Solo / Offline") { overlay.visibility = View.GONE })

        // Rooms panel (shown when joining)
        roomsPanel = LinearLayout(ctx).apply { orientation = LinearLayout.VERTICAL; visibility = View.GONE }
        val roomsTitle = TextView(ctx).apply {
            text = "Games on your network"
            textSize = 18f
            setTextColor(0xffffffff.toInt())
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 12)
        }
        roomsContainer = LinearLayout(ctx).apply { orientation = LinearLayout.VERTICAL }
        val scroll = ScrollView(ctx).apply {
            addView(roomsContainer, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 320))
        }
        val backBtn = btn("Back") { showMain() }
        roomsPanel.addView(roomsTitle)
        roomsPanel.addView(scroll)
        roomsPanel.addView(backBtn)

        layout.addView(title)
        layout.addView(statusText)
        layout.addView(mainButtons)
        layout.addView(roomsPanel)
        return layout
    }

    private fun showMain() {
        rooms.clear(); renderRooms()
        handler.post {
            mainButtons.visibility = View.VISIBLE
            roomsPanel.visibility = View.GONE
        }
    }

    private fun showRooms(status: String) {
        handler.post {
            mainButtons.visibility = View.GONE
            roomsPanel.visibility = View.VISIBLE
            statusText.text = status
        }
    }

    private fun setStatus(text: String) {
        handler.post { if (mainButtons.visibility == View.VISIBLE || roomsPanel.visibility == View.VISIBLE) statusText.text = text }
    }

    private fun hideOverlay() {
        handler.post { overlay.visibility = View.GONE }
    }

    private fun addRoom(name: String, host: String, port: Int, players: Int) {
        val key = "$name@$host:$port"
        rooms[key] = RoomInfo(name, host, port, players)
        renderRooms()
    }

    private fun renderRooms() {
        handler.post {
            roomsContainer.removeAllViews()
            if (rooms.isEmpty()) {
                val empty = TextView(this).apply {
                    text = "No games found yet…"
                    setTextColor(0xff8d8da3.toInt())
                    gravity = Gravity.CENTER
                    setPadding(0, 20, 0, 20)
                }
                roomsContainer.addView(empty)
                return@post
            }
            for ((_, room) in rooms) {
                val row = Button(this).apply {
                    text = "${room.name}  —  ${room.players} player${if (room.players == 1) "" else "s"}"
                    setBackgroundColor(0x4fb286.toInt())
                    setTextColor(0xffffffff.toInt())
                    setAllCaps(false)
                    setPadding(20, 16, 20, 16)
                    val lp = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    )
                    lp.setMargins(0, 0, 0, 12)
                    layoutParams = lp
                    setOnClickListener { connectWebView("ws://${room.host}:${room.port}"); hideOverlay() }
                }
                roomsContainer.addView(row)
            }
        }
    }

    // ---------------- Host (LAN) ----------------
    private fun startHost() {
        setStatus("Starting game on this device…")
        try {
            gameServer = GameServer(SERVER_PORT)
            gameServer?.start()
        } catch (e: Exception) {
            setStatus("Could not start host: ${e.message}")
            return
        }
        registerHostService()
        handler.postDelayed({
            connectWebView("ws://127.0.0.1:$SERVER_PORT")
            hideOverlay()
        }, 700)
    }

    // ---------------- Host (Wi-Fi Direct) ----------------
    private fun startHostWifiDirect() {
        setStatus("Creating Wi-Fi Direct group…")
        try {
            gameServer = GameServer(SERVER_PORT)
            gameServer?.start()
        } catch (e: Exception) {
            setStatus("Could not start host: ${e.message}")
            return
        }
        registerHostService()
        wifiP2pManager?.createGroup(p2pChannel, object : WifiP2pManager.ActionListener {
            override fun onSuccess() {
                setStatus("Wi-Fi Direct room ready. Friends: open Wi-Fi, join the 'Blobz' network, then Join (Wi-Fi Direct).")
                wifiP2pManager?.requestGroupInfo(p2pChannel) { group ->
                    group?.let {
                        setStatus("Join Wi-Fi network '${it.networkName}' (pass: ${it.passphrase}). Then tap Join (Wi-Fi Direct).")
                    }
                }
                handler.postDelayed({
                    connectWebView("ws://127.0.0.1:$SERVER_PORT")
                    hideOverlay()
                }, 700)
            }
            override fun onFailure(reason: Int) {
                setStatus("Wi-Fi Direct unavailable (code $reason). Started as a normal LAN host — use Join LAN Game.")
                handler.postDelayed({
                    connectWebView("ws://127.0.0.1:$SERVER_PORT")
                    hideOverlay()
                }, 700)
            }
        })
    }

    private fun registerHostService() {
        try {
            val info = NsdServiceInfo().apply {
                serviceName = "Blobz"
                serviceType = "_blobz._tcp."
                port = SERVER_PORT
                setAttribute("players", (gameServer?.activePlayerCount() ?: 1).toString())
            }
            nsdManager?.registerService(info, NsdManager.PROTOCOL_DNS_SD, registrationListener)
        } catch (e: Exception) {
            Log.w("Blobz", "NSD register failed: ${e.message}")
        }
        // Keep the advertised player count fresh.
        handler.removeCallbacks(roomAttrTask)
        handler.postDelayed(roomAttrTask, 2000)
    }

    private val roomAttrTask = object : Runnable {
        override fun run() {
            val count = gameServer?.activePlayerCount() ?: return
            try {
                nsdManager?.unregisterService(registrationListener)
                val info = NsdServiceInfo().apply {
                    serviceName = "Blobz"
                    serviceType = "_blobz._tcp."
                    port = SERVER_PORT
                    setAttribute("players", count.toString())
                }
                nsdManager?.registerService(info, NsdManager.PROTOCOL_DNS_SD, registrationListener)
            } catch (_: Exception) {
            }
            handler.postDelayed(this, 2000)
        }
    }

    private val registrationListener = object : NsdManager.RegistrationListener {
        override fun onServiceRegistered(serviceInfo: NsdServiceInfo) {
            setStatus("Hosting — friends on this network can join!")
        }
        override fun onRegistrationFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
            Log.w("Blobz", "register failed $errorCode")
        }
        override fun onServiceUnregistered(serviceInfo: NsdServiceInfo) {}
        override fun onUnregistrationFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {}
    }

    // ---------------- Join (LAN) ----------------
    private fun startJoinLan() {
        rooms.clear(); renderRooms()
        showRooms("Scanning for a LAN game…")
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
            val host = serviceInfo.host ?: return
            val players = serviceInfo.attributes["players"]?.let { String(it).toIntOrNull() } ?: 0
            addRoom(serviceInfo.serviceName ?: "Blobz", host.hostAddress ?: return, serviceInfo.port, players)
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
        override fun onServiceLost(service: NsdServiceInfo) {
            // Best-effort: leave stale entries; they refresh on re-resolve.
        }
        override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
            setStatus("Scan failed. Try Host on one device.")
        }
        override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}
    }

    // ---------------- Join (Wi-Fi Direct) ----------------
    private fun startJoinWifiDirect() {
        wifiDirectJoinPending = true
        rooms.clear(); renderRooms()
        showRooms("Connecting to host's Wi-Fi Direct…")
        wifiP2pManager?.discoverPeers(p2pChannel, object : WifiP2pManager.ActionListener {
            override fun onSuccess() {}
            override fun onFailure(reason: Int) {
                setStatus("Wi-Fi Direct scan failed (code $reason). Use Join LAN Game.")
            }
        })
    }

    private fun setupWifiDirect() {
        try {
            wifiP2pManager = getSystemService(Context.WIFI_P2P_SERVICE) as WifiP2pManager
            p2pChannel = wifiP2pManager?.initialize(this, mainLooper, null)
        } catch (e: Exception) {
            Log.w("Blobz", "Wi-Fi Direct unavailable: ${e.message}")
        }
        p2pReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                when (intent?.action) {
                    WifiP2pManager.WIFI_P2P_PEERS_CHANGED_ACTION -> {
                        wifiP2pManager?.requestPeers(p2pChannel, peerListener)
                    }
                    WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION -> {
                        // We're now on the host's group network — find the room via NSD.
                        if (wifiDirectJoinPending) {
                            wifiDirectJoinPending = false
                            startJoinLan()
                        }
                    }
                }
            }
        }
        val filter = IntentFilter().apply {
            addAction(WifiP2pManager.WIFI_P2P_PEERS_CHANGED_ACTION)
            addAction(WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION)
            addAction(WifiP2pManager.WIFI_P2P_STATE_CHANGED_ACTION)
        }
        registerReceiver(p2pReceiver, filter)
    }

    private val peerListener = WifiP2pManager.PeerListListener { peers: WifiP2pDeviceList ->
        val deviceList = peers.deviceList
        if (deviceList.isEmpty()) return@PeerListListener
        // Connect to the first discovered peer (the host).
        val device: WifiP2pDevice = deviceList.iterator().next()
        val config = WifiP2pConfig()
        config.deviceAddress = device.deviceAddress
        wifiP2pManager?.connect(p2pChannel, config, object : WifiP2pManager.ActionListener {
            override fun onSuccess() {
                setStatus("Connecting to ${device.deviceName}…")
            }
            override fun onFailure(reason: Int) {
                setStatus("Could not connect to host (code $reason).")
            }
        })
    }

    // ---------------- WebView bridge ----------------
    private fun connectWebView(url: String) {
        val js = "window.blobzConnect && window.blobzConnect('$url');"
        if (pageReady) {
            webView.evaluateJavascript(js, null)
        } else {
            pendingConnect = url
        }
    }

    override fun onDestroy() {
        handler.removeCallbacks(roomAttrTask)
        try {
            nsdManager?.stopServiceDiscovery(discoveryListener)
        } catch (_: Exception) {}
        try {
            nsdManager?.unregisterService(registrationListener)
        } catch (_: Exception) {}
        try {
            wifiP2pManager?.stopPeerDiscovery(p2pChannel, object : WifiP2pManager.ActionListener {
                override fun onSuccess() {}
                override fun onFailure(reason: Int) {}
            })
        } catch (_: Exception) {}
        p2pReceiver?.let { try { unregisterReceiver(it) } catch (_: Exception) {} }
        gameServer?.shutdown()
        super.onDestroy()
    }
}
