
function buildKerongUnlockPacket(compartmentId, addr = 0x00) {
  const STX = 0x02;
  const LOCKNUM = compartmentId; // 0x00 to 0x0B
  const CMD = 0x81;              // unlock command
  const ASK = 0x00;
  const DATALEN = 0x00;
  const ETX = 0x03;

  const bytes = [STX, addr, LOCKNUM, CMD, ASK, DATALEN, ETX];
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



const packet = Buffer.from(buildKerongUnlockPacket(5), "hex");
const result = parseKerongUnlockPacket(packet);
console.log(result);





