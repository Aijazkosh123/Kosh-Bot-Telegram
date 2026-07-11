const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const fs = require("fs");
const http = require("http");

// ====== SETTINGS ======
const TOKEN = "8697588276:AAFbh583ctiL0h22q8WLbaGSX0zMRKWfAc8";
let API_KEY = "e4d8d1fc34eba7caa23d5eb5bace0022";
let API_URL = "https://cheappakpanel.com/api/v2";
const ADMIN_ID = 6362089364;
let RATE = 1.80;
const MIN_VOTE = 10;
const DEVELOPER = "Aijaz Kosh 03079257476";
const EASYPAISA = "03XX-XXXXXXX";
const JAZZCASH = "03077321978";
const DB_FILE = "./database.json";

// ====== DATA (disk-based, lifetime save) ======
const bot = new TelegramBot(TOKEN, { polling: true });
let wallet = {};
let userVotes = {};
let userState = {};
let pendingPayments = {};
let userOrders = {};
let userCustomPrice = {};
let userNames = {};
let blockedUsers = {};
let botOrderCounter = 1000;

let services = { "A": "14420", "B": "14421", "C": "14422", "D": "14423", "E": "14424" };
let customServices = {
  "C1": { name: "Custom 1", id: "0", price: 0.0 },
  "C2": { name: "Custom 2", id: "0", price: 0.0 }
};

// ====== DATABASE (lifetime disk save) ======
function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      var data = JSON.parse(fs.readFileSync(DB_FILE));
      wallet = data.wallet || {};
      userOrders = data.userOrders || {};
      userVotes = data.userVotes || {};
      userCustomPrice = data.userCustomPrice || {};
      userNames = data.userNames || {};
      blockedUsers = data.blockedUsers || {};
      RATE = data.RATE || 1.80;
      services = data.services || services;
      customServices = data.customServices || customServices;
      botOrderCounter = data.botOrderCounter || 1000;
      // Also load API_KEY and API_URL from DB if saved
      API_KEY = data.API_KEY || API_KEY;
      API_URL = data.API_URL || API_URL;
      console.log("DB Loaded | Users:", Object.keys(userNames).length, "| Blocked:", Object.keys(blockedUsers).length, "| Orders:", Object.values(userOrders).reduce(function(a,b){return a+b.length;},0));
    } else { console.log("New DB Created"); }
  } catch(e) { console.log("DB Load Error:", e.message); }
}
function saveDB() {
  try {
    var data = { wallet: wallet, userOrders: userOrders, userVotes: userVotes, userCustomPrice: userCustomPrice, userNames: userNames, blockedUsers: blockedUsers, RATE: RATE, services: services, customServices: customServices, botOrderCounter: botOrderCounter, API_KEY: API_KEY, API_URL: API_URL };
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    var backup = JSON.stringify(data);
    fs.writeFileSync(DB_FILE + ".backup", backup);
  } catch(e) { console.log("Save Error:", e.message); }
}

// Auto-save every 30 seconds + load on start
setInterval(saveDB, 30000);
loadDB();

// Recover from backup if main DB is empty
if (Object.keys(wallet).length === 0 && fs.existsSync(DB_FILE + ".backup")) {
  try {
    var backupData = JSON.parse(fs.readFileSync(DB_FILE + ".backup"));
    if (Object.keys(backupData.wallet || {}).length > 0) {
      console.log("RECOVERING FROM BACKUP...");
      wallet = backupData.wallet || {};
      userOrders = backupData.userOrders || {};
      userVotes = backupData.userVotes || {};
      userCustomPrice = backupData.userCustomPrice || {};
      userNames = backupData.userNames || {};
      blockedUsers = backupData.blockedUsers || {};
      botOrderCounter = backupData.botOrderCounter || 1000;
      API_KEY = backupData.API_KEY || API_KEY;
      API_URL = backupData.API_URL || API_URL;
      saveDB();
    }
  } catch(e) { console.log("Backup recovery failed"); }
}

