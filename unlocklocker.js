const net = require('net');

// Replace these with your actual BU IP and Port
const BU_IP = '192.168.0.158';
const BU_PORT = 5000;

// Command to unlock all 12 locks on NCU12L with address 0x00
const unlockAllHex = "02 00 64 81 00 00 03 EA";
const unlockCommand = Buffer.from(unlockAllHex.replace(/\s+/g, ''), 'hex');

// Create TCP socket
const client = new net.Socket();

client.connect(BU_PORT, BU_IP, () => {
  console.log(`✅ Connected to BU at ${BU_IP}:${BU_PORT}`);
  client.write(unlockCommand);
  console.log("🔓 Sent unlock command");
});

client.on('data', (data) => {
  console.log("📥 Received response:", data.toString('hex').toUpperCase());
  client.destroy();
});

client.on('close', () => {
  console.log("❌ Connection closed");
});

client.on('error', (err) => {
  console.error("🚨 Error:", err.message);
});
