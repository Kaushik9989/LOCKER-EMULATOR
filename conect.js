const net = require("net");

function sendUnlockPacket(packet) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();

    const BU_IP = "192.168.0.178"; // Replace with your actual BU IP
    const BU_PORT = 4001;          // Replace with your actual BU port

    // client.connect(BU_PORT, BU_IP, () => {
    //   console.log("✅ Connected to BU. Sending unlock packet...");
    //   client.write(packet);
    // });

    // client.on("data", (data) => {
    
    //   client.destroy(); // close socket after receiving response
    //   resolve(data);
    // });

    // client.on("error", (err) => {
    //   console.error("❌ TCP Error:", err.message);
    //   client.destroy();
    //   reject(err);
    // });

    client.on("close", () => {
      console.log("🔌 Connection closed");
    });
  });
}
sendUnlockPacket(0);