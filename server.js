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
const User = require("./models/User/UserUpdated.js");
const Courier = require("./models/Courier.js");
const Parcel = require("./models/Parcel");
const incomingParcel = require('./models/incomingParcel.js');
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
app.get("/", (req, res) => {
  res.render("landingPage-emulator");
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

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});