// ====== AUTO ORDER STATUS CHECKER ======
setInterval(async function() {
  for (var userId in userOrders) {
    for (var o of userOrders[userId]) {
      if (o.status !== "Completed" && o.status !== "Canceled" && o.status !== "Error") {
        try {
          var p = new URLSearchParams();
          p.append("key", API_KEY); p.append("action", "status"); p.append("order", o.smmOrderId);
          var r = await axios.post(API_URL, p);
          var ns = r.data.status || r.data;
          if (ns && ns !== o.status) {
            o.status = ns; saveDB();
            if (ns === "Completed") {
              bot.sendMessage(userId, "✅ *Order Completed*\n\nBot ID: `" + o.botOrderId + "`\nSMM ID: `" + o.smmOrderId + "`\nService: " + o.service + "\nQty: " + o.qty + "\nPrice: Rs " + o.price.toFixed(2), { parse_mode: "Markdown" });
              bot.sendMessage(ADMIN_ID, "✅ *Order Completed*\n\nUser: " + (userNames[userId] || userId) + "\nBot ID: `" + o.botOrderId + "`\nAmount: Rs " + o.price.toFixed(2), { parse_mode: "Markdown" });
            }
            if (ns === "Canceled" || ns === "Error" || String(ns).includes("Error")) {
              wallet[userId] = (wallet[userId] || 0) + o.price;
              userVotes[userId] = (userVotes[userId] || 0) - o.qty;
              saveDB();
              bot.sendMessage(userId, "❌ *Order Failed - Refunded*\n\nBot ID: `" + o.botOrderId + "`\nReason: " + ns + "\nRefund: Rs " + o.price.toFixed(2) + "\nBalance: Rs " + wallet[userId].toFixed(2), { parse_mode: "Markdown" });
            }
          }
        } catch(e) { console.log("Status err:", e.message) }
      }
    }
  }
}, 120000);

function sendKb(cid, txt, btns) {
  return bot.sendMessage(cid, txt, { parse_mode: "Markdown", reply_markup: { keyboard: btns, resize_keyboard: true } });
}

// ====== MENUS ======
var mm = [["🗳 New Vote Order", "🛒 Custom Service"], ["💰 Balance", "📦 Order Status"], ["💳 Add Balance"], ["👨‍💻 " + DEVELOPER]];
var am = [["👥 All Users"], ["💰 Users Balance"], ["📋 Pending Payments"], ["📦 All Orders"], ["🚫 Blocked Users"], ["⚙️ Settings", "🔧 Custom Service Setting"], ["🔑 Change API Key", "🌐 Change API URL"], ["⬅️ Back"]];
var sm = [["⚙️ Set Rate", "💰 Set User Price"], ["💸 Remove Balance", "🚫 Block User / ✅ Unblock"], ["🔧 Change Service ID"], ["🔑 Change API Key", "🌐 Change API URL"], ["⬅️ Back"]];
var svm = [["A - Answer 1", "B - Answer 2"], ["C - Answer 3", "D - Answer 4"], ["E - Answer 5"], ["⬅️ Back"]];
var cm = [["🛒 " + customServices.C1.name, "🛒 " + customServices.C2.name], ["⬅️ Back"]];

// ====== /START ======
bot.onText(/\/start/, function(msg) {
  var cid = msg.chat.id;

  // Check if user is blocked
  if (blockedUsers[cid]) {
    return bot.sendMessage(cid, "🚫 *You are blocked from using this bot.*\nContact admin: " + DEVELOPER, { parse_mode: "Markdown" });
  }

  userNames[cid] = msg.from.first_name + (msg.from.last_name ? " " + msg.from.last_name : "");
  saveDB();
  if (cid == ADMIN_ID) {
    return sendKb(cid, "👑 *Admin Panel*\n\nDefault Rate: Rs " + RATE + " per Vote\nAPI URL: " + API_URL + "\nTotal Users: " + Object.keys(userNames).length + "\nBlocked: " + Object.keys(blockedUsers).length, am);
  }
  var cr = userCustomPrice[cid] || RATE;
  sendKb(cid, "🤖 *Welcome to SMM Bot*\n\nVote Rate: Rs " + cr + " per Vote\nCustom: Rs " + customServices.C1.price + " | Rs " + customServices.C2.price, mm);
});

