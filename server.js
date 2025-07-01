const express = require("express");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const LRU = require('lru-cache');



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
const PORT = 8080;
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


// // MIDDLEWARES
// app.use((req, res, next) => {
//   console.log("🌐", req.method, req.originalUrl);
//   console.log("🔐 Session user:", req.session.user);
//   console.log("➡️ redirectTo in session:", req.session.redirectTo);
//   next();
// });
function isAuthenticated(req, res, next) {
  if (req.session.user) {
    return next();
  }
    if (!req.session.redirectTo) {
    console.log("Saving redirectTo:", req.originalUrl);
    req.session.redirectTo = req.originalUrl;
  }


  return res.redirect("/login");
}

function isAdmin(req, res, next) {
  if (req.session.adminId) return next();
  res.redirect("/admin/login");
}

function isTechnincian(req, res, next) {
  if (req.session.techId) return next();
  res.redirect("/technician/login");
}

const isCourierAuthenticated = (req, res, next) => {
  if (req.session.courierId) return next();
  req.flash("error", "Please log in as a courier.");
  res.redirect("/courier/login");
};


function getDistanceFromLatLonInM(lat1, lon1, lat2, lon2) {
  function deg2rad(deg) {
    return deg * (Math.PI / 180);
  }
  const R = 6371e3; // Earth's radius in meters
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}



app.post("/api/nearest-locker", async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    if (!latitude || !longitude) { 
      return res.status(400).json({ success: false, message: "Missing coordinates" });
    }

    // Fetch all lockers
    const lockers = await Locker.find({});

    if (!lockers.length) {
      return res.status(404).json({ success: false, message: "No lockers available" });
    }

    // Find the nearest locker
    let nearestLocker = null;
    let minDistance = Infinity;

    lockers.forEach(locker => {
      if (!locker.location || locker.location.lat == null || locker.location.lng == null) return;

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
      return res.status(404).json({ success: false, message: "No lockers with valid location data" });
    }

    return res.json({
      success: true,
      locker: {
        lockerId: nearestLocker.lockerId,
        address: nearestLocker.location.address,
        coordinates: {
          lat: nearestLocker.location.lat,
          lng: nearestLocker.location.lng
        },
        totalCompartments: nearestLocker.compartments.length,
        availableCompartments: nearestLocker.compartments.filter(c => !c.isBooked).length
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get("/",(req,res)=>{
  res.render("lockerEmu");
})


app.get("/locker/emulator/:lockerId", async (req, res) => {
  try {
    const locker = await Locker.findOne({ lockerId: req.params.lockerId });
    
    if (!locker) {
      // Render a "not found" page
      return res.render("lockerNotFound.ejs", { lockerId: req.params.lockerId });
    }
    const compartments = locker.compartments;
    const { lockerId } = req.params;
    res.render("newlocker.ejs", { lockerId, compartments });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err });
  }
});

app.post("/api/locker/scan", async (req, res) => {
  
  const { accessCode } = req.body;

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
  // Get lockerId from request (where the user scanned)
  const { lockerId } = req.body;

  if (!lockerId) {
    return res.status(400).json({
      success: false,
      message: "Locker ID is required for drop-off.",
    });
  }

  // Find that specific locker
  const locker = await Locker.findOne({ lockerId });

  if (!locker) {
    return res.status(404).json({
      success: false,
      message: "Specified locker not found.",
    });
  }

  // Look for a free compartment in that locker
  const compartment = locker.compartments.find((c) => !c.isBooked);

  if (!compartment) {
    return res.status(503).json({
      success: false,
      message: "No available compartments in this locker.",
    });
  }

  // Lock the compartment
  compartment.isLocked = true;
  compartment.isBooked = true;
  compartment.currentParcelId = parcel._id;
  await locker.save();

  // Update parcel
  parcel.status = "awaiting_pick";
  parcel.lockerLat = locker.location.lat;
  parcel.lockerLng = locker.location.lng;
  parcel.lockerId = locker.lockerId;
  parcel.compartmentId = compartment.compartmentId;
  parcel.droppedAt = new Date();
  await parcel.save();

  // Update any secondary parcel collection if needed
 
  io.emit("parcelUpdated", {
    parcelId: parcel._id,
    status: parcel.status,
    lockerId: parcel.lockerId,
    compartmentId: parcel.compartmentId,
    pickedUpAt: parcel.pickedUpAt,
    droppedAt: parcel.droppedAt,
  });

  dashboardCache.delete("dashboard:" + req.session.user._id);
  parcelCache.delete("sendParcel:" + req.session.user._id);

  return res.json({
    success: true,
    message: `Parcel dropped successfully. Compartment ${compartment.compartmentId} locked.`,
    compartmentId: compartment.compartmentId,
    lockerId: locker._id,
  });
}


  if (parcel.status === "awaiting_pick" || parcel.status === "in_locker") {
  // This is a pickup

  const { lockerId } = req.body;

  if (!parcel.lockerId || !parcel.compartmentId) {
    return res.status(400).json({
      success: false,
      message: "Parcel is not assigned to any locker.",
    });
  }

  // Check that the scanned locker matches the parcel's locker
  if (lockerId !== parcel.lockerId) {
    return res.status(400).json({
      success: false,
      message: `This parcel belongs to locker ${parcel.lockerId}. Please scan it at the correct locker.`,
    });
  }

  // Find locker and compartment
  const locker = await Locker.findOne({ lockerId: parcel.lockerId });

  if (!locker) {
    return res.status(404).json({ success: false, message: "Locker not found." });
  }

  const compartment = locker.compartments.find(
    (c) => c.compartmentId === parcel.compartmentId
  );
  if (!compartment) {
    return res.status(404).json({ success: false, message: "Compartment not found." });
  }

  if (!compartment.isLocked) {
    return res.status(400).json({ success: false, message: "Compartment is already unlocked." });
  }

  // Unlock compartment
  compartment.isLocked = false;
  compartment.isBooked = false;
  compartment.currentParcelId = null;
  await locker.save();

  // Update parcel
  parcel.status = "picked";
  parcel.pickedUpAt = new Date();
  await parcel.save();

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
  });
}


  // If status is something else
  return res
    .status(400)
    .json({ success: false, message: `Parcel is in status: ${parcel.status}` });
});

























