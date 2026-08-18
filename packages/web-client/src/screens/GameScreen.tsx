interface GameScreenProps {
  roomId: string;
  nickname: string;
  playerId: string;
  isHost: boolean;
  onExit: () => void;
}

export function GameScreen({ roomId, nickname, isHost, onExit }: GameScreenProps) {
  return (
    <div className="min-h-screen bg-cathedral px-4 py-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-serif text-rose">游戏</h1>
            <p className="text-sm text-stone-400">房间 {roomId} · {nickname} {isHost ? '(房主)' : ''}</p>
          </div>
          <button onClick={onExit} className="text-sm text-stone-400 hover:text-stone-100">退出</button>
        </div>
        <div className="mt-6 rounded-lg border border-stone-700 bg-stone-900 p-6">
          <p className="text-stone-300">游戏界面骨架</p>
          <p className="mt-2 text-sm text-stone-500">Stage C 将接入 HostGameController 和 LocalTransport。</p>
        </div>
      </div>
    </div>
  );
}
