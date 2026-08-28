package com.blobz.game

import org.java_websocket.WebSocket
import org.java_websocket.handshake.ClientHandshake
import org.java_websocket.server.WebSocketServer
import java.net.InetSocketAddress
import java.util.Random
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

/**
 * Authoritative, in-app game server. Runs entirely on the hosting device — no PC,
 * no terminal, no internet. Mirrors the simulation in server/index.js so the JS
 * client (loaded in the WebView) can connect to either this or the Node server.
 *
 * Protocol (JSON):
 *   client -> server: {type:"join",name,color} | {type:"input",x,y}
 *   server -> client: {type:"welcome",id,world,color,name}
 *                    | {type:"state",t,world,foods:[[x,y,c]],blobs:[{id,x,y,m,c,n,p,a}]}
 */
class GameServer(port: Int) : WebSocketServer(InetSocketAddress(port)) {

    private val WORLD_W = 4000f
    private val WORLD_H = 4000f
    private val FOOD_COUNT = 500
    private val BOT_COUNT = 18
    private val TICK_MS = 33L
    private val RESPAWN_MS = 2000L
    private val BROADCAST_MS = 50L
    private val rng = Random()

    private val botNames = arrayOf(
        "Vortex", "Nibbler", "Gloop", "Bubbles", "Chonk", "Spike",
        "Wobble", "Pixel", "Munch", "Doom", "Zoom", "Ghost", "Comet",
        "Tank", "Echo", "Blaze", "Quark", "Tofu"
    )

    private data class Food(var x: Float, var y: Float, var color: String)
    private data class Bot(
        val idx: Int, var x: Float, var y: Float, var mass: Float,
        var color: String, var name: String, var targetX: Float = 0f, var targetY: Float = 0f,
        var alive: Boolean = true
    )
    private data class Player(
        val conn: WebSocket, val id: Int, var name: String, var color: String,
        var x: Float, var y: Float, var mass: Float,
        var inputX: Float = 0f, var inputY: Float = 0f,
        var alive: Boolean = true, var respawnAt: Long = 0L, var best: Int = 30
    )

    private val foods = mutableListOf<Food>()
    private val bots = mutableListOf<Bot>()
    private val players = ConcurrentHashMap<WebSocket, Player>()
    private val nextId = AtomicInteger(1)
    private var lastBroadcast = 0L
    @Volatile private var running = false
    private var loop: Thread? = null

    init {
        for (i in 0 until FOOD_COUNT) foods.add(spawnFood())
        for (i in 0 until BOT_COUNT) {
            bots.add(
                Bot(
                    i, rand(WORLD_W), rand(WORLD_H), rand(20f, 120f), randColor(),
                    botNames[i % botNames.size] + if (rng.nextBoolean()) "" else rand(1f, 99f).toInt().toString()
                )
            )
        }
    }

    // ---- lifecycle ----
    override fun onStart() {
        running = true
        loop = Thread {
            while (running) {
                val t0 = System.currentTimeMillis()
                simulate()
                val now = System.currentTimeMillis()
                if (now - lastBroadcast >= BROADCAST_MS) {
                    lastBroadcast = now
                    val snap = buildSnapshot(now)
                    for (p in players.values) {
                        if (p.conn.isOpen) p.conn.send(snap)
                    }
                }
                val elapsed = System.currentTimeMillis() - t0
                if (elapsed < TICK_MS) Thread.sleep(TICK_MS - elapsed)
            }
        }
        loop?.start()
    }

    override fun onOpen(conn: WebSocket, handshake: ClientHandshake) {}
    override fun onClose(conn: WebSocket, code: Int, reason: String, remote: Boolean) {
        players.remove(conn)
    }
    override fun onError(conn: WebSocket?, ex: Exception) {
        conn?.let { players.remove(it) }
    }
    override fun onMessage(conn: WebSocket, message: String) {
        try {
            val msg = parse(message)
            when (msg["type"]) {
                "join" -> {
                    val id = nextId.getAndIncrement()
                    val name = (msg["name"] as? String ?: "Player").take(16).ifBlank { "Player" }
                    val color = (msg["color"] as? String ?: randColor()).ifBlank { randColor() }
                    val p = Player(
                        conn, id, name, color,
                        rand(0f, WORLD_W), rand(0f, WORLD_H), 30f
                    )
                    players[conn] = p
                    conn.send(
                        """{"type":"welcome","id":$id,"world":{"w":$WORLD_W,"h":$WORLD_H},"color":"$color","name":"${
                            escape(name)
                        }"}"""
                    )
                }
                "input" -> {
                    val p = players[conn] ?: return
                    p.inputX = clamp((msg["x"] as? Number)?.toFloat() ?: 0f, -1f, 1f)
                    p.inputY = clamp((msg["y"] as? Number)?.toFloat() ?: 0f, -1f, 1f)
                }
            }
        } catch (_: Exception) {
        }
    }

