import { useEffect, useMemo, useState } from 'react';
import { HomeScreen } from './screens/HomeScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { GameScreen } from './screens/GameScreen';
import { HostGameController } from './game/HostGameController';

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
  const [controller, setController] = useState<HostGameController | null>(null);

  useEffect(() => {
    setInitialRoom(readRoomParam());
  }, []);

  const viewerId = screen.name === 'home' ? undefined : screen.playerId;

  const handleCreate = (nickname: string, roomId: string, playerId: string) => {
    const c = new HostGameController({ roomId, hostPlayerId: playerId });
    c.addPlayer(nickname);
    setController(c);
    setScreen({ name: 'lobby', roomId, nickname, playerId, isHost: true });
  };

  const handleJoin = (nickname: string, roomId: string, playerId: string) => {
    // MVP local simulation: join also creates a local controller.
    // Real WebRTC join will replace this in Stage E.
    const c = new HostGameController({ roomId, hostPlayerId: 'host_sim' });
    c.addPlayer('房主');
    c.addPlayer(nickname);
    setController(c);
    setScreen({ name: 'lobby', roomId, nickname, playerId, isHost: false });
  };

  const controllerForScreen = useMemo(() => controller, [controller]);

  if (screen.name === 'home') {
    return (
      <HomeScreen
        initialRoom={initialRoom ?? undefined}
        onCreate={handleCreate}
        onJoin={handleJoin}
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
        controller={controllerForScreen}
        onStart={() => {
          if (controllerForScreen) {
            controllerForScreen.startGame();
            setScreen({
              name: 'game',
              roomId: screen.roomId,
              nickname: screen.nickname,
              playerId: screen.playerId,
              isHost: screen.isHost,
            });
          }
        }}
        onLeave={() => {
          setController(null);
          setScreen({ name: 'home' });
        }}
      />
    );
  }

  return (
    <GameScreen
      roomId={screen.roomId}
      nickname={screen.nickname}
      playerId={screen.playerId}
      isHost={screen.isHost}
      controller={controllerForScreen}
      onExit={() => {
        setController(null);
        setScreen({ name: 'home' });
      }}
    />
  );
}
