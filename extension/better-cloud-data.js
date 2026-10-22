// Better Cloud Data — TurboWarp / PenguinMod (unsandboxed extension)
(function (Scratch) {
  "use strict";
  const Cast = Scratch.Cast;
  class BetterCloudData {
    constructor() {
      this.api = "";
      this.project = "my-game";
      this.token = "";
      this.userId = "";
      this.state = "disconnected";
      this.error = "";
      this.ok = false;
      this.cache = {};
      this.data = "";
      this.pending = 0;
      this.board = {};
      this.room = "";
      this.ws = null;
      this.events = [];
      this.eventData = "";
      this.eventPlayer = "";
    }
    getInfo() {
      return {
        id: "betterclouddata", name: "Better Cloud Data",
        color1: "#16A085", color2: "#12806A", color3: "#0B5D4C",
        blocks: [
          { opcode: "connect", blockType: Scratch.BlockType.COMMAND, text: "connect to API [URL] project [PROJECT]", arguments: { URL:{type:Scratch.ArgumentType.STRING,defaultValue:"https://YOUR-SERVICE.onrender.com"}, PROJECT:{type:Scratch.ArgumentType.STRING,defaultValue:"my-game"} } },
          { opcode: "state", blockType: Scratch.BlockType.REPORTER, text: "API status" },
          { opcode: "isConnected", blockType: Scratch.BlockType.BOOLEAN, text: "API connected?" },
          { opcode: "lastError", blockType: Scratch.BlockType.REPORTER, text: "last API error" },
          { opcode: "lastOK", blockType: Scratch.BlockType.BOOLEAN, text: "last operation successful?" },
          { opcode: "pendingCount", blockType: Scratch.BlockType.REPORTER, text: "pending requests" },
          { opcode: "disconnect", blockType: Scratch.BlockType.COMMAND, text: "disconnect" },
          "---",
          { opcode: "setValue", blockType: Scratch.BlockType.COMMAND, text: "set cloud value [KEY] to [VALUE]", arguments: { KEY:{type:Scratch.ArgumentType.STRING,defaultValue:"coins"}, VALUE:{type:Scratch.ArgumentType.STRING,defaultValue:"10"} } },
          { opcode: "fetchValue", blockType: Scratch.BlockType.COMMAND, text: "fetch cloud value [KEY]", arguments: { KEY:{type:Scratch.ArgumentType.STRING,defaultValue:"coins"} } },
          { opcode: "value", blockType: Scratch.BlockType.REPORTER, text: "cached cloud value [KEY]", arguments: { KEY:{type:Scratch.ArgumentType.STRING,defaultValue:"coins"} } },
          { opcode: "exists", blockType: Scratch.BlockType.BOOLEAN, text: "cloud value [KEY] exists?", arguments: { KEY:{type:Scratch.ArgumentType.STRING,defaultValue:"coins"} } },
          { opcode: "deleteValue", blockType: Scratch.BlockType.COMMAND, text: "delete cloud value [KEY]", arguments: { KEY:{type:Scratch.ArgumentType.STRING,defaultValue:"coins"} } },
          { opcode: "increment", blockType: Scratch.BlockType.COMMAND, text: "change cloud number [KEY] by [AMOUNT]", arguments: { KEY:{type:Scratch.ArgumentType.STRING,defaultValue:"coins"}, AMOUNT:{type:Scratch.ArgumentType.NUMBER,defaultValue:1} } },
          "---",
          { opcode: "register", blockType: Scratch.BlockType.COMMAND, text: "register username [USER] password [PASS]", arguments: { USER:{type:Scratch.ArgumentType.STRING,defaultValue:"player123"}, PASS:{type:Scratch.ArgumentType.STRING,defaultValue:""} } },
          { opcode: "login", blockType: Scratch.BlockType.COMMAND, text: "log in username [USER] password [PASS]", arguments: { USER:{type:Scratch.ArgumentType.STRING,defaultValue:"player123"}, PASS:{type:Scratch.ArgumentType.STRING,defaultValue:""} } },
          { opcode: "logout", blockType: Scratch.BlockType.COMMAND, text: "log out" },
          { opcode: "loggedIn", blockType: Scratch.BlockType.BOOLEAN, text: "logged in?" },
          { opcode: "accountId", blockType: Scratch.BlockType.REPORTER, text: "my account ID" },
          "---",
          { opcode: "save", blockType: Scratch.BlockType.COMMAND, text: "save JSON [DATA] to slot [SLOT]", arguments: { DATA:{type:Scratch.ArgumentType.STRING,defaultValue:"{\\"level\\":1}"}, SLOT:{type:Scratch.ArgumentType.STRING,defaultValue:"slot1"} } },
          { opcode: "load", blockType: Scratch.BlockType.COMMAND, text: "load slot [SLOT]", arguments: { SLOT:{type:Scratch.ArgumentType.STRING,defaultValue:"slot1"} } },
          { opcode: "loadedData", blockType: Scratch.BlockType.REPORTER, text: "loaded data" },
          { opcode: "deleteSave", blockType: Scratch.BlockType.COMMAND, text: "delete save slot [SLOT]", arguments: { SLOT:{type:Scratch.ArgumentType.STRING,defaultValue:"slot1"} } },
          "---",
          { opcode: "submitScore", blockType: Scratch.BlockType.COMMAND, text: "submit score [SCORE] to leaderboard [NAME]", arguments: { SCORE:{type:Scratch.ArgumentType.NUMBER,defaultValue:0}, NAME:{type:Scratch.ArgumentType.STRING,defaultValue:"global"} } },
          { opcode: "refreshBoard", blockType: Scratch.BlockType.COMMAND, text: "refresh leaderboard [NAME]", arguments: { NAME:{type:Scratch.ArgumentType.STRING,defaultValue:"global"} } },
          { opcode: "rankScore", blockType: Scratch.BlockType.REPORTER, text: "score at rank [RANK] in leaderboard [NAME]", arguments: { RANK:{type:Scratch.ArgumentType.NUMBER,defaultValue:1}, NAME:{type:Scratch.ArgumentType.STRING,defaultValue:"global"} } },
          { opcode: "rankUser", blockType: Scratch.BlockType.REPORTER, text: "username at rank [RANK] in leaderboard [NAME]", arguments: { RANK:{type:Scratch.ArgumentType.NUMBER,defaultValue:1}, NAME:{type:Scratch.ArgumentType.STRING,defaultValue:"global"} } },
          "---",
          { opcode: "createRoom", blockType: Scratch.BlockType.COMMAND, text: "create room [ROOM]", arguments: { ROOM:{type:Scratch.ArgumentType.STRING,defaultValue:"lobby"} } },
          { opcode: "joinRoom", blockType: Scratch.BlockType.COMMAND, text: "join room [ROOM]", arguments: { ROOM:{type:Scratch.ArgumentType.STRING,defaultValue:"lobby"} } },
          { opcode: "leaveRoom", blockType: Scratch.BlockType.COMMAND, text: "leave room" },
          { opcode: "room", blockType: Scratch.BlockType.REPORTER, text: "current room" },
          { opcode: "sendEvent", blockType: Scratch.BlockType.COMMAND, text: "send event [EVENT] data [DATA]", arguments: { EVENT:{type:Scratch.ArgumentType.STRING,defaultValue:"move"}, DATA:{type:Scratch.ArgumentType.STRING,defaultValue:"{}"} } },
          { opcode: "eventHat", blockType: Scratch.BlockType.HAT, text: "when multiplayer event [EVENT] received", arguments: { EVENT:{type:Scratch.ArgumentType.STRING,defaultValue:"move"} } },
          { opcode: "eventPayload", blockType: Scratch.BlockType.REPORTER, text: "last event data" },
          { opcode: "eventPlayer", blockType: Scratch.BlockType.REPORTER, text: "last event player ID" },
          { opcode: "wsState", blockType: Scratch.BlockType.REPORTER, text: "multiplayer status" },
          "---",
          { opcode: "jsonValid", blockType: Scratch.BlockType.BOOLEAN, text: "JSON [TEXT] valid?", arguments: { TEXT:{type:Scratch.ArgumentType.STRING,defaultValue:"{}"} } },
          { opcode: "jsonPretty", blockType: Scratch.BlockType.REPORTER, text: "format JSON [TEXT]", arguments: { TEXT:{type:Scratch.ArgumentType.STRING,defaultValue:"{}"} } },
          { opcode: "clearCache", blockType: Scratch.BlockType.COMMAND, text: "clear local cache" }
        ]
      };
    }
    str(v) { return Cast.toString(v); }
    enc(v) { return encodeURIComponent(this.str(v).trim()); }
    async req(path, method="GET", body) {
      this.pending++;
      try {
        const headers={"Content-Type":"application/json"};
        if(this.token) headers.Authorization="Bearer "+this.token;
        const r=await fetch(this.api+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:"no-store"});
        const j=await r.json().catch(()=>({}));
        if(!r.ok) throw new Error(j.error||("HTTP "+r.status));
        this.ok=true; this.error=""; return j;
      } catch(e) { this.ok=false; this.error=e.message||String(e); throw e; }
      finally { this.pending=Math.max(0,this.pending-1); }
    }
    async connect(a) { try { this.api=this.str(a.URL).trim().replace(/\/+$/,""); this.project=this.str(a.PROJECT).trim()||"my-game"; await this.req("/v1/health"); this.state="connected"; } catch(e) { this.state="error"; } }
    disconnect() { this.leaveRoom(); this.token=""; this.userId=""; this.state="disconnected"; }
    state() { return this.state; }
    isConnected() { return this.state==="connected"; }
    lastError() { return this.error; }
    lastOK() { return this.ok; }
    pendingCount() { return this.pending; }
    async setValue(a) { try { const k=this.enc(a.KEY); const j=await this.req("/v1/projects/"+this.enc(this.project)+"/cloud/"+k,"PUT",{value:this.str(a.VALUE)}); this.cache[this.str(a.KEY).trim()]=String(j.value); } catch(e) {} }
    async fetchValue(a) { const k=this.str(a.KEY).trim(); try { const j=await this.req("/v1/projects/"+this.enc(this.project)+"/cloud/"+this.enc(k)); this.cache[k]=String(j.value); } catch(e) { if(e.message==="Cloud value not found") delete this.cache[k]; } }
    value(a) { return this.cache[this.str(a.KEY).trim()]??""; }
    exists(a) { return Object.prototype.hasOwnProperty.call(this.cache,this.str(a.KEY).trim()); }
    async deleteValue(a) { try { await this.req("/v1/projects/"+this.enc(this.project)+"/cloud/"+this.enc(a.KEY),"DELETE"); delete this.cache[this.str(a.KEY).trim()]; } catch(e) {} }
    async increment(a) { try { const k=this.str(a.KEY).trim(); const j=await this.req("/v1/projects/"+this.enc(this.project)+"/cloud/"+this.enc(k)+"/increment","POST",{amount:Number(a.AMOUNT)||0}); this.cache[k]=String(j.value); } catch(e) {} }
    async register(a) { try { const j=await this.req("/v1/auth/register","POST",{username:this.str(a.USER),password:this.str(a.PASS)}); this.token=j.token; this.userId=j.user.id; } catch(e) {} }
    async login(a) { try { const j=await this.req("/v1/auth/login","POST",{username:this.str(a.USER),password:this.str(a.PASS)}); this.token=j.token; this.userId=j.user.id; } catch(e) {} }
    logout() { this.token=""; this.userId=""; }
    loggedIn() { return !!this.token; }
    accountId() { return this.userId; }
    async save(a) { try { const data=JSON.parse(this.str(a.DATA)); await this.req("/v1/projects/"+this.enc(this.project)+"/saves/"+this.enc(a.SLOT),"PUT",{data}); } catch(e) { if(e instanceof SyntaxError) {this.ok=false;this.error="Save data must be valid JSON";} } }
    async load(a) { try { const j=await this.req("/v1/projects/"+this.enc(this.project)+"/saves/"+this.enc(a.SLOT)); this.data=JSON.stringify(j.data); } catch(e) { this.data=""; } }
    loadedData() { return this.data; }
    async deleteSave(a) { try { await this.req("/v1/projects/"+this.enc(this.project)+"/saves/"+this.enc(a.SLOT),"DELETE"); } catch(e) {} }
    async submitScore(a) { try { await this.req("/v1/projects/"+this.enc(this.project)+"/leaderboards/"+this.enc(a.NAME)+"/scores","POST",{score:Number(a.SCORE)}); } catch(e) {} }
    async refreshBoard(a) { const n=this.str(a.NAME); try { const j=await this.req("/v1/projects/"+this.enc(this.project)+"/leaderboards/"+this.enc(n)); this.board[n]=j.entries||[]; } catch(e) {this.board[n]=[];} }
    rankScore(a) { const x=(this.board[this.str(a.NAME)]||[])[Math.max(0,Math.floor(Number(a.RANK)||1)-1)]; return x?x.score:""; }
    rankUser(a) { const x=(this.board[this.str(a.NAME)]||[])[Math.max(0,Math.floor(Number(a.RANK)||1)-1)]; return x?x.username:""; }
    async createRoom(a) { await this._room(a.ROOM,true); }
    async joinRoom(a) { await this._room(a.ROOM,false); }
    async _room(name,create) {
      if(!this.token){this.ok=false;this.error="Log in first";return;}
      this.leaveRoom();
      const room=this.str(name).trim();
      try {
        await this.req("/v1/projects/"+this.enc(this.project)+"/rooms/"+this.enc(room)+(create?"/create":"/join"),"POST",{});
        const u=new URL(this.api);u.protocol=u.protocol==="https:"?"wss:":"ws:";u.pathname="/v1/ws";u.search="?project="+this.enc(this.project)+"&token="+this.enc(this.token);
        this.ws=new WebSocket(u); this.room=room;
        this.ws.onopen=()=>{this.ws.send(JSON.stringify({type:"join",room}));};
        this.ws.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.type==="event"){this.events.push({event:m.event,data:typeof m.data==="string"?m.data:JSON.stringify(m.data),player:m.playerId||""});this.eventData=this.events[this.events.length-1].data;this.eventPlayer=m.playerId||"";if(this.events.length>100)this.events.shift();}}catch(_){}};
      } catch(e) {}
    }
    leaveRoom() { if(this.ws)try{this.ws.close();}catch(e){} this.ws=null;this.room=""; }
    room() { return this.room; }
    sendEvent(a) { if(this.ws&&this.ws.readyState===1)this.ws.send(JSON.stringify({type:"event",event:this.str(a.EVENT),data:this.str(a.DATA)}));else{this.ok=false;this.error="Not connected to a room";} }
    eventHat(a) { const i=this.events.findIndex(x=>x.event===this.str(a.EVENT));if(i<0)return false;this.events.splice(i,1);return true; }
    eventPayload() { return this.eventData; }
    eventPlayer() { return this.eventPlayer; }
    wsState() { return this.ws?({0:"connecting",1:"connected",2:"closing",3:"disconnected"}[this.ws.readyState]||"unknown"):"disconnected"; }
    jsonValid(a) { try {JSON.parse(this.str(a.TEXT));return true;}catch(e){return false;} }
    jsonPretty(a) { try{return JSON.stringify(JSON.parse(this.str(a.TEXT)),null,2);}catch(e){return "";} }
    clearCache() { this.cache={}; }
  }
  Scratch.extensions.register(new BetterCloudData());
})(Scratch);
