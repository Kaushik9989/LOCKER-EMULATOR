const mongoose = require("mongoose");

const ParcelSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  senderName: String,
  receiverName: String,
  senderPhone : {type: String},
  receiverPhone: { type: String, required: true },
  description: String,
  type: { type: String, enum: ["document", "package", "gift", "other"], required: true },
  size: { type: String, enum: ["small", "medium", "large"], required: true },
  location_id: { type: mongoose.Schema.Types.ObjectId, ref: "DropLocation" },
  lockerLat : {type : String},
  lockerLng : {type :String},
  lockerId: { type: String, required: false, default: null },
  compartmentId: { type: String },
  accessCode: { type: String, unique: true, required: true },
  qrImage: String,
  unlockUrl: String,
  status: {
    type: String,
    enum: ["awaiting_drop","awaiting_pick", "picked", "expired"],
    default: "awaiting_drop",
  },
  cost: { type: mongoose.Decimal128, required: true, default : 0},
  paymentOption: { type: String, enum: ["sender_pays", "receiver_pays"] },
  paymentStatus: { type: String, enum: ["pending", "completed"], default: "pending" },
  droppedAt: Date,
  pickedAt: Date,
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Parcel2", ParcelSchema);
