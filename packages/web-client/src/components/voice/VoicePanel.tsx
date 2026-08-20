import { useEffect, useMemo, useState } from 'react';
import type { ClientView, SpeakingDirection } from '@rose-blade/game-engine';
import type { VoiceController } from '../../voice/VoiceController';

type VoicePlayer = { id: string; nickname: string };

export function VoicePanel({
  controller,
  view,
  players,
  onEndSpeaking,
  onSelectSpeakingOrder,
}: {
  controller: VoiceController | null;
  view: ClientView | null;
  players: VoicePlayer[];
  onEndSpeaking?: () => void;
  onSelectSpeakingOrder?: (firstPlayerId: string, direction: SpeakingDirection) => void;
}) {
  const [, setTick] = useState(0);
  const [firstPlayerId, setFirstPlayerId] = useState(players[0]?.id ?? '');
  const [direction, setDirection] = useState<SpeakingDirection>('CLOCKWISE');

  useEffect(() => {
    if (!controller) return;
    return controller.subscribe(() => setTick((tick) => tick + 1));
  }, [controller]);

  useEffect(() => {
    if (players.length > 0 && !players.some((player) => player.id === firstPlayerId)) {
      setFirstPlayerId(players[0]?.id ?? '');
    }
  }, [firstPlayerId, players]);

  const voice = controller?.state;
  const speaker = players.find((player) => player.id === voice?.currentSpeakerId);
  const isLobby = !view;
  const isOrderSelection = view?.phase === 'ROUND_SPEAKING_PHASE' && !view.voice.currentSpeakerId;
  const canSelectOrder = isOrderSelection && view?.currentCoinHolderId === controller?.playerId;
  const permissionMessage = voice?.permission === 'DENIED'
    ? '需要麦克风权限才能进行游戏语音。'
    : voice?.permission === 'UNSUPPORTED'
      ? '当前浏览器或连接环境不支持麦克风。'
      : null;
  const formattedTime = voice ? `00:${String(voice.remainingSeconds).padStart(2, '0')}` : '00:00';
  const playerRows = useMemo(() => players, [players]);

  if (!controller) return null;

  return (
    <section className="voice-panel mt-6 rounded-lg border border-amber-700/50 bg-stone-900 p-4" aria-label="游戏语音控制">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-serif text-amber-200">{isLobby ? '房间语音' : '游戏语音'}</h2>
          <p className="text-xs text-stone-400">
            {isLobby ? '大厅自由语音' : voice?.mode === 'MUTED' ? '当前阶段禁止发言' : speaker ? `🎤 ${speaker.nickname} 发言中` : '等待发言顺序'}
          </p>
        </div>
        {voice?.currentSpeakerId && <span className="rounded border border-amber-600/60 bg-amber-950/50 px-2 py-1 font-mono text-sm text-amber-200">{formattedTime}</span>}
      </div>

      {permissionMessage && (
        <div className="mt-3 rounded border border-red-800/70 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          <span>{permissionMessage}</span>
          <button className="ml-3 underline hover:text-white" onClick={() => void controller.requestPermission()}>重新申请</button>
        </div>
      )}

      {isOrderSelection && (
        <div className="mt-3 rounded border border-stone-700 bg-stone-950 p-3">
          <p className="text-sm text-stone-300">金币持有者请选择第一位发言玩家和方向。</p>
          {canSelectOrder ? (
            <>
              <div className="mt-2 flex flex-wrap gap-2">
                {players.map((player) => (
                  <button key={player.id} className={`rounded border px-3 py-1 text-sm ${firstPlayerId === player.id ? 'border-amber-300 bg-amber-200 text-stone-900' : 'border-stone-600 text-stone-300 hover:bg-stone-700'}`} onClick={() => setFirstPlayerId(player.id)}>
                    {player.nickname}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(['CLOCKWISE', 'COUNTERCLOCKWISE'] as const).map((item) => (
                  <button key={item} className={`rounded border px-3 py-1 text-sm ${direction === item ? 'border-amber-300 bg-amber-200 text-stone-900' : 'border-stone-600 text-stone-300 hover:bg-stone-700'}`} onClick={() => setDirection(item)}>
                    {item === 'CLOCKWISE' ? '顺时针' : '逆时针'}
                  </button>
                ))}
                <button className="rounded bg-blood px-3 py-1 text-sm font-semibold text-white disabled:opacity-40" disabled={!firstPlayerId} onClick={() => onSelectSpeakingOrder?.(firstPlayerId, direction)}>
                  确认发言顺序
                </button>
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-stone-500">等待金币持有者选择发言顺序…</p>
          )}
        </div>
      )}

      {voice?.currentSpeakerId && view?.voice.mode === 'TURN_BASED' && view.voice.currentSpeakerId === controller.playerId && (
        <button className="mt-3 rounded bg-rose px-4 py-2 font-semibold text-stone-900 hover:bg-stone-100" onClick={onEndSpeaking}>
          结束发言
        </button>
      )}

      {isLobby && (
        <button className="mt-3 rounded border border-amber-500/70 px-4 py-2 text-sm text-amber-100 hover:bg-amber-900/40 disabled:opacity-40" disabled={voice?.permission !== 'GRANTED'} onClick={() => controller.toggleUserEnabled()}>
          {voice?.muted ? '开启麦克风' : '关闭麦克风'}
        </button>
      )}

      <div className="mt-3 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
        {playerRows.map((player) => {
          const active = player.id === voice?.currentSpeakerId;
          const enabled = controller.isPlayerEnabled(player.id);
          return (
            <div key={player.id} className={`flex items-center justify-between rounded border px-3 py-1.5 text-sm ${active ? 'border-amber-300 bg-amber-950/50 text-amber-100' : 'border-stone-800 bg-stone-950 text-stone-400'}`}>
              <span className="truncate">{player.nickname}</span>
              <span aria-label={active || enabled ? '麦克风开启' : '麦克风静音'}>{active || enabled ? '🎤' : '🔇'}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