    /** Live player count (used for the LAN room listing TXT record). */
    fun activePlayerCount(): Int = players.size

    fun shutdown() {
        running = false
        try {
            loop?.join(500)
        } catch (_: Exception) {
        }
        try {
            stop()
        } catch (_: Exception) {
        }
    }

    // ---- simulation ----
    private fun rand(a: Float, b: Float) = a + rng.nextFloat() * (b - a)
    private fun rand(max: Float) = rand(0f, max)
    private fun randColor() = "hsl(${rng.nextInt(360)},70%,60%)"
    private fun clamp(v: Float, lo: Float, hi: Float) = max(lo, min(hi, v))
    private fun massToRadius(m: Float) = max(12f, Math.sqrt(m.toDouble()).toFloat() * 4f)
    private fun speedFor(m: Float) = 3.2f * Math.pow(30.0 / (m + 30.0), 0.4).toFloat()

    private fun spawnFood() = Food(rand(0f, WORLD_W), rand(0f, WORLD_H), randColor())

    private fun aliveBlobs(): List<Any> {
        val list = mutableListOf<Any>()
        for (p in players.values) if (p.alive) list.add(p)
        for (b in bots) if (b.alive) list.add(b)
        return list
    }

    private fun botThink(bot: Bot) {
        if (rng.nextFloat() < 0.02f || (bot.targetX == 0f && bot.targetY == 0f)) {
            val angle = rand(0f, (Math.PI * 2).toFloat())
            val reach = rand(200f, 700f)
            bot.targetX = clamp(bot.x + Math.cos(angle.toDouble()).toFloat() * reach, 0f, WORLD_W)
            bot.targetY = clamp(bot.y + Math.sin(angle.toDouble()).toFloat() * reach, 0f, WORLD_H)
        }
        val list = aliveBlobs()
        var threat: Any? = null
        var prey: Any? = null
        var bestPreyDist = Float.MAX_VALUE
        for (other in list) {
            if (other === bot) continue
            val ox = xOf(other); val oy = yOf(other); val om = massOf(other)
            val d = hypot(ox - bot.x, oy - bot.y)
            if (d > 600f) continue
            if (om > bot.mass * 1.15f) {
                if (threat == null || d < hypot(xOf(threat) - bot.x, yOf(threat) - bot.y)) threat = other
            } else if (bot.mass > om * 1.15f) {
                if (d < bestPreyDist) {
                    prey = other
                    bestPreyDist = d
                }
            }
        }
        if (threat != null) {
            val ax = bot.x - xOf(threat)
            val ay = bot.y - yOf(threat)
            val m = hypot(ax, ay).coerceAtLeast(1f)
            bot.targetX = bot.x + ax / m * 400f
            bot.targetY = bot.y + ay / m * 400f
        } else if (prey != null) {
            bot.targetX = xOf(prey)
            bot.targetY = yOf(prey)
        }
    }

    private fun xOf(o: Any) = if (o is Player) o.x else (o as Bot).x
    private fun yOf(o: Any) = if (o is Player) o.y else (o as Bot).y
    private fun massOf(o: Any) = if (o is Player) o.mass else (o as Bot).mass

    private fun moveBlob(x: Float, y: Float, mass: Float, tx: Float, ty: Float): Pair<Float, Float> {
        val r = massToRadius(mass)
        val dx = tx - x
        val dy = ty - y
        val dist = hypot(dx, dy)
        var nx = x; var ny = y
        if (dist > 1f) {
            val sp = min(speedFor(mass), dist * 0.08f)
            nx = x + dx / dist * sp
            ny = y + dy / dist * sp
        }
        nx = clamp(nx, r, WORLD_W - r)
        ny = clamp(ny, r, WORLD_H - r)
        return nx to ny
    }

