// ===== MULTIPLAYER (2-player, peer-to-peer via PeerJS) =====
// Host generates a short lobby code and waits for a connection; the guest
// enters that code to connect directly. No backend of our own - PeerJS's
// free public broker is only used to establish the connection, after which
// the two browsers talk to each other directly over a WebRTC data channel.
const Net = (() => {
  const PEER_PREFIX = "geese-shootout-";
  const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

  let peer = null;
  let conn = null;
  let role = null; // "host" | "guest" | null
  let connected = false;

  const handlers = {};

  function on(type, cb) {
    handlers[type] = cb;
  }

  function emit(type, data) {
    if (handlers[type]) handlers[type](data);
  }

  function generateCode() {
    let code = "";
    for (let i = 0; i < 5; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    return code;
  }

  function wireConnection(onConnected, onError) {
    conn.on("open", () => {
      connected = true;
      onConnected();
    });
    conn.on("data", (msg) => {
      if (msg && msg.type) emit(msg.type, msg.data);
    });
    conn.on("close", () => {
      connected = false;
      emit("disconnected");
    });
    conn.on("error", (err) => {
      connected = false;
      if (onError) onError(err);
      emit("disconnected");
    });
  }

  // Starts hosting. onCode(code) fires once the lobby is ready to share;
  // onConnected() fires once a guest actually joins; onError(err) on failure.
  function host(onCode, onConnected, onError) {
    role = "host";
    const code = generateCode();

    peer = new Peer(PEER_PREFIX + code);

    peer.on("open", () => onCode(code));

    peer.on("connection", (c) => {
      if (conn) {
        // Only one guest supported - politely refuse extras
        c.on("open", () => c.close());
        return;
      }
      conn = c;
      wireConnection(onConnected, onError);
    });

    peer.on("error", (err) => onError(err));
  }

  // Joins an existing lobby by code.
  function join(code, onConnected, onError) {
    role = "guest";
    peer = new Peer();

    peer.on("open", () => {
      conn = peer.connect(PEER_PREFIX + code.toUpperCase(), { reliable: true });
      wireConnection(onConnected, onError);
    });

    peer.on("error", (err) => onError(err));
  }

  function send(type, data) {
    if (conn && connected) {
      try {
        conn.send({ type, data });
      } catch (e) {
        // Connection likely dropped mid-send; the close/error handlers deal with it
      }
    }
  }

  function isConnected() {
    return connected;
  }

  function getRole() {
    return role;
  }

  function disconnect() {
    if (conn) {
      try { conn.close(); } catch (e) {}
    }
    if (peer) {
      try { peer.destroy(); } catch (e) {}
    }
    conn = null;
    peer = null;
    connected = false;
    role = null;
  }

  return { on, emit, host, join, send, isConnected, getRole, disconnect };
})();
