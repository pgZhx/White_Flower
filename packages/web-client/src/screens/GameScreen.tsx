import { useEffect, useMemo, useState } from 'react';
import type { HostGameController } from '../game/HostGameController';

interface GameScreenProps {
  roomId: string;
  nickname: string;
  playerId: string;
  isHost: boolean;
  controller: HostGameController | null;
  onExit: () => void;
}

export function GameScreen({ roomId, nickname, isHost, controller, onExit }: GameScreenProps) {
  const [, setTick] = useState(0);
  const [viewAs, setViewAs] = useState<string | null>(null);

  useEffect(() => {
    if (!controller) return;
    return controller.subscribe(() => setTick((t) => t + 1));
  }, [controller]);

  const players = controller?.room.players ?? [];
  const activeViewerId = viewAs ?? controller?.hostPlayerId ?? '';
  const view = controller?.getView(activeViewerId) ?? null;
  const phase = controller?.phase ?? 'LOBBY';
  const myPlayer = players.find((p) => p.id === activeViewerId);

  const confirmIdentity = () => {
    if (controller && activeViewerId) {
      controller.confirmIdentity(activeViewerId);
    }
  };

  const confirmAll = () => {
    if (!controller) return;
    for (const p of controller.room.players) {
      controller.confirmIdentity(p.id);
    }
  };

  const publicInfo = useMemo(() => {
    if (!view) return null;
    return {
      phase: view.phase,
      roundNumber: view.roundNumber,
      currentCoinHolderId: view.currentCoinHolderId,
      players: view.players,
      sacrificePile: view.sacrificePile,
      deathPile: view.deathPile,
      bladePile: view.bladePile,
      whiteRoseSafe: view.whiteRoseSafe,
    };
  }, [view]);

  if (!controller || !view) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cathedral">
        <p className="text-stone-400">正在进入游戏…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cathedral px-4 py-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-serif text-rose">血与刃的白蔷薇</h1>
            <p className="text-sm text-stone-400">
              房间 {roomId} · {nickname} {isHost ? '(房主)' : ''} · 第 {view.roundNumber} 轮 · {phase}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isHost && players.length > 0 && (
              <select
                className="rounded border border-stone-700 bg-stone-950 px-2 py-1 text-sm"
                value={activeViewerId}
                onChange={(e) => setViewAs(e.target.value)}
              >
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nickname}
                  </option>
                ))}
              </select>
            )}
            <button onClick={onExit} className="text-sm text-stone-400 hover:text-stone-100">
              退出
            </button>
          </div>
        </div>

        {/* Identity confirmation */}
        {phase === 'NIGHT_RECOGNITION' && !controller.allIdentitiesConfirmed && (
          <div className="mt-6 rounded-lg border border-rose/40 bg-stone-900 p-6">
            <h2 className="text-xl font-serif text-rose">你的身份</h2>
            <p className="mt-2 text-3xl font-bold">{view.me.role}</p>
            <p className="text-stone-300">阵营：{view.me.faction}</p>
            <div className="mt-4">
              <p className="text-sm text-stone-400">初始手牌</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {view.me.hand.map((card, i) => (
                  <span key={`${card}-${i}`} className="rounded border border-stone-600 bg-stone-800 px-3 py-1">
                    {card}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-sm text-stone-400">水晶：{view.me.crystal}</p>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                className="rounded bg-rose px-4 py-2 font-semibold text-stone-900 hover:bg-stone-100"
                onClick={confirmIdentity}
              >
                我知道了
              </button>
              {isHost && (
                <button
                  className="rounded bg-stone-700 px-4 py-2 text-white hover:bg-stone-600"
                  onClick={confirmAll}
                >
                  全部玩家确认（调试）
                </button>
              )}
            </div>
          </div>
        )}

        {/* Night info */}
        {phase === 'NIGHT_DOUBLE_KNIFE' && (
          <div className="mt-6 rounded-lg border border-stone-700 bg-stone-900 p-6">
            <h2 className="text-xl font-serif text-rose">夜间信息</h2>
            {view.me.nightRecognition ? (
              <>
                <p className="mt-2 text-stone-300">与你一同在夜间睁眼的玩家：</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {view.me.nightRecognition.map((id) => {
                    const p = view.players.find((x) => x.id === id);
                    return <span key={id} className="rounded border border-stone-600 bg-stone-800 px-3 py-1">{p?.nickname ?? id}</span>;
                  })}
                </div>
                <p className="mt-2 text-xs text-stone-500">你只知道这些玩家参与了夜间相认，不知道具体身份。</p>
              </>
            ) : (
              <p className="mt-2 text-stone-400">你没有获得额外夜间信息。</p>
            )}
            {view.me.role === 'DOUBLE_KNIFE' && (
              <p className="mt-2 text-rose">你的 Ghost 已替换为第二张 Double Knife。</p>
            )}
            <button
              className="mt-4 rounded bg-rose px-4 py-2 font-semibold text-stone-900 hover:bg-stone-100"
              onClick={confirmIdentity}
            >
              进入下一阶段
            </button>
          </div>
        )}

        {/* Game board skeleton */}
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-stone-700 bg-stone-900 p-4">
            <h3 className="text-sm text-stone-400">当前状态</h3>
            <p className="mt-2">阶段：{publicInfo?.phase}</p>
            <p>当前金币：{publicInfo?.currentCoinHolderId ? view.players.find((p) => p.id === publicInfo.currentCoinHolderId)?.nickname ?? publicInfo.currentCoinHolderId : '无'}</p>
            <p>白蔷薇安全：{publicInfo?.whiteRoseSafe ? '是' : '否'}</p>
          </div>
          <div className="rounded-lg border border-stone-700 bg-stone-900 p-4">
            <h3 className="text-sm text-stone-400">牌堆</h3>
            <p>献祭区：{(publicInfo?.sacrificePile ?? []).join(', ') || '空'}</p>
            <p>死亡区：{(publicInfo?.deathPile ?? []).join(', ') || '空'}</p>
            <p>血刃区：{(publicInfo?.bladePile ?? []).join(', ') || '空'}</p>
          </div>
          <div className="rounded-lg border border-stone-700 bg-stone-900 p-4">
            <h3 className="text-sm text-stone-400">我的区域</h3>
            <p>身份：{view.me.role}</p>
            <p>阵营：{view.me.faction}</p>
            <p>手牌：{view.me.hand.join(', ') || '空'}</p>
            <p>水晶：{view.me.crystal ?? '已使用'}</p>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-stone-700 bg-stone-900 p-4">
          <h3 className="text-sm text-stone-400">玩家列表</h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {view.players.map((p) => (
              <div key={p.id} className="rounded border border-stone-800 bg-stone-950 px-3 py-2 text-sm">
                <div className="flex justify-between">
                  <span>{p.nickname}</span>
                  {myPlayer?.id === p.id && <span className="text-rose">你</span>}
                </div>
                <p className="text-xs text-stone-500">手牌 {p.handCount} · 水晶 {p.hasCrystal ? '有' : '无'}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