app.get("/locker/emulator/:lockerId", async (req, res) => {
  try {
    const locker = await Locker.findOne({ lockerId: req.params.lockerId });
    if (!locker) return res.status(404).json({ message: "Locker not found" });
    const compartments = locker.compartments;
    const { lockerId } = req.params;
    res.render("locker.ejs", { lockerId, compartments });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err });
  }
});



app.post("/api/locker/scan", async (req, res) => {
  const { accessCode } = req.body;

  if (!accessCode) {
    return res.status(400).json({ success: false, message: "Access code is required." });
  }

  // Find the parcel by accessCode
  const parcel = await Parcel2.findOne({ accessCode });

  if (!parcel) {
    return res.status(404).json({ success: false, message: "Parcel not found." });
  }

  if (parcel.status === "picked_up") {
    return res.status(400).json({ success: false, message: "Parcel has already been picked up." });
  }

  if (parcel.status === "awaiting_drop") {
    // This is a drop-off
    // Find an available locker with free compartments
    const locker = await Locker.findOne({ "compartments.isBooked": false });

    if (!locker) {
      return res.status(503).json({ success: false, message: "No available compartments for drop-off." });
    }

    // Pick the first free compartment
    const compartment = locker.compartments.find(c => !c.isBooked);

    if (!compartment) {
      return res.status(503).json({ success: false, message: "No available compartments." });
    }

    // Lock the compartment
    compartment.isLocked = true;
    compartment.isBooked = true;
    compartment.currentParcelId = parcel._id;

    // Save locker state
    await locker.save();

    // Update parcel
    parcel.status = "awaiting_pick";
    parcel.lockerId = locker.lockerId;
    parcel.compartmentId = compartment.compartmentId;
    parcel.droppedAt = new Date();
    await parcel.save();
      dashboardCache.delete("dashboard:" + req.session.user._id);
  parcelCache.delete("sendParcel:" + req.session.user._id);
    return res.json({
      success: true,
      message: `Parcel dropped successfully. Compartment ${compartment.compartmentId} locked.`,
      compartmentId: compartment.compartmentId,
      lockerId: locker._id
    });
  }

  if (parcel.status === "awaiting_pick" || parcel.status === "in_locker") {
    // This is a pickup
    if (!parcel.lockerId || !parcel.compartmentId) {
      return res.status(400).json({ success: false, message: "Parcel is not assigned to any locker." });
    }

    // Find locker and compartment
   const locker = await Locker.findOne({ lockerId: parcel.lockerId });

    if (!locker) {
      return res.status(404).json({ success: false, message: "Locker not found." });
    }

    const compartment = locker.compartments.find(c => c.compartmentId === parcel.compartmentId);
    if (!compartment) {
      return res.status(404).json({ success: false, message: "Compartment not found." });
    }

    if (!compartment.isLocked) {
      return res.status(400).json({ success: false, message: "Compartment is already unlocked." });
    }

    // Unlock compartment
    compartment.isLocked = false;
    compartment.isBooked = false;
    compartment.currentParcelId = null;
    await locker.save();

    // Update parcel
    parcel.status = "picked";
    parcel.pickedUpAt = new Date();
    await parcel.save();

    return res.json({
      success: true,
      message: `Parcel picked up successfully. Compartment ${compartment.compartmentId} unlocked.`,
      compartmentId: compartment.compartmentId,
      lockerId: locker._id
    });
  }

  // If status is something else
  return res.status(400).json({ success: false, message: `Parcel is in status: ${parcel.status}` });
});

