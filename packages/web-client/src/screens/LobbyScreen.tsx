import { useState } from 'react';

interface LobbyScreenProps {
  roomId: string;
  nickname: string;
  playerId: string;
  isHost: boolean;
  onStart: () => void;
  onLeave: () => void;
}

const fakePlayers = [
  { id: 'p1', nickname: '你', seat: 0, ready: true, isHost: true },
  { id: 'p2', nickname: 'Alice', seat: 1, ready: true, isHost: false },
  { id: 'p3', nickname: 'Bob', seat: 2, ready: false, isHost: false },
  { id: 'p4', nickname: 'Carol', seat: 3, ready: false, isHost: false },
  { id: 'p5', nickname: 'Dave', seat: 4, ready: false, isHost: false },
];

export function LobbyScreen({ roomId, nickname, isHost, onStart, onLeave }: LobbyScreenProps) {
  const [players] = useState(fakePlayers);
  const [ready, setReady] = useState(false);

  const allReady = players.length >= 5 && players.every((p) => p.ready);

  return (
    <div className="min-h-screen bg-cathedral px-4 py-8">
      <div className="mx-auto max-w-2xl rounded-lg border border-stone-700 bg-stone-900 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-serif text-rose">房间</h1>
            <p className="mt-1 text-sm text-stone-400">房间号：<span className="font-mono text-stone-100">{roomId}</span></p>
          </div>
          <button onClick={onLeave} className="text-sm text-stone-400 hover:text-stone-100">离开</button>
        </div>
        <div className="mt-6 space-y-2">
          {players.map((player) => (
            <div key={player.id} className="flex items-center justify-between rounded border border-stone-800 bg-stone-950 px-4 py-2">
              <div className="flex items-center gap-3">
                <span className="text-stone-500">#{player.seat + 1}</span>
                <span>{player.nickname}</span>
                {player.isHost && <span className="rounded bg-blood px-1.5 py-0.5 text-xs text-white">房主</span>}
              </div>
              <span className={player.ready ? 'text-green-400' : 'text-stone-500'}>
                {player.ready ? '已准备' : '未准备'}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-col gap-2">
          {!isHost && (
            <button
              className="rounded bg-stone-700 px-4 py-2 font-semibold text-white hover:bg-stone-600"
              onClick={() => setReady((v) => !v)}
            >
              {ready ? '取消准备' : '准备'}
            </button>
          )}
          {isHost && (
            <button
              className="rounded bg-blood px-4 py-2 font-semibold text-white hover:bg-red-800 disabled:opacity-40"
              disabled={!allReady}
              onClick={onStart}
            >
              开始游戏
            </button>
          )}
          <p className="text-center text-xs text-stone-500">需要 5–10 人且全部准备后才能开始</p>
        </div>
      </div>
    </div>
  );
}