    private fun simulate() {
        val now = System.currentTimeMillis()

        for (p in players.values) {
            if (!p.alive) {
                if (now >= p.respawnAt) {
                    p.x = rand(0f, WORLD_W)
                    p.y = rand(0f, WORLD_H)
                    p.mass = 30f
                    p.inputX = 0f; p.inputY = 0f
                    p.alive = true
                }
                continue
            }
            if (p.mass.toInt() > p.best) p.best = p.mass.toInt()
            val m = hypot(p.inputX, p.inputY)
            if (m > 0.001f) {
                val sp = min(speedFor(p.mass), speedFor(p.mass) * min(1f, m))
                p.x += p.inputX / m * sp
                p.y += p.inputY / m * sp
            }
            val r = massToRadius(p.mass)
            p.x = clamp(p.x, r, WORLD_W - r)
            p.y = clamp(p.y, r, WORLD_H - r)
        }

        for (bot in bots) {
            if (!bot.alive) continue
            botThink(bot)
            val (nx, ny) = moveBlob(bot.x, bot.y, bot.mass, bot.targetX, bot.targetY)
            bot.x = nx; bot.y = ny
        }

        // eat food
        for (b in aliveBlobs()) {
            val bx = xOf(b); val by = yOf(b); val r = massToRadius(massOf(b)); val r2 = r * r
            val iter = foods.listIterator()
            while (iter.hasNext()) {
                val f = iter.next()
                val dx = f.x - bx; val dy = f.y - by
                if (dx * dx + dy * dy < r2) {
                    if (b is Player) b.mass += 1f else (b as Bot).mass += 1f
                    iter.set(spawnFood())
                }
            }
        }

        // collisions
        val all = aliveBlobs()
        for (i in all.indices) {
            val a = all[i]
            for (j in i + 1 until all.size) {
                val b = all[j]
                val dx = xOf(b) - xOf(a)
                val dy = yOf(b) - yOf(a)
                val dist = hypot(dx, dy)
                val rA = massToRadius(massOf(a))
                val rB = massToRadius(massOf(b))
                if (dist < rA + rB) {
                    val eater: Any
                    val eaten: Any
                    if (massOf(a) > massOf(b) * 1.15f) {
                        eater = a; eaten = b
                    } else if (massOf(b) > massOf(a) * 1.15f) {
                        eater = b; eaten = a
                    } else continue
                    if (eater is Player) eater.mass += massOf(eaten) * 0.8f else (eater as Bot).mass += massOf(eaten) * 0.8f
                    if (eaten is Player) {
                        eaten.alive = false
                        eaten.respawnAt = now + RESPAWN_MS
                    } else {
                        val eb = eaten as Bot
                        eb.x = rand(0f, WORLD_W); eb.y = rand(0f, WORLD_H)
                        eb.mass = rand(20f, 120f)
                        eb.targetX = 0f; eb.targetY = 0f
                    }
                }
            }
        }
    }

    private fun buildSnapshot(now: Long): String {
        val sb = StringBuilder()
        sb.append("{\"type\":\"state\",\"t\":$now,\"world\":{\"w\":$WORLD_W,\"h\":$WORLD_H},\"foods\":[")
        for (i in foods.indices) {
            val f = foods[i]
            if (i > 0) sb.append(',')
            sb.append("[${f.x.toInt()},${f.y.toInt()},\"${f.color}\"]")
        }
        sb.append("],\"blobs\":[")
        var first = true
        for (p in players.values) {
            if (!first) sb.append(',')
            first = false
            sb.append(
                "{\"id\":${p.id},\"x\":${p.x.toInt()},\"y\":${p.y.toInt()},\"m\":${p.mass.toInt()},\"c\":\"${p.color}\",\"n\":\"${
                    escape(p.name)
                }\",\"p\":1,\"a\":${if (p.alive) 1 else 0}}"
            )
        }
        for (bot in bots) {
            if (!first) sb.append(',') else first = false
            sb.append(
                "{\"id\":\"b${bot.idx}\",\"x\":${bot.x.toInt()},\"y\":${bot.y.toInt()},\"m\":${bot.mass.toInt()},\"c\":\"${bot.color}\",\"n\":\"${
                    escape(bot.name)
                }\",\"p\":0,\"a\":1}"
            )
        }
        sb.append("]}")
        return sb.toString()
    }

    // minimal JSON value parsing (only the shapes we send)
    private fun parse(json: String): Map<String, Any?> {
        val map = mutableMapOf<String, Any?>()
        val type = json.substringAfter("\"type\":\"", "").substringBefore("\"").ifBlank { null }
        map["type"] = type
        fun str(key: String): String? {
            val i = json.indexOf("\"$key\":\"")
            if (i < 0) return null
            return json.substring(i + key.length + 4).substringBefore("\"")
        }
        map["name"] = str("name")
        map["color"] = str("color")
        fun num(key: String): Float? {
            val i = json.indexOf("\"$key\":")
            if (i < 0) return null
            val s = json.substring(i + key.length + 2).takeWhile { it.isDigit() || it == '-' || it == '.' }
            return s.toFloatOrNull()
        }
        map["x"] = num("x")
        map["y"] = num("y")
        return map
    }

    private fun escape(s: String) = s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ")
}