// ====== ADMIN COMMANDS ======
bot.onText(/\/addbalance (.+) (.+)/, function(msg, match) {
  if (msg.chat.id != ADMIN_ID) return;
  var uid = match[1]; var amt = parseFloat(match[2]);
  wallet[uid] = (wallet[uid] || 0) + amt; saveDB();
  bot.sendMessage(ADMIN_ID, "✅ Rs " + amt + " added to " + (userNames[uid] || uid) + "\nNew Balance: Rs " + wallet[uid].toFixed(2));
  bot.sendMessage(uid, "✅ Rs " + amt + " has been added to your account.\nNew Balance: Rs " + wallet[uid].toFixed(2));
});

bot.onText(/\/removebalance (.+) (.+)/, function(msg, match) {
  if (msg.chat.id != ADMIN_ID) return;
  var uid = match[1]; var amt = parseFloat(match[2]);
  wallet[uid] = Math.max(0, (wallet[uid] || 0) - amt); saveDB();
  bot.sendMessage(ADMIN_ID, "✅ Rs " + amt + " removed from " + (userNames[uid] || uid) + "\nNew Balance: Rs " + wallet[uid].toFixed(2));
  bot.sendMessage(uid, "⚠️ Rs " + amt + " has been removed from your account.\nNew Balance: Rs " + wallet[uid].toFixed(2));
});

bot.onText(/\/block (.+)/, function(msg, match) {
  if (msg.chat.id != ADMIN_ID) return;
  var uid = match[1].trim();
  blockedUsers[uid] = true; saveDB();
  bot.sendMessage(ADMIN_ID, "🚫 User " + uid + " (" + (userNames[uid]||"Unknown") + ") has been BLOCKED.");
});

bot.onText(/\/unblock (.+)/, function(msg, match) {
  if (msg.chat.id != ADMIN_ID) return;
  var uid = match[1].trim();
  delete blockedUsers[uid]; saveDB();
  bot.sendMessage(ADMIN_ID, "✅ User " + uid + " (" + (userNames[uid]||"Unknown") + ") has been UNBLOCKED.");
});

bot.onText(/\/setprice (.+) (.+)/, function(msg, match) {
  if (msg.chat.id != ADMIN_ID) return;
  var uid = match[1]; var pr = parseFloat(match[2]);
  userCustomPrice[uid] = pr; saveDB();
  bot.sendMessage(ADMIN_ID, "✅ Price set for " + uid + ": Rs " + pr);
  bot.sendMessage(uid, "Your rate changed to Rs " + pr + " per vote.");
});

bot.onText(/\/setcustom (.+) (.+) (.+) (.+)/, function(msg, match) {
  if (msg.chat.id != ADMIN_ID) return;
  var w = match[1].toUpperCase();
  if (!customServices[w]) return bot.sendMessage(ADMIN_ID, "❌ Use C1 or C2");
  customServices[w].name = match[2]; customServices[w].id = match[3]; customServices[w].price = parseFloat(match[4]); saveDB();
  bot.sendMessage(ADMIN_ID, "✅ " + w + " Updated\nName: " + customServices[w].name + "\nID: " + customServices[w].id + "\nRs " + customServices[w].price);
});

