const express = require("express");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const LRU = require("lru-cache");

const dashboardCache = new LRU.LRUCache({
  max: 500,
  ttl: 1000 * 60 * 5, // Cache for 5 min
});

const parcelCache = new LRU.LRUCache({
  max: 500,
  ttl: 1000 * 60 * 5, // Cache for 5 min
});

const locationsCache = new LRU.LRUCache({
  max: 10,
  ttl: 1000 * 60 * 5, // 5 min
});

const accountCache = new LRU.LRUCache({
  max: 500,
  ttl: 1000 * 60 * 2, // 2 min cache (you can adjust)
});
const session = require("express-session");
const MongoStore = require("connect-mongo");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const bodyParser = require("body-parser");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const Locker = require("./models/locker.js");
const Locker1 = require("./models/Locker/LockerUpdated.js");
const DropLocation = require("./models/Locker/DropLocation.js");
const Parcel1 = require("./models/ParcelUpdated.js");
const Parcel2 = require("./models/parcel2Updated.js");
const User = require("./models/User/UserUpdated.js");
const Courier = require("./models/Courier.js");
const Parcel = require("./models/Parcel");

const app = express();
const PORT = 3030;
const Razorpay = require("razorpay");
const crypto = require("crypto");
const ejsMate = require("ejs-mate");
const flash = require("connect-flash");
const expressLayouts = require("express-ejs-layouts");
const MONGO_URI =
  "mongodb+srv://vivekkaushik2005:0OShH2EJiRwMSt4m@cluster0.vaqwvzd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const QRCode = require("qrcode");
require("dotenv").config();
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { sendOTP } = require("./twilio.js");
const locker = require("./models/locker.js");
const compression = require("compression");
app.use(compression());
require("dotenv").config();
const server = http.createServer(app);
const io = new Server(server);

// Set up a cache for rendered HTML

//const { client, serviceSid } = require("./twilio");

// const razorpay = new Razorpay({
//   key_id: process.env.RAZORPAY_KEY_ID,
//   key_secret: process.env.RAZORPAY_KEY_SECRET,
// });

app.engine("ejs", ejsMate); // Set ejs-mate as the EJS engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static("public"));

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

app.use(
  session({
    secret: "heeeheheah", // replace with env var in prod
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: MONGO_URI,
      ttl: 60 * 60 * 24 * 7, // Session TTL in seconds (7 days)
    }),
    cookie: {
      maxAge: 30000 * 60 * 60 * 24, // 1 day
    },
  })
);

app.use(flash());

app.use((req, res, next) => {
  res.locals.messages = {
    success: req.flash("success"),
    error: req.flash("error"),
  };
  next();
});
app.use((req, res, next) => {
  if (req.session.user) req.user = req.session.user;
  next();
});

app.use((req, res, next) => {
  if (req.session.user) req.user = req.session.user;
  next();
});
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});
app.use((req, res, next) => {
  if (req.session.user) {
    req.user = req.session.user;
  }
  next();
});

app.use(passport.initialize());
app.use(passport.session());
passport.serializeUser((user, done) => {
  done(null, user.id); // user._id
});

passport.deserializeUser(async (id, done) => {
  const user = await User.findById(id);
  done(null, user);
});

