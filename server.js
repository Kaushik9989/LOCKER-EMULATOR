const express = require("express");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const net = require("net");
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

function buildKerongUnlockPacket(locknum) {
  const STX = 0x02;
  const ADDR = 0x00;
  const CMD = 0x81;
  const ASK = 0x00;
  const DATALEN = 0x00;
  const ETX = 0x03;

  const sum = (STX + ADDR + locknum + CMD + ASK + DATALEN + ETX) % 256;

  return Buffer.from([STX, ADDR, locknum, CMD, ASK, DATALEN, ETX, sum]);
}

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



app.post("/api/locker/scan", async (req, res) => {
  const { accessCode, prestatus, modifystatus } = req.body;
  console.log(prestatus);
  console.log(modifystatus);
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
    const { lockerId } = req.body;

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
    await client.messages.create({
      to: `whatsapp:+91${parcel.senderPhone}`,
      from: "whatsapp:+15558076515",
      contentSid: "HXa7a69894f9567b90c1cacab6827ff46c",
      contentVariables: JSON.stringify({
        1: parcel.senderName,
        2: `incoming/${parcel._id}/qr`,
      }),
    });
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
  if(prestatus!="awaiting_drop"){
  if (parcel.status === "awaiting_pick" || parcel.status === "in_locker") {
    // This is a pickup
    
    const { lockerId } = req.body;

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

// If this is a MODIFY QR flow
if (modifystatus === "modify") {
  // Just unlock to allow placing again
  compartment.isLocked = false;
  await locker.save();

  return res.json({
    success: true,
    message: `Compartment ${compartment.compartmentId} unlocked for re-drop.`,
    status: "awaiting_pick",
    compartmentId: compartment.compartmentId,
    lockerId: locker._id,
    modify: true,
  });
}

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