// ====== MAIN HANDLER ======
bot.on("message", async function(msg) {
  var cid = msg.chat.id; var txt = msg.text; if (!txt) return;

  // BLOCK CHECK
  if (cid != ADMIN_ID && blockedUsers[cid]) {
    return bot.sendMessage(cid, "🚫 *You are blocked from using this bot.*\nContact admin: " + DEVELOPER, { parse_mode: "Markdown" });
  }

  // ====== ADMIN PANEL ======
  if (cid == ADMIN_ID) {
    if (txt.includes("All Users")) {
      var users = Object.keys(userNames);
      if (!users.length) return bot.sendMessage(ADMIN_ID, "❌ No users.");
      var l = "👥 *All Users (" + users.length + ")*\n\n";
      users.forEach(function(id) {
        var blocked = blockedUsers[id] ? " 🚫BLOCKED" : "";
        l += "👤 " + userNames[id] + blocked + "\nID: `" + id + "`\nBalance: Rs " + (wallet[id]||0).toFixed(2) + "\nVotes: " + (userVotes[id]||0) + "\n\n";
      });
      return bot.sendMessage(ADMIN_ID, l, { parse_mode: "Markdown" });
    }
    if (txt.includes("Users Balance")) {
      var users = Object.keys(wallet);
      if (!users.length) return bot.sendMessage(ADMIN_ID, "❌ No balances.");
      var l = "💰 *All Balances*\n\n"; var total = 0;
      users.forEach(function(id) { var b = wallet[id]||0; total += b; l += "👤 " + (userNames[id]||id) + "\nRs " + b.toFixed(2) + "\n\n"; });
      l += "*Total: Rs " + total.toFixed(2) + "*";
      return bot.sendMessage(ADMIN_ID, l, { parse_mode: "Markdown" });
    }
    if (txt.includes("Pending Payments")) {
      var p = Object.keys(pendingPayments);
      if (!p.length) return bot.sendMessage(ADMIN_ID, "❌ No pending.");
      var l = "📋 *Pending Payments*\n\n";
      p.forEach(function(id) { l += "👤 " + (userNames[id]||id) + "\nID: `" + id + "`\nRs " + pendingPayments[id] + "\n\n"; });
      return bot.sendMessage(ADMIN_ID, l, { parse_mode: "Markdown" });
    }
    if (txt.includes("All Orders")) {
      var u = Object.keys(userOrders);
      if (!u.length) return bot.sendMessage(ADMIN_ID, "❌ No orders.");
      var l = "📦 *All Orders*\n\n";
      u.forEach(function(id) {
        var orders = userOrders[id] || [];
        var completed = orders.filter(function(o){return o.status==="Completed";}).length;
        var pending = orders.filter(function(o){return o.status!=="Completed"&&o.status!=="Canceled"&&o.status!=="Error";}).length;
        l += "👤 " + (userNames[id]||id) + "\nTotal: " + orders.length + " | ✅" + completed + " ⏳" + pending + "\n\n";
      });
      return bot.sendMessage(ADMIN_ID, l, { parse_mode: "Markdown" });
    }
    if (txt.includes("Blocked Users")) {
      var blocked = Object.keys(blockedUsers);
      if (!blocked.length) return bot.sendMessage(ADMIN_ID, "✅ No blocked users.");
      var l = "🚫 *Blocked Users (" + blocked.length + ")*\n\n";
      blocked.forEach(function(id) { l += "👤 " + (userNames[id]||"Unknown") + "\nID: `" + id + "`\n\n"; });
      l += "\n/unblock USER_ID to unblock";
      return bot.sendMessage(ADMIN_ID, l, { parse_mode: "Markdown" });
    }
    if (txt.includes("Settings")) {
      return sendKb(ADMIN_ID, "⚙️ *Admin Settings*\n\nRate: Rs " + RATE + "\nAPI Key: `" + API_KEY.substring(0, 10) + "...`\nAPI URL: `" + API_URL + "`\nA=" + services.A + " B=" + services.B + " C=" + services.C + " D=" + services.D + " E=" + services.E, sm);
    }
    if (txt.includes("Custom Service Setting")) {
      var c1s = (customServices.C1.id && customServices.C1.id !== "0") ? "✅ Active" : "❌ NOT SET";
      var c2s = (customServices.C2.id && customServices.C2.id !== "0") ? "✅ Active" : "❌ NOT SET";
      return bot.sendMessage(ADMIN_ID, "🔧 *Custom Services*\n\nC1: " + customServices.C1.name + " | ID: `" + customServices.C1.id + "` | Rs " + customServices.C1.price + " | " + c1s + "\nC2: " + customServices.C2.name + " | ID: `" + customServices.C2.id + "` | Rs " + customServices.C2.price + " | " + c2s + "\n\n/setcustom C1 NAME ID PRICE", { parse_mode: "Markdown" });
// (old line replaced above)
    }
    if (txt.includes("Back")) return sendKb(ADMIN_ID, "👑 *Admin Panel*", am);
    // CHANGE API KEY (from main menu)
    if (txt === "🔑 Change API Key") { userState[cid] = { step: "apikey" }; return bot.sendMessage(ADMIN_ID, "🔑 Current API Key: `" + API_KEY + "`\n\nEnter new API Key:", { parse_mode: "Markdown" }); }
    // CHANGE API URL (from main menu)
    if (txt === "🌐 Change API URL") { userState[cid] = { step: "apiurl" }; return bot.sendMessage(ADMIN_ID, "🌐 Current API URL: `" + API_URL + "`\n\nEnter new API URL:", { parse_mode: "Markdown" }); }

    // Settings sub-menu states
    if (txt.includes("Set Rate")) { userState[cid] = { step: "setrate" }; return bot.sendMessage(ADMIN_ID, "Current Rate: Rs " + RATE + "\n\nEnter new rate:"); }
    if (txt.includes("Set User Price")) { userState[cid] = { step: "setuserprice" }; return bot.sendMessage(ADMIN_ID, "Enter: USER_ID AMOUNT\nExample: 123456789 1.50"); }
    if (txt.includes("Remove Balance")) { userState[cid] = { step: "removebalance" }; return bot.sendMessage(ADMIN_ID, "Enter: USER_ID AMOUNT\nExample: 123456789 100\n\nThis will DEDUCT balance from user."); }
    if (txt.includes("Block User")) { userState[cid] = { step: "blockuser" }; return bot.sendMessage(ADMIN_ID, "Enter User ID to BLOCK:\n\nOr use command: /block USER_ID"); }
    if (txt.includes("Unblock")) { userState[cid] = { step: "unblockuser" }; return bot.sendMessage(ADMIN_ID, "Enter User ID to UNBLOCK:\n\nOr use command: /unblock USER_ID"); }
    if (txt.includes("Change Service ID")) { userState[cid] = { step: "cs" }; return bot.sendMessage(ADMIN_ID, "Current: A=" + services.A + " B=" + services.B + " C=" + services.C + " D=" + services.D + " E=" + services.E + "\n\nFormat: A 14420"); }
  }

  // ====== ADMIN STATE HANDLERS ======
  if (userState[cid] && userState[cid].step === "setrate" && cid == ADMIN_ID) {
    var r = parseFloat(txt); if (isNaN(r) || r <= 0) return bot.sendMessage(ADMIN_ID, "❌ Invalid rate. Enter a positive number.");
    RATE = r; delete userState[cid]; saveDB(); return sendKb(ADMIN_ID, "✅ Rate updated to: Rs " + RATE + " per Vote", sm);
  }
  if (userState[cid] && userState[cid].step === "setuserprice" && cid == ADMIN_ID) {
    var parts = txt.split(" "); var uid = parts[0]; var pr = parseFloat(parts[1]);
    if (!uid || isNaN(pr)) return bot.sendMessage(ADMIN_ID, "❌ Format: ID AMOUNT");
    userCustomPrice[uid] = pr; delete userState[cid]; saveDB();
    bot.sendMessage(ADMIN_ID, "✅ Price for " + uid + ": Rs " + pr);
    bot.sendMessage(uid, "Your rate changed to Rs " + pr + ".");
    return sendKb(ADMIN_ID, "👑 *Admin Panel*", am);
  }
  if (userState[cid] && userState[cid].step === "removebalance" && cid == ADMIN_ID) {
    var parts = txt.split(" "); var uid = parts[0]; var amt = parseFloat(parts[1]);
    if (!uid || isNaN(amt)) return bot.sendMessage(ADMIN_ID, "❌ Format: ID AMOUNT");
    wallet[uid] = Math.max(0, (wallet[uid]||0) - amt); delete userState[cid]; saveDB();
    bot.sendMessage(ADMIN_ID, "✅ Removed Rs " + amt + " from " + (userNames[uid]||uid) + "\nBalance: Rs " + (wallet[uid]||0).toFixed(2));
    bot.sendMessage(uid, "⚠️ Rs " + amt + " removed from your account.\nBalance: Rs " + (wallet[uid]||0).toFixed(2));
    return sendKb(ADMIN_ID, "👑 *Admin Panel*", am);
  }
  if (userState[cid] && userState[cid].step === "blockuser" && cid == ADMIN_ID) {
    blockedUsers[txt.trim()] = true; delete userState[cid]; saveDB();
    return sendKb(ADMIN_ID, "🚫 User " + txt.trim() + " BLOCKED.", am);
  }
  if (userState[cid] && userState[cid].step === "unblockuser" && cid == ADMIN_ID) {
    delete blockedUsers[txt.trim()]; delete userState[cid]; saveDB();
    return sendKb(ADMIN_ID, "✅ User " + txt.trim() + " UNBLOCKED.", am);
  }
  if (userState[cid] && userState[cid].step === "cs" && cid == ADMIN_ID) {
    var parts = txt.split(" "); var key = (parts[0]||"").toUpperCase(); var newId = parts[1];
    if (!services[key] || !newId) return bot.sendMessage(ADMIN_ID, "❌ Format: A 14420");
    services[key] = newId; delete userState[cid]; saveDB(); return sendKb(ADMIN_ID, "✅ " + key + " = " + newId, sm);
  }
  if (userState[cid] && userState[cid].step === "apikey" && cid == ADMIN_ID) {
    var nk = txt.trim(); if (!nk || nk.length < 5) return bot.sendMessage(ADMIN_ID, "❌ Invalid key — too short.");
    API_KEY = nk;
    var ic = fs.readFileSync("./index.js", "utf8");
    ic = ic.replace(/let API_KEY = "[^"]*"/, 'let API_KEY = "' + nk + '"');
    fs.writeFileSync("./index.js", ic);
    console.log("API Key changed: " + nk.substring(0, 8) + "...");
    delete userState[cid]; saveDB();
    return sendKb(ADMIN_ID, "🔑 API Key updated! New: `" + nk.substring(0, 10) + "...`", am);
  }
  if (userState[cid] && userState[cid].step === "apiurl" && cid == ADMIN_ID) {
    var nu = txt.trim();
    if (!nu || (!nu.startsWith("http://") && !nu.startsWith("https://")))
      return bot.sendMessage(ADMIN_ID, "❌ Invalid URL. Must start with http:// or https://");
    // Remove trailing slash for consistency
    if (nu.endsWith("/")) nu = nu.slice(0, -1);
    API_URL = nu;
    var ic = fs.readFileSync("./index.js", "utf8");
    ic = ic.replace(/let API_URL = "[^"]*"/, 'let API_URL = "' + nu + '"');
    fs.writeFileSync("./index.js", ic);
    console.log("API URL changed: " + nu);
    delete userState[cid]; saveDB();
    return sendKb(ADMIN_ID, "🌐 API URL updated!\nNew: `" + nu + "`\n\n⚠️ Restart bot to apply.", am);
  }

  // ====== APPROVE/REJECT ======
  if (cid == ADMIN_ID) {
    if (txt.startsWith("✅ Approve")) {
      var uid = txt.split(" ")[2]; var amt = pendingPayments[uid];
      if (amt) { wallet[uid] = (wallet[uid]||0) + amt; delete pendingPayments[uid]; saveDB(); bot.sendMessage(uid, "✅ Rs " + amt + " approved!\nBalance: Rs " + wallet[uid].toFixed(2)); return sendKb(ADMIN_ID, "✅ Done", am); }
    }
    if (txt.startsWith("❌ Reject")) { delete pendingPayments[txt.split(" ")[2]]; return sendKb(ADMIN_ID, "❌ Rejected", am); }
  }

  // ====== USER COMMANDS ======
  if (txt.includes("Balance") && !txt.includes("Add") && !txt.includes("Users")) {
    var bal = wallet[cid]||0; var rate = userCustomPrice[cid]||RATE;
    return bot.sendMessage(cid, "💰 *Your Account*\n\nBalance: Rs " + bal.toFixed(2) + "\nTotal Votes: " + (userVotes[cid]||0) + "\nRate: Rs " + rate, { parse_mode: "Markdown" });
  }

  if (txt.includes("Add Balance")) { userState[cid] = { step: "pay" }; return bot.sendMessage(cid, "💳 *Add Balance*\n\n📱 Easypaisa: `" + EASYPAISA + "`\n📱 JazzCash: `" + JAZZCASH + "`\n\nSend: TXN_ID AMOUNT\nMin: Rs 100", { parse_mode: "Markdown" }); }

  if (userState[cid] && userState[cid].step === "pay") {
    var parts = txt.split(" "); var tx = parts[0]; var amt = parseFloat(parts[1]);
    if (!amt || amt < 100) return bot.sendMessage(cid, "❌ Min 100. Format: TXN_ID AMOUNT");
    pendingPayments[cid] = amt;
    bot.sendMessage(ADMIN_ID, "💰 *New Payment*\n\n" + (userNames[cid]||cid) + "\nID: `" + cid + "`\nTXN: `" + tx + "`\nRs " + amt, { parse_mode: "Markdown", reply_markup: { keyboard: [["✅ Approve " + cid], ["❌ Reject " + cid]], resize_keyboard: true } });
    delete userState[cid]; return sendKb(cid, "✅ Sent. Admin will verify.", mm);
  }

  if (txt.includes("New Vote Order")) { return sendKb(cid, "📋 *Select Vote Service*\nRate: Rs " + (userCustomPrice[cid]||RATE) + " | Min: " + MIN_VOTE, svm); }
  if (txt.includes("Answer") || txt.includes("Option")) { var o = txt.split(" ")[0]; userState[cid] = { svc: services[o], sn: "Vote " + o, ty: "vote", step: "link" }; return bot.sendMessage(cid, "📎 Send poll link:"); }

  if (txt.includes("Custom Service") && !txt.includes("Setting")) {
    var c1ok = (customServices.C1.id && customServices.C1.id !== "0") ? " ✅" : " ⚠️";
    var c2ok = (customServices.C2.id && customServices.C2.id !== "0") ? " ✅" : " ⚠️";
    return sendKb(cid, "🛒 *Custom Services*\n\nC1:" + c1ok + " " + customServices.C1.name + " - Rs " + customServices.C1.price + "/1000\nC2:" + c2ok + " " + customServices.C2.name + " - Rs " + customServices.C2.price + "/1000\nMin: " + MIN_VOTE + "\n\n⚠️ = Not configured", cm);
  }
  if (txt.includes("🛒") && (txt.includes(customServices.C1.name) || txt.includes("C1"))) {
    if (!customServices.C1.id || customServices.C1.id === "0") return bot.sendMessage(cid, "❌ C1 Service Not Configured");
    userState[cid] = { svc: customServices.C1.id, sn: customServices.C1.name, ty: "custom", step: "link", csKey: "C1" };
    return bot.sendMessage(cid, "📎 Send link for " + customServices.C1.name + ":");
  }
  if (txt.includes("🛒") && (txt.includes(customServices.C2.name) || txt.includes("C2"))) {
    if (!customServices.C2.id || customServices.C2.id === "0") return bot.sendMessage(cid, "❌ C2 Service Not Configured");
    userState[cid] = { svc: customServices.C2.id, sn: customServices.C2.name, ty: "custom", step: "link", csKey: "C2" };
    return bot.sendMessage(cid, "📎 Send link for " + customServices.C2.name + ":");
  }

  if (userState[cid] && userState[cid].step === "link") { userState[cid].link = txt; userState[cid].step = "qty"; return bot.sendMessage(cid, "🔢 Min: " + MIN_VOTE); }

  if (userState[cid] && userState[cid].step === "qty") {
    var qty = parseInt(txt); if (isNaN(qty) || qty < MIN_VOTE) return bot.sendMessage(cid, "❌ Min " + MIN_VOTE);
    var rate;
    if (userState[cid].ty === "vote") {
      rate = userCustomPrice[cid] || RATE;
    } else {
      // Custom service — use the custom service's own price
      var csKey = userState[cid].csKey || (userState[cid].sn.includes("C1") ? "C1" : "C2");
      rate = customServices[csKey].price;
    }
    var price = userState[cid].ty === "vote" ? qty * rate : (qty / 1000) * rate;
    var bal = wallet[cid] || 0;
    if (bal < price) { delete userState[cid]; return sendKb(cid, "❌ Need Rs " + price.toFixed(2) + "\nBalance: Rs " + bal.toFixed(2), mm); }
    wallet[cid] -= price; userVotes[cid] = (userVotes[cid] || 0) + qty; botOrderCounter++; var oid = "BOT" + botOrderCounter;
    try {
      var params = new URLSearchParams(); params.append("key", API_KEY); params.append("action", "add"); params.append("service", userState[cid].svc); params.append("link", userState[cid].link); params.append("quantity", String(qty));
      var res = await axios.post(API_URL, params);
      if (res.data.order) {
        if (!userOrders[cid]) userOrders[cid] = [];
        userOrders[cid].push({ botOrderId: oid, smmOrderId: res.data.order, service: userState[cid].sn, link: userState[cid].link, qty: qty, price: price, rate: rate, status: "Pending" });
        saveDB();
        bot.sendMessage(cid, "✅ *Order Placed!*\n\nBot ID: `" + oid + "`\nSMM ID: `" + res.data.order + "`\n" + userState[cid].sn + "\nQty: " + qty + "\nRs " + price.toFixed(2) + "\nBalance: Rs " + wallet[cid].toFixed(2), { parse_mode: "Markdown" });
        delete userState[cid]; return sendKb(cid, "🏠 Menu", mm);
      } else { wallet[cid] += price; userVotes[cid] -= qty; botOrderCounter--; saveDB(); delete userState[cid]; return sendKb(cid, "❌ Failed. Refunded.", mm); }
    } catch(e) { wallet[cid] += price; userVotes[cid] -= qty; botOrderCounter--; saveDB(); delete userState[cid]; return sendKb(cid, "❌ Error. Refunded.", mm); }
  }

  if (txt.includes("Order Status")) { userState[cid] = { step: "sts" }; return bot.sendMessage(cid, "🆔 Enter Bot ID or SMM ID:"); }
  if (userState[cid] && userState[cid].step === "sts") {
    delete userState[cid];
    var order = (userOrders[cid]||[]).find(function(o){return o.botOrderId===txt||o.smmOrderId==txt;});
    if (!order) return sendKb(cid, "❌ Not found.", mm);
    return sendKb(cid, "📦 Bot: `" + order.botOrderId + "`\nSMM: `" + order.smmOrderId + "`\n" + order.service + "\nQty: " + order.qty + "\nRs " + order.price + "\nStatus: *" + (order.status||"Pending") + "*", mm);
  }

  if (txt.includes(DEVELOPER)) return bot.sendMessage(cid, "👨‍💻 *" + DEVELOPER + "*");
  if (txt.includes("Back")) { delete userState[cid]; return cid == ADMIN_ID ? sendKb(cid, "👑 *Admin Panel*", am) : sendKb(cid, "🏠 *Main Menu*", mm); }
});

// ====== HEALTH SERVER ======
var PORT = process.env.PORT || 3000;
http.createServer(function(_, res) { res.writeHead(200, {"Content-Type":"text/plain"}); res.end("Kosh Bot OK"); }).listen(PORT, function(){ console.log("Health port " + PORT); });

console.log("✅ Kosh Bot v3 Started — API Key + API URL Configurable + DB Persistent");
