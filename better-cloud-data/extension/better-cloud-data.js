// Better Cloud Data — TurboWarp / PenguinMod extension
// Load as an unsandboxed custom extension. Configure the API URL in the first block.
(function (Scratch) {
  "use strict";
  if (!Scratch || !Scratch.extensions) throw new Error("Better Cloud Data requires the Scratch extensions API.");

  const Cast = Scratch.Cast;
  class BetterCloudData {
    constructor() {
      this.baseUrl = "https://YOUR-RENDER-SERVICE.onrender.com";
      this.projectId = "default-project";
      this.token = "";
      this.userId = "";
      this.connectionStatus = "disconnected";
      this.lastError = "";
      this.lastErrorCode = "";
      this.lastSuccess = false;
      this.lastData = "";
      this.lastRequestId = "";
      this.cache = new Map();
      this.pending = 0;
      this.currentRoomId = "";
      this.ws = null;
      this.wsState = "disconnected";
      this.lastEvent = "";
      this.lastEventData = "";
      this.lastEventPlayer = "";
      this.eventQueue = [];
      this._polling = false;
    }

    getInfo() {
      return {
        id: "betterclouddata",
        name: "Better Cloud Data",
        color1: "#16805D",
        color2: "#11684B",
        color3: "#0C513A",
        blocks: [
          { opcode: "connect", blockType: Scratch.BlockType.COMMAND, text: "connect to API [URL] project [PROJECT]", arguments: {
            URL: { type: Scratch.ArgumentType.STRING, defaultValue: "https://YOUR-RENDER-SERVICE.onrender.com" },
            PROJECT: { type: Scratch.ArgumentType.STRING, defaultValue: "my-game" }
          }},
          { opcode: "disconnect", blockType: Scratch.BlockType.COMMAND, text: "disconnect from API" },
          { opcode: "connected", blockType: Scratch.BlockType.BOOLEAN, text: "API connected?" },
          { opcode: "status", blockType: Scratch.BlockType.REPORTER, text: "API status" },
          { opcode: "lastError", blockType: Scratch.BlockType.REPORTER, text: "last API error" },
          { opcode: "lastErrorCode", blockType: Scratch.BlockType.REPORTER, text: "last error code" },
          "---",
          { opcode: "setCloudValue", blockType: Scratch.BlockType.COMMAND, text: "set cloud value [KEY] to [VALUE]", arguments: {
            KEY: { type: Scratch.ArgumentType.STRING, defaultValue: "coins" }, VALUE: { type: Scratch.ArgumentType.STRING, defaultValue: "100" }
          }},
          { opcode: "fetchCloudValue", blockType: Scratch.BlockType.COMMAND, text: "fetch cloud value [KEY]", arguments: {
            KEY: { type: Scratch.ArgumentType.STRING, defaultValue: "coins" }
          }},
          { opcode: "cloudValue", blockType: Scratch.BlockType.REPORTER, text: "cached cloud value [KEY]", arguments: {
            KEY: { type: Scratch.ArgumentType.STRING, defaultValue: "coins" }
          }},
          { opcode: "cloudExists", blockType: Scratch.BlockType.BOOLEAN, text: "cloud value [KEY] exists?", arguments: {
            KEY: { type: Scratch.ArgumentType.STRING, defaultValue: "coins" }
          }},
          { opcode: "deleteCloudValue", blockType: Scratch.BlockType.COMMAND, text: "delete cloud value [KEY]", arguments: {
            KEY: { type: Scratch.ArgumentType.STRING, defaultValue: "coins" }
          }},
          { opcode: "changeCloudNumber", blockType: Scratch.BlockType.COMMAND, text: "change cloud number [KEY] by [AMOUNT]", arguments: {
            KEY: { type: Scratch.ArgumentType.STRING, defaultValue: "coins" }, AMOUNT: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 }
          }},
          { opcode: "cloudUpdatedHat", blockType: Scratch.BlockType.HAT, text: "when cloud value [KEY] changes", arguments: {
            KEY: { type: Scratch.ArgumentType.STRING, defaultValue: "coins" }
          }},
          "---",
          { opcode: "register", blockType: Scratch.BlockType.COMMAND, text: "register username [USERNAME] password [PASSWORD]", arguments: {
            USERNAME: { type: Scratch.ArgumentType.STRING, defaultValue: "player123" }, PASSWORD: { type: Scratch.ArgumentType.STRING, defaultValue: "" }
          }},
          { opcode: "login", blockType: Scratch.BlockType.COMMAND, text: "log in username [USERNAME] password [PASSWORD]", arguments: {
            USERNAME: { type: Scratch.ArgumentType.STRING, defaultValue: "player123" }, PASSWORD: { type: Scratch.ArgumentType.STRING, defaultValue: "" }
          }},
          { opcode: "logout", blockType: Scratch.BlockType.COMMAND, text: "log out" },
          { opcode: "loggedIn", blockType: Scratch.BlockType.BOOLEAN, text: "logged in?" },
          { opcode: "myAccountId", blockType: Scratch.BlockType.REPORTER, text: "my account ID" },
          "---",
          { opcode: "saveData", blockType: Scratch.BlockType.COMMAND, text: "save data [DATA] in slot [SLOT]", arguments: {
            DATA: { type: Scratch.ArgumentType.STRING, defaultValue: "{\"level\":1}" }, SLOT: { type: Scratch.ArgumentType.STRING, defaultValue: "slot-1" }
          }},
          { opcode: "loadData", blockType: Scratch.BlockType.COMMAND, text: "load data from slot [SLOT]", arguments: {
            SLOT: { type: Scratch.ArgumentType.STRING, defaultValue: "slot-1" }
          }},
          { opcode: "lastLoadedData", blockType: Scratch.BlockType.REPORTER, text: "last loaded data" },
          { opcode: "deleteSave", blockType: Scratch.BlockType.COMMAND, text: "delete save slot [SLOT]", arguments: {
            SLOT: { type: Scratch.ArgumentType.STRING, defaultValue: "slot-1" }
          }},
          { opcode: "saveSuccess", blockType: Scratch.BlockType.BOOLEAN, text: "last save successful?" },
          "---",
          { opcode: "submitScore", blockType: Scratch.BlockType.COMMAND, text: "submit score [SCORE] to leaderboard [NAME]", arguments: {
            SCORE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 }, NAME: { type: Scratch.ArgumentType.STRING, defaultValue: "high-scores" }
          }},
          { opcode: "refreshLeaderboard", blockType: Scratch.BlockType.COMMAND, text: "refresh leaderboard [NAME]", arguments: {
            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: "high-scores" }
          }},
          { opcode: "scoreAtRank", blockType: Scratch.BlockType.REPORTER, text: "score at rank [RANK] in leaderboard [NAME]", arguments: {
            RANK: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 }, NAME: { type: Scratch.ArgumentType.STRING, defaultValue: "high-scores" }
          }},
          { opcode: "usernameAtRank", blockType: Scratch.BlockType.REPORTER, text: "username at rank [RANK] in leaderboard [NAME]", arguments: {
            RANK: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 }, NAME: { type: Scratch.ArgumentType.STRING, defaultValue: "high-scores" }
          }},
          { opcode: "leaderboardSize", blockType: Scratch.BlockType.REPORTER, text: "leaderboard size [NAME]", arguments: {
            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: "high-scores" }
          }},
          "---",
          { opcode: "createRoom", blockType: Scratch.BlockType.COMMAND, text: "create room [ROOM]", arguments: {
            ROOM: { type: Scratch.ArgumentType.STRING, defaultValue: "lobby" }
          }},
          { opcode: "joinRoom", blockType: Scratch.BlockType.COMMAND, text: "join room [ROOM]", arguments: {
            ROOM: { type: Scratch.ArgumentType.STRING, defaultValue: "lobby" }
          }},
          { opcode: "leaveRoom", blockType: Scratch.BlockType.COMMAND, text: "leave room" },
          { opcode: "roomId", blockType: Scratch.BlockType.REPORTER, text: "room ID" },
          { opcode: "sendEvent", blockType: Scratch.BlockType.COMMAND, text: "send event [EVENT] data [DATA]", arguments: {
            EVENT: { type: Scratch.ArgumentType.STRING, defaultValue: "player-moved" }, DATA: { type: Scratch.ArgumentType.STRING, defaultValue: "{}" }
          }},
          { opcode: "eventReceivedHat", blockType: Scratch.BlockType.HAT, text: "when multiplayer event [EVENT] received", arguments: {
            EVENT: { type: Scratch.ArgumentType.STRING, defaultValue: "player-moved" }
          }},
          { opcode: "eventData", blockType: Scratch.BlockType.REPORTER, text: "event data" },
          { opcode: "eventPlayer", blockType: Scratch.BlockType.REPORTER, text: "event player ID" },
          { opcode: "multiplayerStatus", blockType: Scratch.BlockType.REPORTER, text: "multiplayer status" },
          "---",
          { opcode: "lastSuccess", blockType: Scratch.BlockType.BOOLEAN, text: "last operation successful?" },
          { opcode: "requestId", blockType: Scratch.BlockType.REPORTER, text: "last request ID" },
          { opcode: "pendingRequests", blockType: Scratch.BlockType.REPORTER, text: "pending requests" },
          { opcode: "jsonEncode", blockType: Scratch.BlockType.REPORTER, text: "JSON encode [VALUE]", arguments: {
            VALUE: { type: Scratch.ArgumentType.STRING, defaultValue: "{\"x\":1}" }
          }},
          { opcode: "jsonDecode", blockType: Scratch.BlockType.REPORTER, text: "JSON decode [TEXT]", arguments: {
            TEXT: { type: Scratch.ArgumentType.STRING, defaultValue: "{\"x\":1}" }
          }},
          { opcode: "clearCache", blockType: Scratch.BlockType.COMMAND, text: "clear local cache" }
        ]
      };
    }

    _text(v) { return Cast.toString(v); }
    _key(v) { return this._text(v).trim(); }
    _id() {
      return (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() :
        `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    }
    _setError(error, code = "ERROR") {
      this.lastSuccess = false;
      this.lastError = error && error.message ? error.message : String(error || "Unknown error");
      this.lastErrorCode = code;
    }
    _clearError() {
      this.lastSuccess = true;
      this.lastError = "";
      this.lastErrorCode = "";
    }
    async _request(path, options = {}) {
      if (!this.baseUrl) throw new Error("API URL is not configured.");
      const id = this._id();
      this.lastRequestId = id;
      this.pending++;
      try {
        const headers = { "Content-Type": "application/json", "X-Request-ID": id, ...(options.headers || {}) };
        if (this.token) headers.Authorization = `Bearer ${this.token}`;
        const response = await fetch(`${this.baseUrl.replace(/\/+$/, "")}${path}`, {
          ...options, headers, cache: "no-store"
        });
        let body = {};
        try { body = await response.json(); } catch (_) {}
        if (!response.ok) {
          const err = new Error(body.error || `HTTP ${response.status}`);
          err.code = body.code || `HTTP_${response.status}`;
          throw err;
        }
        this._clearError();
        return body;
      } catch (e) {
        this._setError(e, e.code || "NETWORK_ERROR");
        throw e;
      } finally {
        this.pending = Math.max(0, this.pending - 1);
      }
    }
    async connect(args) {
      this.baseUrl = this._text(args.URL).trim().replace(/\/+$/, "");
      this.projectId = this._text(args.PROJECT).trim() || "default-project";
      this.connectionStatus = "connecting";
      try {
        await this._request("/v1/health");
        this.connectionStatus = "connected";
      } catch (_) { this.connectionStatus = "error"; }
    }
    disconnect() {
      this.leaveRoom();
      this.connectionStatus = "disconnected";
      this.token = "";
      this.userId = "";
    }
    connected() { return this.connectionStatus === "connected"; }
    status() { return this.connectionStatus; }
    lastError() { return this.lastError; }
    lastErrorCode() { return this.lastErrorCode; }
    async setCloudValue(args) {
      const key = this._key(args.KEY);
      if (!key) return this._setError("Key cannot be empty.", "INVALID_KEY");
      try {
        const out = await this._request(`/v1/projects/${encodeURIComponent(this.projectId)}/cloud/${encodeURIComponent(key)}`, {
          method: "PUT", body: JSON.stringify({ value: this._text(args.VALUE) })
        });
        this._updateCache(key, out.value);
      } catch (_) {}
    }
    async fetchCloudValue(args) {
      const key = this._key(args.KEY);
      try {
        const out = await this._request(`/v1/projects/${encodeURIComponent(this.projectId)}/cloud/${encodeURIComponent(key)}`);
        this._updateCache(key, out.value);
      } catch (e) {
        if (e.code === "NOT_FOUND") this.cache.delete(key);
      }
    }
    cloudValue(args) { return this.cache.has(this._key(args.KEY)) ? this.cache.get(this._key(args.KEY)) : ""; }
    cloudExists(args) { return this.cache.has(this._key(args.KEY)); }
    async deleteCloudValue(args) {
      const key = this._key(args.KEY);
      try {
        await this._request(`/v1/projects/${encodeURIComponent(this.projectId)}/cloud/${encodeURIComponent(key)}`, { method: "DELETE" });
        this.cache.delete(key);
      } catch (_) {}
    }
    async changeCloudNumber(args) {
      const key = this._key(args.KEY);
      try {
        const out = await this._request(`/v1/projects/${encodeURIComponent(this.projectId)}/cloud/${encodeURIComponent(key)}/increment`, {
          method: "POST", body: JSON.stringify({ amount: Number(args.AMOUNT) || 0 })
        });
        this._updateCache(key, out.value);
      } catch (_) {}
    }
    _updateCache(key, value) {
      const old = this.cache.get(key);
      const val = String(value);
      this.cache.set(key, val);
      if (old !== val) {
        this.lastEvent = `cloud:${key}`;
        this.lastEventData = val;
        this.lastEventPlayer = "";
        this.eventQueue.push({ type: "cloud", key, value: val });
        if (this.eventQueue.length > 200) this.eventQueue.shift();
      }
    }
    cloudUpdatedHat(args) {
      const key = this._key(args.KEY);
      const i = this.eventQueue.findIndex(e => e.type === "cloud" && e.key === key);
      if (i < 0) return false;
      this.eventQueue.splice(i, 1);
      return true;
    }
    async register(args) {
      try {
        const out = await this._request("/v1/auth/register", { method: "POST", body: JSON.stringify({
          username: this._text(args.USERNAME), password: this._text(args.PASSWORD)
        })});
        this.token = out.token; this.userId = out.user.id;
      } catch (_) {}
    }
    async login(args) {
      try {
        const out = await this._request("/v1/auth/login", { method: "POST", body: JSON.stringify({
          username: this._text(args.USERNAME), password: this._text(args.PASSWORD)
        })});
        this.token = out.token; this.userId = out.user.id;
      } catch (_) {}
    }
    logout() { this.token = ""; this.userId = ""; }
    loggedIn() { return !!this.token; }
    myAccountId() { return this.userId; }
    async saveData(args) {
      if (!this.token) return this._setError("Log in before saving data.", "AUTH_REQUIRED");
      try {
        const data = this._text(args.DATA);
        JSON.parse(data);
        await this._request(`/v1/projects/${encodeURIComponent(this.projectId)}/saves/${encodeURIComponent(this._key(args.SLOT))}`, {
          method: "PUT", body: JSON.stringify({ data })
        });
      } catch (e) { if (e instanceof SyntaxError) this._setError("Save data must be valid JSON.", "INVALID_JSON"); }
    }
    async loadData(args) {
      if (!this.token) return this._setError("Log in before loading data.", "AUTH_REQUIRED");
      try {
        const out = await this._request(`/v1/projects/${encodeURIComponent(this.projectId)}/saves/${encodeURIComponent(this._key(args.SLOT))}`);
        this.lastData = out.data;
      } catch (_) { this.lastData = ""; }
    }
    lastLoadedData() { return this.lastData; }
    async deleteSave(args) {
      if (!this.token) return this._setError("Log in before deleting data.", "AUTH_REQUIRED");
      try { await this._request(`/v1/projects/${encodeURIComponent(this.projectId)}/saves/${encodeURIComponent(this._key(args.SLOT))}`, { method: "DELETE" }); }
      catch (_) {}
    }
    saveSuccess() { return this.lastSuccess; }
    async submitScore(args) {
      if (!this.token) return this._setError("Log in before submitting a score.", "AUTH_REQUIRED");
      try { await this._request(`/v1/projects/${encodeURIComponent(this.projectId)}/leaderboards/${encodeURIComponent(this._key(args.NAME))}/scores`, {
        method: "POST", body: JSON.stringify({ score: Number(args.SCORE) })
      }); } catch (_) {}
    }
    async refreshLeaderboard(args) {
      const name = this._key(args.NAME);
      try {
        const out = await this._request(`/v1/projects/${encodeURIComponent(this.projectId)}/leaderboards/${encodeURIComponent(name)}?limit=100`);
        this.cache.set(`lb:${name}`, JSON.stringify(out.entries || []));
      } catch (_) { this.cache.set(`lb:${name}`, "[]"); }
    }
    _leaderboard(name) { try { return JSON.parse(this.cache.get(`lb:${name}`) || "[]"); } catch (_) { return []; } }
    scoreAtRank(args) { const row = this._leaderboard(this._key(args.NAME))[Math.max(0, Math.floor(Number(args.RANK) || 1) - 1)]; return row ? row.score : ""; }
    usernameAtRank(args) { const row = this._leaderboard(this._key(args.NAME))[Math.max(0, Math.floor(Number(args.RANK) || 1) - 1)]; return row ? row.username : ""; }
    leaderboardSize(args) { return this._leaderboard(this._key(args.NAME)).length; }
    _wsUrl() {
      const u = new URL(this.baseUrl);
      u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
      u.pathname = "/v1/ws";
      u.search = `?project=${encodeURIComponent(this.projectId)}&token=${encodeURIComponent(this.token)}`;
      return u.toString();
    }
    async createRoom(args) { await this._joinRoom(this._key(args.ROOM) || "lobby", true); }
    async joinRoom(args) { await this._joinRoom(this._key(args.ROOM) || "lobby", false); }
    async _joinRoom(room, create) {
      if (!this.token) return this._setError("Log in before joining a room.", "AUTH_REQUIRED");
      this.leaveRoom();
      try {
        await this._request(`/v1/projects/${encodeURIComponent(this.projectId)}/rooms/${encodeURIComponent(room)}/${create ? "create" : "join"}`, { method: "POST" });
        this.currentRoomId = room;
        this.wsState = "connecting";
        this.ws = new WebSocket(this._wsUrl());
        this.ws.onopen = () => {
          this.wsState = "connected";
          this.ws.send(JSON.stringify({ type: "join", room }));
        };
        this.ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "event") {
              this.lastEvent = msg.event || "";
              this.lastEventData = typeof msg.data === "string" ? msg.data : JSON.stringify(msg.data ?? "");
              this.lastEventPlayer = msg.playerId || "";
              this.eventQueue.push({ type: "multiplayer", event: this.lastEvent, data: this.lastEventData, playerId: this.lastEventPlayer });
              if (this.eventQueue.length > 200) this.eventQueue.shift();
            }
          } catch (_) {}
        };
        this.ws.onerror = () => { this.wsState = "error"; };
        this.ws.onclose = () => { if (this.wsState !== "disconnected") this.wsState = "disconnected"; };
      } catch (_) { this.wsState = "error"; }
    }
    leaveRoom() {
      if (this.ws) { try { this.ws.close(); } catch (_) {} }
      this.ws = null; this.currentRoomId = ""; this.wsState = "disconnected";
    }
    roomId() { return this.currentRoomId; }
    sendEvent(args) {
      if (!this.ws || this.ws.readyState !== 1) return this._setError("Not connected to a multiplayer room.", "ROOM_NOT_CONNECTED");
      try { this.ws.send(JSON.stringify({ type: "event", event: this._text(args.EVENT), data: this._text(args.DATA) })); this._clearError(); }
      catch (e) { this._setError(e); }
    }
    eventReceivedHat(args) {
      const eventName = this._text(args.EVENT);
      const i = this.eventQueue.findIndex(e => e.type === "multiplayer" && e.event === eventName);
      if (i < 0) return false;
      this.eventQueue.splice(i, 1);
      return true;
    }
    eventData() { return this.lastEventData; }
    eventPlayer() { return this.lastEventPlayer; }
    multiplayerStatus() { return this.wsState; }
    lastSuccess() { return this.lastSuccess; }
    requestId() { return this.lastRequestId; }
    pendingRequests() { return this.pending; }
    jsonEncode(args) {
      const raw = this._text(args.VALUE);
      try { return JSON.stringify(JSON.parse(raw)); } catch (_) { return JSON.stringify(raw); }
    }
    jsonDecode(args) {
      try { return JSON.stringify(JSON.parse(this._text(args.TEXT))); } catch (_) { return ""; }
    }
    clearCache() { this.cache.clear(); this.eventQueue = []; }
  }

  Scratch.extensions.register(new BetterCloudData());
})(Scratch);