/// unlock route

app.get("/drop/:accessCode", isAuthenticated, async (req, res) => {
  const parcel = await Parcel1.findOne({
    accessCode: req.params.accessCode,
    status: "awaiting_drop",
  });

  if (!parcel) return res.status(404).send("Invalid or expired QR");

  // Locker selection logic here
  const locker = await Locker1.findOne({
    size: parcel.size,
    isLocked: false,
    status: "available",
  });

  if (!locker) {
    return res.send("No compatible lockers available at this location.");
  }

  // Assign & lock
  parcel.lockerId = locker._id;
  parcel.status = "dropped";
  parcel.droppedAt = new Date();
  await parcel.save();

  locker.isLocked = true;
  locker.status = "occupied";
  await locker.save();

  res.send("✅ Locker opened! Place your parcel inside.");
});
app.get("/locker", (req, res) => {
  res.render("lockerPage", { nearestLocker: null });
});
function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
  function deg2rad(deg) {
    return deg * (Math.PI/180)
  }
  const R = 6371000; // Radius of Earth in meters
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}


app.post("/locker/nearest", async (req, res) => {
  const { latitude, longitude } = req.body;
  req.session.latitude = latitude;
  req.session.longitude = longitude;
  if (!latitude || !longitude) {
    return res.status(400).send("Coordinates missing");
  }

  const allLockers = await Locker.find({});

  const lockersWithDistance = allLockers.map(locker => {
    const dist = getDistanceFromLatLonInMeters(
      latitude,
      longitude,
      locker.location.lat,
      locker.location.lng
    );
    return { locker, dist };
  });

  lockersWithDistance.sort((a, b) => a.dist - b.dist);

  if (lockersWithDistance.length === 0) {
    return res.status(404).send("No lockers found");
  }

  res.render("locker", {
    lockers: lockersWithDistance.map(l => ({
      lockerId: l.locker.lockerId,
      address: l.locker.location.address,
      compartments: l.locker.compartments
    })),
    currentIndex: 0
  });
});
app.post("/locker/nearest/navigate", async (req, res) => {
  const { latitude, longitude } = req.session || {}; // or wherever you stored coordinates
  const { nextIndex } = req.body;

  if (!latitude || !longitude) {
    return res.status(400).send("Coordinates missing in session");
  }

  const allLockers = await Locker.find({});

  const lockersWithDistance = allLockers.map(locker => {
    const dist = getDistanceFromLatLonInMeters(
      latitude,
      longitude,
      locker.location.lat,
      locker.location.lng
    );
    return { locker, dist };
  });

  lockersWithDistance.sort((a, b) => a.dist - b.dist);

  res.render("locker", {
    lockers: lockersWithDistance.map(l => ({
      lockerId: l.locker.lockerId,
      address: l.locker.location.address,
      compartments: l.locker.compartments
    })),
    currentIndex: parseInt(nextIndex)
  });
});



app.get("/locker/emulator/:lockerId", async (req, res) => {
  const locker = await Locker.findOne({ lockerId: req.params.lockerId });
  if (!locker) {
    return res.status(404).send("Locker not found");
  }

  res.render("locker", { locker });
});

app.get("/locker/emulator/:lockerId", async (req, res) => {
  try {
    const locker = await Locker.findOne({ lockerId: req.params.lockerId });
    if (!locker) return res.status(404).json({ message: "Locker not found" });
    const compartments = locker.compartments;
    const { lockerId } = req.params;
    res.render("locker.ejs", { lockerId, compartments });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err });
  }
});

// Lock compartment
app.post("/locker/lock", async (req, res) => {
  const { lockerId, compartmentId } = req.body;
  const locker = await Locker.findOne({ lockerId });
  if (!locker) return res.status(404).send("Locker not found");
  const compartment = locker.compartments.find(
    (c) => c.compartmentId === compartmentId
  );
  compartment.isLocked = true;
  await locker.save();
  res.redirect("/locker/emulator/" + lockerId);
});

// Unlock compartment (directly)
app.post("/locker/unlock-direct", async (req, res) => {
  const { lockerId, compartmentId } = req.body;
  const locker = await Locker.findOne({ lockerId });
  if (!locker) return res.status(404).send("Locker not found");
  const compartment = locker.compartments.find(
    (c) => c.compartmentId === compartmentId
  );
  compartment.isLocked = false;
  await locker.save();
  res.redirect("/locker/emulator/" + lockerId);
});

