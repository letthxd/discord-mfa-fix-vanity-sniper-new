import WebSocket from 'ws';
import https from 'https';
import extractJson from 'extract-json-string';
import fs from 'fs';
import config from './config.mjs';
let guilds = {}, lastSeq = null, hbInterval = null, mfaToken = null;
let lastMfaFileTime = 0;
const LOG_CHANNEL_ID = config.logChannelId || '';
const DISCORD_API_HOST = 'canary.discord.com';
const SNIPE_ATTEMPTS = 5; 
function safeExtract(d) {
  if (typeof d !== 'string') try { return JSON.stringify(d); } catch { return null; }
  try { return extractJson.extract(d); } catch { return null; }
}
function readMfaToken(force = false) {
  try {
    const stats = fs.statSync('mfachecklt9xupp.json');
    if (mfaToken && stats.mtimeMs <= lastMfaFileTime && !force) return mfaToken;    
    lastMfaFileTime = stats.mtimeMs;
    const data = fs.readFileSync('mfachecklt9xupp.json', 'utf8');
    const token = JSON.parse(data)?.token;
    if (token) {
      if (token !== mfaToken) {
        mfaToken = token;
        console.log(`Status: MFA bypassed`);
      } else {
        mfaToken = token;
      }
      return mfaToken;
    }
  } catch (e) { console.error("MFA TOKEN İS NOT READED:", e.message); }
  return mfaToken;
}
async function req(method, path, body = null, priority = 0) {
  return new Promise(resolve => {
    const options = {
      host: DISCORD_API_HOST,
      port: 443,
      path,
      method,
      headers: {
        'Authorization': config.token,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
        'X-Super-Properties': 'eyJvcyI6IldpbmRvd3MiLCJicm93c2VyIjoiRmlyZWZveCIsImRldmljZSI6IiIsInN5c3RlbV9sb2NhbGUiOiJ0ci1UUiIsImJyb3dzZXJfdXNlcl9hZ2VudCI6Ik1vemlsbGEvNS4wIChXaW5kb3dzIE5UIDEwLjA7IFdpbjY0OyB4NjQ7IHJ2OjEzMy4wKSBHZWNrby8yMDEwMDEwMSBGaXJlZm94LzEzMy4wIiwiYnJvd3Nlcl92ZXJzaW9uIjoiMTMzLjAiLCJvc192ZXJzaW9uIjoiMTAiLCJyZWZlcnJlciI6Imh0dHBzOi8vd3d3Lmdvb2dsZS5jb20vIiwicmVmZXJyaW5nX2RvbWFpbiI6Ind3dy5nb29nbGUuY29tIiwic2VhcmNoX2VuZ2luZSI6Imdvb2dsZSIsInJlZmVycmVyX2N1cnJlbnQiOiIiLCJyZWZlcnJpbmdfZG9tYWluX2N1cnJlbnQiOiIiLCJyZWxlYXNlX2NoYW5uZWwiOiJjYW5hcnkiLCJjbGllbnRfYnVpbGRfbnVtYmVyIjozNTYxNDAsImNsaWVudF9ldmVudF9zb3VyY2UiOm51bGwsImhhc19jbGllbnRfbW9kcyI6ZmFsc2V9'
      }
    };
    if (mfaToken) options.headers['X-Discord-MFA-Authorization'] = mfaToken;
    if (body) {
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }
    const request = https.request(options, (response) => {
      let data = '';
      response.on('data', (chunk) => data += chunk);
      response.on('end', () => {
        if (priority > 0) {
          console.log(`[${method} ${path}] Status: ${response.statusCode}`);
          sendLog(`[${method} ${path}] Status: ${response.statusCode}`);
        }       
        if (!path.includes('/vanity-url')) {
          const ext = safeExtract(data);
          if (ext) return resolve(ext);
        }
        return resolve(data);
      });
    });
    request.setTimeout(1000);
    request.on('error', () => resolve('{}'));
    request.on('timeout', () => { request.destroy(); resolve('{}'); });

    if (body) request.write(body);
    request.end();
  });
}
async function sendLog(message) {
  if (!LOG_CHANNEL_ID) return;
  try {
    const content = JSON.stringify({ content: `[${new Date().toLocaleString()}] ${message}` });
    await req("POST", `/api/v9/channels/${LOG_CHANNEL_ID}/messages`, content);
  } catch (e) {
    console.error("log gonderilemedi salak kanal id kontrol et:", e);
  }
}
async function captureVanity(vanityCode) {
  readMfaToken();
  if (!mfaToken) {
    console.log("MFA token yok, sniper calismiyor mal");
    sendLog("⚠️ MFA token yok, sniper calismiyor mal");
    return;
  }
  const body = JSON.stringify({ code: vanityCode });
  const requests = [];

  for (let i = 0; i < SNIPE_ATTEMPTS; i++) {
    requests.push(req("PATCH", `/api/v9/guilds/${config.serverid}/vanity-url`, body, 1));
  }
  try {
    const results = await Promise.all(requests); 
    let successCount = 0;
    results.forEach((result, i) => {
      try {
        const parsed = JSON.parse(result);
        if (parsed.code === vanityCode) successCount++;;
      } catch {
      }
    });  
    const message = successCount > 0 
      ? ` '${vanityCode}' snipledim reis` 
      : ` '${vanityCode}' alamadim amk`;
    
    console.log(message);
    sendLog(message);
  } catch (e) {
    console.error("fail veya baska bisi:", e);
  }
}
function connect() {
  req("GET", "/api/v9/gateway").then(res => {
    let url;
    try { url = JSON.parse(res)?.url; } catch {
      const ext = safeExtract(res);
      if (ext) try { url = JSON.parse(ext)?.url; } catch { }
    }    
    const ws = new WebSocket(url || "wss://gateway.discord.gg/?v=9&encoding=json"); 
    ws.on("open", () => {
      console.log("gateway connected");
      ws.send(JSON.stringify({
        op: 2,
        d: {
          token: config.token,
          intents: 513,
          properties: { os: "Windows", browser: "Discord.js", device: "Desktop" }
        }
      }));
    });    
    ws.on("message", async data => {
      try {
        let packet;
        try { 
          packet = typeof data === 'string' ? JSON.parse(data) : JSON.parse(data.toString()); 
        } catch { 
          const json = safeExtract(data.toString()); 
          if (json) packet = JSON.parse(json); 
          else return; 
        }       
        if (packet.s) lastSeq = packet.s;       
        if (packet.op === 10) {
          clearInterval(hbInterval);
          hbInterval = setInterval(() => ws.send(JSON.stringify({ op: 1, d: lastSeq })), packet.d.heartbeat_interval);
        }       
        if (packet.t === "READY") {
          packet.d.guilds.filter(g => g.vanity_url_code).forEach(g => guilds[g.id] = g.vanity_url_code);
          console.log("vanity urls:", Object.values(guilds).join(", "));
          sendLog(`listeng vanity urls: ${Object.values(guilds).join(", ")}`);
        }       
        if (packet.t === "GUILD_UPDATE") {
          const id = packet.d.id || packet.d.guild_id;
          const oldVanity = guilds[id];
          const newVanity = packet.d.vanity_url_code;          
          if (oldVanity && oldVanity !== newVanity) {
            console.log(` '${oldVanity}' snıpledım...`);
            await captureVanity(oldVanity);
          }
          
          if (newVanity) guilds[id] = newVanity;
          else if (guilds[id]) delete guilds[id];
        }
      } catch (e) { 
        console.error("vanitys load error", e);
      }
    });   
    ws.on("close", () => {
      clearInterval(hbInterval);
      setTimeout(connect, 5000);
    }); 
    ws.on("error", () => ws.close());
  }).catch(() => setTimeout(connect, 5000));
}
(async () => {
  console.log("DEVELOPED BY X3PP13X37");
  readMfaToken(true);
  connect();
  setInterval(() => readMfaToken(), 30000);
})();
process.on('uncaughtException', (err) => { 
});