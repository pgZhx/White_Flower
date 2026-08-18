import { useEffect, useState } from 'react';
import { HomeScreen } from './screens/HomeScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { GameScreen } from './screens/GameScreen';

export type Screen =
  | { name: 'home' }
  | { name: 'lobby'; roomId: string; nickname: string; playerId: string; isHost: boolean }
  | { name: 'game'; roomId: string; nickname: string; playerId: string; isHost: boolean };

function readRoomParam(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('room');
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [initialRoom, setInitialRoom] = useState<string | null>(null);

  useEffect(() => {
    setInitialRoom(readRoomParam());
  }, []);

  if (screen.name === 'home') {
    return (
      <HomeScreen
        initialRoom={initialRoom ?? undefined}
        onCreate={(nickname, roomId, playerId) =>
          setScreen({ name: 'lobby', roomId, nickname, playerId, isHost: true })
        }
        onJoin={(nickname, roomId, playerId) =>
          setScreen({ name: 'lobby', roomId, nickname, playerId, isHost: false })
        }
      />
    );
  }

  if (screen.name === 'lobby') {
    return (
      <LobbyScreen
        roomId={screen.roomId}
        nickname={screen.nickname}
        playerId={screen.playerId}
        isHost={screen.isHost}
        onStart={() =>
          setScreen({
            name: 'game',
            roomId: screen.roomId,
            nickname: screen.nickname,
            playerId: screen.playerId,
            isHost: screen.isHost,
          })
        }
        onLeave={() => setScreen({ name: 'home' })}
      />
    );
  }

  return (
    <GameScreen
      roomId={screen.roomId}
      nickname={screen.nickname}
      playerId={screen.playerId}
      isHost={screen.isHost}
      onExit={() => setScreen({ name: 'home' })}
    />
  );
}