// Send status
app.post("/locker/status", async (req, res) => {
  const { lockerId, compartmentId } = req.body;
  const locker = await Locker.findOne({ lockerId });
  if (!locker) return res.status(404).send("Locker not found");
  const compartment = locker.compartments.find(
    (c) => c.compartmentId === compartmentId
  );
  console.log("-----------STATUS------------------");

  console.log(
    `Status Update: Locker ${lockerId}, Compartment ${compartmentId}, isLocked: ${compartment.isLocked}, isBooked: ${compartment.isBooked}`
  );
  res.redirect("/locker/emulator/" + lockerId);
});
app.get("/drop/:accessCode", async (req, res) => {
  const { accessCode } = req.params;

  try {
    // Find the first locker with an available compartment
    const locker = await Locker.findOne({
      "compartments.isBooked": false,
    });

    if (!locker) {
      return res.status(404).send("No available compartments found.");
    }

    // Find the first free compartment
    const compartment = locker.compartments.find(c => !c.isBooked);

    if (!compartment) {
      return res.status(404).send("No available compartments found.");
    }

    // Mark as booked and unlocked
    compartment.isBooked = true;
    compartment.isLocked = false;
    compartment.bookingInfo = {
      userId: null,
      otp: accessCode,
      bookingTime: new Date(),
    };

    await locker.save();

    // Show success message
    res.send(`
      <html>
      <head>
        <title>Locker Unlocked</title>
        <style>
          body { font-family: Arial; background: #f5f5f5; text-align: center; padding-top: 50px; }
          .card { background: white; padding: 20px; display: inline-block; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>✅ Compartment Unlocked</h2>
          <p><strong>Locker ID:</strong> ${locker.lockerId}</p>
          <p><strong>Compartment:</strong> ${compartment.compartmentId}</p>
          <p>You can now place your parcel.</p>
        </div>
      </body>
      </html>
    `);

  } catch (err) {
    console.error(err);
    res.status(500).send("Server error.");
  }
});

app.post("/locker/unlock/:lockerId/:compartmentId", async (req, res) => {
  const { lockerId, compartmentId } = req.params;
  const locker = await Locker.findOne({ lockerId });
  if (!locker) {
    req.flash("error", "Locker Not found");
    return res.redirect("/locker/emulator/" + lockerId);
  }
  const compartment = locker.compartments.find(
    (c) => c.compartmentId === compartmentId
  );
  if (!compartment) {
    req.flash("error", "Compartment Not found");
    return res.redirect("/locker/emulator/" + lockerId);
  }

  const enteredOtp = req.body.otp;

  if (compartment.bookingInfo.otp === enteredOtp) {
    compartment.isLocked = false;
    compartment.isBooked = false;
    compartment.bookingInfo = {
      userId: null,
      bookingTime: null,
      otp: null,
    };

    // ✅ Tell Mongoose this nested path was modified
    locker.markModified("compartments");

    // ✅ Save the changes to DB
    await locker.save();
    console.log(`${compartmentId} is unlocked at Locker ${lockerId}`);
    req.flash(
      "success",
      `Locker ${compartmentId} has been unlocked successfully.`
    );
  } else {
    console.log("Unauthorized Access");
    req.flash("error", "Wrong OTP. Try again.");
  }

  res.redirect("/locker/emulator/" + lockerId);
});

app.get("/qrScan", (req, res) => {
  res.render("qrScan.ejs");
});
app.post("/unlock-via-qr-data", async (req, res) => {
  return res.json({ message: "Unlock Success" });
});

app.post("/unlock-via-qr", async (req, res) => {
  const { lockerId, compartmentId, otp } = req.body;
  console.log("Unlock request via QR:", lockerId, compartmentId, otp);

  const locker = await Locker.findOne({ lockerId });
  if (!locker) {
    return res.status(404).json({ message: "Locker not found." });
  }

  const compartment = locker.compartments.find(
    (c) => c.compartmentId === compartmentId
  );

  if (!compartment) {
    return res.status(404).json({ message: "Compartment not found." });
  }

  if (compartment.bookingInfo.otp === otp) {
    compartment.isLocked = false;
    compartment.isBooked = false;
    compartment.bookingInfo = {
      userId: null,
      bookingTime: null,
      otp: null,
    };

    locker.markModified("compartments");
    await locker.save();

    console.log(`✅ ${compartmentId} is unlocked at Locker ${lockerId}`);
    return res.json({ message: "Locker unlocked successfully." });
  } else {
    console.log("❌ Wrong OTP.");
    return res.status(401).json({ message: "Wrong OTP." });
  }
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
