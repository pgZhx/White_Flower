import { PeerServer } from 'peerjs-server';

const PORT = Number(process.env.PORT || 9000);
const PATH = process.env.PATH_PREFIX || '/peerjs';

const server = PeerServer({
  port: PORT,
  path: PATH,
  allow_discovery: false,
  cors: true,
});

console.log(`White_Flower PeerJS signaling server listening on :${PORT}${PATH}`);