function getDistanceFromLatLonInM(lat1, lon1, lat2, lon2) {
  function deg2rad(deg) {
    return deg * (Math.PI / 180);
  }
  const R = 6371e3; // Earth's radius in meters
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

app.post("/api/nearest-locker", async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    if (!latitude || !longitude) {
      return res
        .status(400)
        .json({ success: false, message: "Missing coordinates" });
    }

    // Fetch all lockers
    const lockers = await Locker.find({});

    if (!lockers.length) {
      return res
        .status(404)
        .json({ success: false, message: "No lockers available" });
    }

    // Find the nearest locker
    let nearestLocker = null;
    let minDistance = Infinity;

    lockers.forEach((locker) => {
      if (
        !locker.location ||
        locker.location.lat == null ||
        locker.location.lng == null
      )
        return;

      const dist = getDistanceFromLatLonInM(
        latitude,
        longitude,
        locker.location.lat,
        locker.location.lng
      );

      if (dist < minDistance) {
        minDistance = dist;
        nearestLocker = locker;
      }
    });

    if (!nearestLocker) {
      return res.status(404).json({
        success: false,
        message: "No lockers with valid location data",
      });
    }

    return res.json({
      success: true,
      locker: {
        lockerId: nearestLocker.lockerId,
        address: nearestLocker.location.address,
        coordinates: {
          lat: nearestLocker.location.lat,
          lng: nearestLocker.location.lng,
        },
        totalCompartments: nearestLocker.compartments.length,
        availableCompartments: nearestLocker.compartments.filter(
          (c) => !c.isBooked
        ).length,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get("/", async(req, res) => {
  const lockers = await Locker.find();
  res.render("lockerEmu",{lockers});
});

app.get("/locker/emulator/:lockerId", async (req, res) => {
  try {
    const locker = await Locker.findOne({ lockerId: req.params.lockerId });
    let scannerActive = true;
    if (!locker) {
      scannerActive = false;
      // Render a "not found" page
      return res.render("lockerNotFound.ejs", {
        lockerId: req.params.lockerId,
      });
    }

    const compartments = locker.compartments;
    const { lockerId } = req.params;
    res.render("newlocker.ejs", { lockerId, compartments, scannerActive });
  } catch (err) {
    scannerActive = false;
    res.status(500).json({ message: "Server error", error: err });
  }
});
const twilio = require("twilio");

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);






function buildKerongUnlockPacket(compartmentId = 0x00, addr = 0x00) {
  const STX = 0x02;
  const CMD = 0x81;
  const ASK = 0x00;
  const DATALEN = 0x00;
  const ETX = 0x03;

  const LOCKNUM = compartmentId; // 0x00 to 0x0B (for 12 lockers)
  const bytes = [STX, addr, LOCKNUM, CMD, ASK, DATALEN, ETX];

  // ✅ Calculate checksum (last byte)
  const checksum = bytes.reduce((sum, byte) => sum + byte, 0) & 0xFF;
  bytes.push(checksum);

  return Buffer.from(bytes);
}



function parseKerongUnlockPacket(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    buffer = Buffer.from(buffer);
  }

  if (buffer.length !== 8) {
    return { error: "Invalid packet length. Expected 8 bytes." };
  }

  const [STX, ADDR, LOCKNUM, CMD, ASK, DATALEN, ETX, SUM] = buffer;

  const checksum = (STX + ADDR + LOCKNUM + CMD + ASK + DATALEN + ETX) & 0xFF;

  if (checksum !== SUM) {
    return { error: `Invalid checksum. Expected ${checksum}, got ${SUM}` };
  }

  if (CMD !== 0x81) {
    return { error: `Unsupported command 0x${CMD.toString(16)}` };
  }

  return {
    boardAddress: ADDR,
    compartmentId: LOCKNUM,
    userFacingCompartment: LOCKNUM + 1, // if you want 1-based display
    command: "unlock",
    rawHex: buffer.toString("hex").toUpperCase(),
    summary: `Unlock command for compartment ${LOCKNUM} (lock #${LOCKNUM + 1}) on board address ${ADDR}`,
  };
}

const net = require("net");
// const TOTAL_LOCKERS = 2;



// Global TCP client for BU
let client1 = new net.Socket();
let isBUConnected = false;

// Connect once at server start
function connectToBU() {
  if (isBUConnected) return;

  client1.connect(4001, "192.168.0.178", () => {
    isBUConnected = true;
    console.log("✅ Connected to BU (client1)");
  });

  client1.on("data", (data) => {
    console.log(`📥 BU Response: ${data.toString("hex").toUpperCase()}`);
  });

  client1.on("error", (err) => {
    console.error(`❌ BU TCP Error: ${err.message}`);
    isBUConnected = false;
  });

  client1.on("close", () => {
    console.warn("⚠️ BU Connection closed. Retrying in 5s...");
    isBUConnected = false;
    setTimeout(connectToBU, 5000);
  });
}

// Call once when server starts
connectToBU();
















async function sendUnlockPacket(packet) {
  return new Promise((resolve) => {
    if (!isBUConnected || !client1 || client1.destroyed) {
      console.warn("⚠️ BU is not connected. Cannot send packet.");
      return resolve(null);
    }

    client1.write(packet, (err) => {
      if (err) {
        console.error(`❌ Error sending packet: ${err.message}`);
        return resolve(null);
      }
      console.log(`📤 Sent Packet: ${packet.toString("hex").toUpperCase()}`);
      resolve(true);
    });
  });
}




function buildKerongStatusQueryPacket(compartmentId = 0x00) {
  const bytes = [0x02, 0x00, compartmentId, 0x80, 0x00, 0x00, 0x03];
  const checksum = bytes.reduce((sum, b) => sum + b, 0) & 0xFF;
  bytes.push(checksum);
  return Buffer.from(bytes);
}


function parseStatusResponse(buffer) {
  if (buffer.length !== 8 || buffer[3] !== 0x80) {
    return "unknown";
  }

  const statusByte = buffer[4];
  if (statusByte === 0x00) return "unlocked";
  if (statusByte === 0x01) return "locked";
  return "unknown";
}
async function getAllLockerStatuses() {
  const lockers = [];
  for (let i = 0; i < 2; i++) { // test with 2 lockers first
    const status = await getStatusForLocker(i); // 0-indexed
    lockers.push({ id: i + 1, status });
  }
  return lockers;
}




async function getStatusForLocker(id) {
  return new Promise((resolve) => {
    const client = new net.Socket();
    const packet = buildKerongStatusQueryPacket(id);

    let resolved = false;

    client.connect(4001, "192.168.0.178", () => {
      client.write(packet);
    });

    client.on("data", (data) => {
      const status = parseStatusResponse(data); // 🧠 Function below
      resolved = true;
      resolve(status);
      client.destroy();
    });

    client.on("error", (err) => {
      console.error("❌ TCP Error:", err.message);
      resolve("unknown");
    });

    setTimeout(() => {
      if (!resolved) {
        resolve("unknown");
        client.destroy();
      }
    }, 500); // timeout if no response
  });
}




// 🌐 Route: Locker Status UI
app.get("/locker-status", async (req, res) => {
  const lockers = await getAllLockerStatuses();
  console.log("📦 Status Data:", lockers); // Add this
  res.render("lockerStatus", {lockers});
});

// 🧪 API for AJAX or frontend polling
app.get("/api/locker-status", async (req, res) => {
  const lockers = await getAllLockerStatuses();
  res.json(lockers);
});


















app.get('/qr-reader', (req, res) => {
  res.render('newQRreader'); // assuming file is views/qr-reader.ejs
}); 


app.post('/api/locker/scan1', express.text({ type: '*/*' }), (req, res) => {
  const raw = req.body;
  const jsonData = { "accessCode": Number(raw) }; 
  console.log('📥 Raw body:', jsonData); // Should log: 123123|L049

  const [accessCode, lockerId] = raw.split('|');

  console.log('✅ Access Code:', accessCode);
  if (lockerId) console.log('🔐 Locker ID:', lockerId);

  res.send(accessCode);
});

app.post("/api/locker/scan", express.text({ type: '*/*' }),async (req, res) => {
     const [accessCode, lockerId] = req.body.split("///");
   console.log(req.body);
   
  if (!accessCode) {
    return res
      .status(400)
      .json({ success: false, message: "Access code is required." });
  }

  // Find the parcel by accessCode
  const parcel = await Parcel2.findOne({ accessCode });
  if (!parcel) {
    return res
      .status(404)
      .json({ success: false, message: "Parcel not found." });
  }

  if (parcel.status === "picked_up") {
    return res
      .status(400)
      .json({ success: false, message: "Parcel has already been picked up." });
  }

  if (parcel.status === "awaiting_drop") {

    if (!lockerId) {
      return res
      .status(400)
      .json({
        success: false,
        message: "Locker ID is required for drop-off.",
      });
    }

    // If locker was predefined in parcel (e.g. via QR), enforce locker match
   if (parcel.lockerId && parcel.lockerId !== lockerId) {
  return res
    .status(400)
    .json({
      success: false,
      message: `This parcel is assigned to locker ${parcel.lockerId}. Please scan it at the correct locker.`,
      lockerMismatch: true, // 👈 Add this
      expectedLocker: parcel.lockerId // 👈 Optional: for UI display
    });
}

    const locker = await Locker.findOne({ lockerId });

    if (!locker) {
      return res.status(404).json({
        success: false,
        message: "Specified locker not found.",
      });
    }

    const compartment = locker.compartments.find((c) => !c.isBooked);
    if (!compartment) {
      return res
      .status(400)
      .json({
        success: false,
        message: "No available compartments in this locker.",
      });
    }

    if (isBUConnected) {
    const packet = buildKerongUnlockPacket(parseInt(compartment.compartmentId)); // locker 1 = compartment 0
console.log("📤 Final Packet:", packet.toString("hex").toUpperCase());
await sendUnlockPacket(packet);
    } 
    // Lock the compartment
    compartment.isLocked = true;
    compartment.isBooked = true;
    compartment.currentParcelId = parcel._id;
    await locker.save();

    // Update parcel with locker info
    parcel.status = "awaiting_pick";
    parcel.lockerLat = locker.location.lat;
    parcel.lockerLng = locker.location.lng;
    parcel.lockerId = locker.lockerId; // (re)assign if not already
    parcel.compartmentId = compartment.compartmentId;
    parcel.droppedAt = new Date();
    await parcel.save();

    //Notify Receiver
    if(parcel.store_self){


    await client.messages.create({
      to: `whatsapp:+91${parcel.senderPhone}`,
      from: "whatsapp:+15558076515",
      contentSid: "HXa7a69894f9567b90c1cacab6827ff46c",
      contentVariables: JSON.stringify({
        1: parcel.senderName,
        2: `mobile/incoming/${parcel._id}/qr`,
      }),
    });
        }
      await client.messages.create({
      to: `whatsapp:+91${parcel.receiverPhone}`,
      from: "whatsapp:+15558076515",
      contentSid: "HX4200777a18b1135e502d60b796efe670", // Approved Template SID
      contentVariables: JSON.stringify({
        1: parcel.receiverName,
        2: parcel.senderName,
        3:`mobile/incoming/${parcel._id}/qr`
      }),
    });
    io.emit("parcelUpdated", {
      parcelId: parcel._id,
      status: parcel.status,
      lockerId: parcel.lockerId,
      compartmentId: parcel.compartmentId,
      pickedUpAt: parcel.pickedUpAt,
      droppedAt: parcel.droppedAt,
    });

    return res.json({
      success: true,
      message: `Parcel dropped successfully. Compartment ${compartment.compartmentId} locked.`,
      compartmentId: compartment.compartmentId,
      lockerId: locker._id,
      status: "awaiting_drop",
    });
  }

  if (parcel.status === "awaiting_pick" || parcel.status === "in_locker") {
    // This is a pickup
    
   const [accessCode, lockerId] = req.body.split("///");

    if (!parcel.lockerId || !parcel.compartmentId) {
        return res.json({
        success: false,
        message: "Parcel is not assigned to any locker.",
      });
    }

    // Check that the scanned locker matches the parcel's locker
    if (lockerId !== parcel.lockerId) {
        return res.json({
        success: false,
        message: `This parcel belongs to locker ${parcel.lockerId}. Please scan it at the correct locker.`,
      });
    }

    // Find locker and compartment
    const locker = await Locker.findOne({ lockerId: parcel.lockerId });

    if (!locker) {
      return res
        .status(404)
        .json({ success: false, message: "Locker not found." });
    }

    const compartment = locker.compartments.find(
      (c) => c.compartmentId === parcel.compartmentId
    );
    if (!compartment) {
       return res.json({ success: false, message: "Compartment not found." });
    }


    if (!compartment.isLocked) {
  return res.json({ success: false, message: "Compartment is already unlocked." });
}
if (isBUConnected) {
    const newpacket = buildKerongUnlockPacket(parseInt(compartment.compartmentId));
   
  await sendUnlockPacket(newpacket);
}
// If this is a MODIFY QR flow


// Otherwise: normal pickup flow
compartment.isLocked = false;
compartment.isBooked = false;
compartment.currentParcelId = null;
await locker.save();

// Update parcel
parcel.status = "picked";
parcel.pickedUpAt = new Date();
await parcel.save();

    
    // Unlock compartment
    compartment.isLocked = false;
    compartment.isBooked = false;
    compartment.currentParcelId = null;
    await locker.save();

    // Update parcel
    parcel.status = "picked";
    parcel.pickedUpAt = new Date();
    await parcel.save();
    const unlockPacket = buildKerongUnlockPacket(compartment.compartmentId);

    // const client = new net.Socket();
    // client.connect(5000, "localhost", () => {
    //   console.log(
    //     `🔓 Sending unlock packet for compartment ${compartment.compartmentId}`
    //   );
    //   client.write(unlockPacket);
    // });
    // client.on("data", (data) => {
    //   console.log(`✅ BU Emulator response: ${data.toString("hex")}`);
    //   client.destroy();
    // });
    // client.on("error", (err) => {
    //   console.error("❌ BU Emulator error:", err);
    // });

    await client.messages.create({
      to: `whatsapp:+91${parcel.senderPhone}`,
      from: "whatsapp:+15558076515",
      contentSid: "HX5d9cb78910c37088fb14e660af060c1b", // Approved Template SID
      contentVariables: JSON.stringify({
        1: parcel.senderName,
        2: parcel.receiverName,
      }),
    });
    io.emit("parcelUpdated", {
      parcelId: parcel._id,
      status: parcel.status,
      lockerId: parcel.lockerId,
      compartmentId: parcel.compartmentId,
      pickedUpAt: parcel.pickedUpAt,
      droppedAt: parcel.droppedAt,
    });
    return res.json({
      success: true,
      message: `Parcel picked up successfully. Compartment ${compartment.compartmentId} unlocked.`,
      compartmentId: compartment.compartmentId,
      lockerId: locker._id,
      status: "awaiting_pick",
    });
  }

  // If status is something else
  return res
    .status(400)
    .json({ success: false, message: `Parcel is in status: ${parcel.status}` });
});

// -------------------------------------------Error-handling middleware------------------------------------------------------
app.use((err, req, res, next) => {
  console.error(err.stack); // Log the error details (optional)
  res.status(500).render("errorpage", {
    errorMessage: err.message || "Internal Server Error",
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});