import { useEffect, useState } from 'react';
import type { GameClient } from '../game/GameClient';

interface LobbyScreenProps {
  roomId: string;
  nickname: string;
  playerId: string;
  isHost: boolean;
  client: GameClient | null;
  debug: boolean;
  onStart: () => void;
  onLeave: () => void;
}

export function LobbyScreen({
  roomId,
  nickname,
  playerId,
  isHost,
  client,
  debug,
  onStart,
  onLeave,
}: LobbyScreenProps) {
  const [, setTick] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!client) return;
    return client.subscribe(() => setTick((t) => t + 1));
  }, [client]);

  const room = client?.getLobby();
  const players = room?.players ?? [];
  const canAdd = players.length < 10;
  const allReady = (room?.players.every((p) => p.ready) ?? false) && players.length >= 5 && players.length <= 10;

  const addSimulatedPlayer = () => {
    if (!debug || !client || client.isHost !== true || !canAdd) return;
    // Debug-only local simulation: use the host controller directly through a cast.
    const debugClient = client as unknown as { addPlayer(nickname: string): void };
    const names = ['艾丽丝', '鲍勃', '卡罗尔', '戴夫', '伊芙', '弗兰克', '格蕾丝', '海蒂', '伊万'];
    const used = new Set(players.map((p) => p.nickname));
    const name = names.find((n) => !used.has(n)) ?? `玩家${players.length + 1}`;
    debugClient.addPlayer(name);
  };

  const toggleReady = (id: string) => {
    if (!client) return;
    if (id !== playerId && !debug) return;
    const player = players.find((p) => p.id === id);
    if (!player) return;
    if (client.isHost && id === client.playerId) {
      client.setReady(!player.ready);
    } else if (!client.isHost && id === playerId) {
      client.setReady(!player.ready);
    } else if (debug && client.isHost) {
      // In debug local simulation we still allow toggling any player.
      const controller = client as unknown as {
        setReady(id: string, ready: boolean): void;
      };
      controller.setReady(id, !player.ready);
    }
  };

  return (
    <div className="min-h-screen bg-cathedral px-4 py-8">
      <div className="mx-auto max-w-2xl rounded-lg border border-stone-700 bg-stone-900 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-serif text-rose">房间</h1>
            <p className="mt-1 text-sm text-stone-400">
              房间号：<span className="font-mono text-stone-100">{roomId}</span>
            </p>
            {debug && (
              <p className="text-xs text-stone-500">当前为本地模拟模式，仅用于调试。</p>
            )}
            <div className="mt-2 flex items-center gap-2 text-xs">
              <code className="rounded bg-stone-950 px-2 py-1 text-stone-300">
                {typeof window !== 'undefined' ? `${window.location.origin}/?room=${roomId}` : `/?room=${roomId}`}
              </code>
              <button
                className="rounded border border-stone-600 px-2 py-1 text-stone-300 hover:bg-stone-700"
                onClick={() => {
                  const url = `${window.location.origin}/?room=${roomId}`;
                  navigator.clipboard?.writeText(url).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  });
                }}
              >
                {copied ? '已复制' : '复制邀请链接'}
              </button>
            </div>
          </div>
          <button onClick={onLeave} className="text-sm text-stone-400 hover:text-stone-100">
            离开
          </button>
        </div>

        <div className="mt-6 space-y-2">
          {players.map((player) => (
            <div key={player.id} className="flex items-center justify-between rounded border border-stone-800 bg-stone-950 px-4 py-2">
              <div className="flex items-center gap-3">
                <span className="text-stone-500">#{player.seat + 1}</span>
                <span>{player.nickname}</span>
                {player.isHost && <span className="rounded bg-blood px-1.5 py-0.5 text-xs text-white">房主</span>}
                {player.id === playerId && <span className="rounded bg-stone-700 px-1.5 py-0.5 text-xs text-white">你</span>}
                {!player.connected && <span className="rounded bg-stone-700 px-1.5 py-0.5 text-xs text-stone-300">掉线</span>}
              </div>
              <div className="flex items-center gap-2">
                {player.id === playerId && (
                  <button
                    className="rounded border border-stone-600 px-2 py-1 text-xs text-stone-300 hover:bg-stone-700"
                    onClick={() => toggleReady(player.id)}
                  >
                    {player.ready ? '取消准备' : '准备'}
                  </button>
                )}
                {debug && isHost && player.id !== playerId && (
                  <button
                    className="rounded border border-stone-600 px-2 py-1 text-xs text-stone-300 hover:bg-stone-700"
                    onClick={() => toggleReady(player.id)}
                  >
                    {player.ready ? '取消准备' : '准备'}
                  </button>
                )}
                <span className={player.ready ? 'text-green-400' : 'text-stone-500'}>
                  {player.ready ? '已准备' : '未准备'}
                </span>
              </div>
            </div>
          ))}
          {players.length < 5 && (
            <p className="text-center text-xs text-stone-500">
              还需要 {5 - players.length} 名玩家才能开始
            </p>
          )}
        </div>

        {debug && isHost && (
          <div className="mt-4">
            <button
              className="rounded bg-stone-700 px-3 py-1.5 text-sm text-white hover:bg-stone-600 disabled:opacity-40"
              disabled={!canAdd}
              onClick={addSimulatedPlayer}
            >
              添加模拟玩家
            </button>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2">
          {isHost ? (
            <button
              className="rounded bg-stone-700 px-4 py-2 font-semibold text-white hover:bg-stone-600"
              onClick={() => {
                const hostPlayer = players.find((p) => p.id === playerId);
                if (hostPlayer) toggleReady(hostPlayer.id);
              }}
            >
              {players.find((p) => p.id === playerId)?.ready ? '取消准备' : '准备'}
            </button>
          ) : (
            <button
              className="rounded bg-stone-700 px-4 py-2 font-semibold text-white hover:bg-stone-600"
              onClick={() => toggleReady(playerId)}
            >
              {players.find((p) => p.id === playerId)?.ready ? '取消准备' : '准备'}
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
