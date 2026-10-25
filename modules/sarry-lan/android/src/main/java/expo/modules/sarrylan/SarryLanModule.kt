package expo.modules.sarrylan

import android.content.Context
import android.net.wifi.WifiManager
import android.util.Base64
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetSocketAddress
import java.net.Socket
import java.net.SocketTimeoutException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

// Rede local para o protocolo da Tuya: ouve os anúncios UDP dos aparelhos e abre conexões TCP.
// Os bytes trafegam em base64; a criptografia e o protocolo ficam no JavaScript (src/lib/lan).
class SarryLanModule : Module() {
  private val sockets = ConcurrentHashMap<Int, Socket>()
  private val nextId = AtomicInteger(1)

  override fun definition() = ModuleDefinition {
    Name("SarryLan")

    AsyncFunction("listenUdp") Coroutine { ports: List<Int>, durationMs: Int ->
      listen(ports, durationMs)
    }

    AsyncFunction("tcpOpen") Coroutine { host: String, port: Int, timeoutMs: Int ->
      withContext(Dispatchers.IO) {
        val socket = Socket()
        socket.tcpNoDelay = true
        try {
          socket.connect(InetSocketAddress(host, port), timeoutMs)
        } catch (e: Exception) {
          runCatching { socket.close() }
          throw e
        }
        val id = nextId.getAndIncrement()
        sockets[id] = socket
        id
      }
    }

    AsyncFunction("tcpWrite") Coroutine { id: Int, data: String ->
      withContext(Dispatchers.IO) {
        val socket = sockets[id] ?: throw IllegalStateException("Conexão fechada")
        val out = socket.getOutputStream()
        out.write(Base64.decode(data, Base64.NO_WRAP))
        out.flush()
        true
      }
    }

    // Lê o que chegar até o tempo limite; null quando nada chegou
    AsyncFunction("tcpRead") Coroutine { id: Int, timeoutMs: Int ->
      withContext(Dispatchers.IO) {
        val socket = sockets[id] ?: throw IllegalStateException("Conexão fechada")
        socket.soTimeout = timeoutMs.coerceAtLeast(1)
        val buf = ByteArray(4096)
        try {
          val n = socket.getInputStream().read(buf)
          if (n < 0) throw IllegalStateException("O aparelho encerrou a conexão")
          Base64.encodeToString(buf, 0, n, Base64.NO_WRAP)
        } catch (e: SocketTimeoutException) {
          null
        }
      }
    }

    AsyncFunction("tcpClose") Coroutine { id: Int ->
      withContext(Dispatchers.IO) {
        sockets.remove(id)?.let { runCatching { it.close() } }
        true
      }
    }

    OnDestroy {
      sockets.values.forEach { runCatching { it.close() } }
      sockets.clear()
    }
  }

  private suspend fun listen(ports: List<Int>, durationMs: Int): List<Map<String, Any>> {
    val context = appContext.reactContext ?: throw IllegalStateException("Sem contexto do app")
    val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    val lock = wifi.createMulticastLock("sarry-lan")
    lock.setReferenceCounted(false)
    lock.acquire()
    val deadline = System.currentTimeMillis() + durationMs
    try {
      return coroutineScope {
        ports.map { port -> async(Dispatchers.IO) { receive(port, deadline) } }.awaitAll().flatten()
      }
    } finally {
      runCatching { lock.release() }
    }
  }

  private fun receive(port: Int, deadline: Long): List<Map<String, Any>> {
    val out = mutableListOf<Map<String, Any>>()
    val seen = HashSet<String>()
    val socket = try {
      DatagramSocket(null).apply {
        reuseAddress = true
        broadcast = true
        bind(InetSocketAddress(port))
      }
    } catch (e: Exception) {
      return out
    }
    socket.use {
      val buf = ByteArray(2048)
      while (true) {
        val left = deadline - System.currentTimeMillis()
        if (left <= 0) break
        it.soTimeout = left.toInt().coerceAtLeast(1)
        val packet = DatagramPacket(buf, buf.size)
        try {
          it.receive(packet)
        } catch (e: SocketTimeoutException) {
          break
        }
        val data = Base64.encodeToString(packet.data, packet.offset, packet.length, Base64.NO_WRAP)
        if (seen.add(data)) {
          out.add(mapOf("port" to port, "address" to (packet.address?.hostAddress ?: ""), "data" to data))
        }
      }
    }
    return out
  }
}
