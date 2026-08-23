import { useEffect, useMemo, useState } from 'react';
import { type Card, type ClientView } from '@rose-blade/game-engine';
import type { GameClient } from '../game/GameClient';
import { cardLabel, factionLabel, formatPile, phaseLabel, roleLabel } from '../game/labels';
import { RoundTable } from '../components/game-table/RoundTable';
import { HandCardArea } from '../components/game-table/HandCardArea';
import { VoicePanel } from '../components/voice/VoicePanel';
import type { VoiceController } from '../voice/VoiceController';

interface GameScreenProps {
  roomId: string;
  nickname: string;
  playerId: string;
  isHost: boolean;
  client: GameClient | null;
  debug: boolean;
  onExit: () => void;
  onBackToRoom: () => void;
  onRematch: () => void;
  voiceController: VoiceController | null;
}

const magicNames: Record<number, string> = {
  1: '强制出牌',
  2: '本轮不洗牌',
  3: '右侧随机出牌',
  4: '左侧随机出牌',
  5: '行动联动',
  6: '调整行动顺序',
  7: '获得幽魂',
  8: '左右邻强制出牌',
  9: '白蔷薇与司教信息',
  10: '换牌',
  11: '偷看一张手牌',
  12: '强制出牌',
};

const magicBook: Array<{ id: number; name: string; description: string }> = [
  {
    id: 1,
    name: magicNames[1]!,
    description: '指定一名仍有手牌的玩家，本轮必须出牌。',
  },
  {
    id: 2,
    name: magicNames[2]!,
    description: '本轮公开牌面时不洗牌，直接公开谁出了什么牌。',
  },
  {
    id: 3,
    name: magicNames[3]!,
    description: '你右手边玩家随机出一张手牌。',
  },
  {
    id: 4,
    name: magicNames[4]!,
    description: '你左手边玩家随机出一张手牌。',
  },
  {
    id: 5,
    name: magicNames[5]!,
    description: '指定两名玩家：前者出牌则后者必须出牌，前者跳过则后者也必须跳过。',
  },
  {
    id: 6,
    name: magicNames[6]!,
    description: '你选择正常顺序首位行动，或改为最后行动。',
  },
  {
    id: 7,
    name: magicNames[7]!,
    description: '指定一名玩家获得一张幽魂。',
  },
  {
    id: 8,
    name: magicNames[8]!,
    description: '你左右两侧玩家本轮必须出牌（可自己选择出哪张）。',
  },
  {
    id: 9,
    name: magicNames[9]!,
    description: '暗刃得知白蔷薇和司教是下面两人，但不知道具体对应。',
  },
  {
    id: 10,
    name: magicNames[10]!,
    description: '你可以不发动，或指定一名已出牌且有手牌的玩家换一张手牌作为本轮出牌。',
  },
  {
    id: 11,
    name: magicNames[11]!,
    description: '指定一名玩家，你看他一张手牌后再放回。',
  },
  {
    id: 12,
    name: magicNames[12]!,
    description: '同魔法 1：指定一名还有手牌的玩家，本轮必须出牌。',
  },
];

function playerNameById(view: ClientView, id: unknown): string {
  return typeof id === 'string' ? view.players.find((p) => p.id === id)?.nickname ?? id : '';
}

function formatMagicResolution(view: ClientView, payload: Record<string, unknown>): string | null {
  const magicId = Number(payload.magicId ?? 0);
  if (payload.skipped) return magicId === 10 ? '不发动' : '无合法目标，跳过';

  switch (magicId) {
    case 1:
    case 7:
    case 11:
    case 12:
      if (typeof payload.targetId === 'string') return `目标：${playerNameById(view, payload.targetId)}`;
      break;
    case 3:
      if (typeof payload.neighborId === 'string') return `右侧：${playerNameById(view, payload.neighborId)}`;
      break;
    case 4:
      if (typeof payload.neighborId === 'string') return `左侧：${playerNameById(view, payload.neighborId)}`;
      break;
    case 5:
      if (Array.isArray(payload.targetIds)) {
        const names = payload.targetIds.map((id) => playerNameById(view, id)).join('、');
        if (names) return `目标：${names}`;
      }
      break;
    case 6:
      if (payload.choice === 'LAST') return '选择最后行动';
      if (payload.choice === 'FIRST') return '选择正常顺序';
      break;
    case 8:
      if (typeof payload.leftId === 'string' && typeof payload.rightId === 'string') {
        return `左邻：${playerNameById(view, payload.leftId)}，右邻：${playerNameById(view, payload.rightId)}`;
      }
      break;
    case 10:
      if (typeof payload.targetId === 'string') return `目标：${playerNameById(view, payload.targetId)}`;
      break;
    default:
      break;
  }

  return null;
}

function getCurrentMagicResolvedEvent(view: ClientView): { payload: Record<string, unknown> } | null {
  for (let i = view.eventLog.length - 1; i >= 0; i -= 1) {
    const event = view.eventLog[i];
    if (!event) continue;
    if (event.type === 'CRYSTAL_REVEALED') break;
    if (event.type === 'MAGIC_RESOLVED') return event;
  }
  return null;
}

export function GameScreen({ roomId, nickname, isHost, client, debug, onExit, onBackToRoom, onRematch, voiceController }: GameScreenProps) {
  const [, setTick] = useState(0);
  const [viewAs, setViewAs] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    return client.subscribe(() => setTick((t) => t + 1));
  }, [client]);

  const players = client?.players ?? [];
  const activeViewerId = viewAs ?? client?.playerId ?? '';
  const view = client?.getView(activeViewerId) ?? null;
  const phase = (client?.phase ?? 'LOBBY') as ClientView['phase'] | 'LOBBY';
  const myPlayer = players.find((p) => p.id === activeViewerId);

  const confirmIdentity = () => {
    if (client && activeViewerId) {
      client.confirmIdentity(activeViewerId);
    }
  };

  const confirmAll = () => {
    if (!client) return;
    for (const p of client.players) {
      client.confirmIdentity(p.id);
    }
  };

  const gameOver = client?.getGameOverSnapshot();

  if (!client || !view) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cathedral">
        <p className="text-stone-400">正在进入游戏…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cathedral px-4 py-6">
      <div className="mx-auto max-w-7xl">
        <Header
          {...(debug && isHost ? { onDebugConfirmAll: confirmAll } : {})}
          roomId={roomId}
          nickname={nickname}
          isHost={isHost}
          view={view}
          phase={phase}
          players={players}
          activeViewerId={activeViewerId}
          onViewAs={setViewAs}
          debug={debug}
          onExit={onExit}
        />

        <div className="game-layout mt-6 grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
          <aside className="game-layout__history min-w-0 order-2 lg:order-1">
            <RoundHistoryPanel view={view} />
          </aside>

          <main className="min-w-0 order-1 lg:order-2">
            <MagicNotice view={view} />

            {phase === 'NIGHT_RECOGNITION' && (
              <IdentityPanel view={view} onConfirm={confirmIdentity} onConfirmAll={debug && isHost ? confirmAll : undefined} />
            )}

            {phase === 'NIGHT_DOUBLE_KNIFE' && (
              <NightPanel view={view} onContinue={confirmIdentity} />
            )}

            {(phase === 'ROUND_MAGIC_SELECT' || phase === 'INITIAL_COIN_PHASE') && (
              <CoinPhasePanel
                view={view}
                activePlayerId={activeViewerId}
                onSelect={(targetId) => client.handleCommand({ type: 'SELECT_COIN_TARGET', playerId: activeViewerId, targetId })}
              />
            )}

            {phase === 'MAGIC_RESOLUTION' && view.round?.magicNumber && (
              <MagicResolutionPanel
                view={view}
                activePlayerId={activeViewerId}
                magicId={view.round.magicNumber}
                onResolve={(targetIds, magic6Choice) =>
                  client.handleCommand({
                    type: 'RESOLVE_MAGIC',
                    playerId: activeViewerId,
                    targetIds,
                    ...(magic6Choice ? { magic6Choice } : {}),
                  })
                }
              />
            )}

            {phase === 'PLAYER_ACTIONS' && (
              <ActionPanel
                view={view}
                activePlayerId={activeViewerId}
                client={client}
              />
            )}

            {phase === 'PRE_REVEAL_MAGIC' && (
              <Magic10Panel view={view} activePlayerId={activeViewerId} client={client} />
            )}

            {phase === 'ROUND_REVEAL' && (
              <RevealPanel
                view={view}
                onReveal={() => client.handleCommand({ type: 'REVEAL', playerId: activeViewerId })}
              />
            )}

            {phase === 'ROUND_RESOLUTION' && (
              <ResolutionPanel
                view={view}
                onContinue={() => client.handleCommand({ type: 'RESOLVE_ROUND', playerId: activeViewerId })}
                mode="reveal"
              />
            )}

            {phase === 'CHECK_VICTORY' && (
              <ResolutionPanel
                view={view}
                onContinue={() => client.handleCommand({ type: 'CHECK_VICTORY', playerId: activeViewerId })}
                mode="resolution"
              />
            )}

            {phase === 'GAME_OVER' && gameOver && (
              <GameOverPanel
                gameOver={gameOver}
                rematchConfirmation={view.rematchConfirmation}
                onBackToRoom={onBackToRoom}
                onRematch={onRematch}
              />
            )}

            {view.me.magic9Reveal && (
              <Panel title="魔法 9 私人信息">
                <p className="text-stone-300">下面两名玩家分别是白蔷薇与司教：</p>
                <div className="mt-2 flex gap-2">
                  {[view.me.magic9Reveal.playerAId, view.me.magic9Reveal.playerBId].map((id) => (
                    <span key={id} className="rounded border border-stone-600 bg-stone-800 px-3 py-1">
                      {view.players.find((p) => p.id === id)?.nickname ?? id}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs text-stone-500">具体身份未知。</p>
              </Panel>
            )}

            {view.me.magic11Seen && (
              <Panel title="魔法 11 私人信息">
                <p className="text-stone-300">
                  你随机看到 {view.players.find((p) => p.id === view.me.magic11Seen?.targetId)?.nickname ?? '目标'} 的一张手牌：
                </p>
                <div className="mt-2">
                  <CardBadge card={view.me.magic11Seen.card} />
                </div>
              </Panel>
            )}

            <SeatMap view={view} myPlayerId={activeViewerId} currentPlayerId={client?.currentPlayerId ?? null} />


          </main>

          <aside className="game-layout__magic min-w-0 order-3">
            <ReferencePanels view={view} />
          </aside>
        </div>

        <VoicePanel
          controller={voiceController}
          view={view}
          players={view.players}
          onEndSpeaking={() => client.handleCommand({ type: 'END_SPEAKING', playerId: activeViewerId })}
          onSelectSpeakingOrder={(firstPlayerId, direction) => client.handleCommand({ type: 'SELECT_SPEAKING_ORDER', playerId: activeViewerId, firstPlayerId, direction })}
        />
      </div>
    </div>
  );
}

function Header({
  roomId,
  nickname,
  isHost,
  view,
  phase,
  players,
  activeViewerId,
  onViewAs,
  debug,
  onExit,
  onDebugConfirmAll,
}: {
  roomId: string;
  nickname: string;
  isHost: boolean;
  view: ClientView;
  phase: Parameters<typeof phaseLabel>[0];
  players: { id: string; nickname: string }[];
  activeViewerId: string;
  onViewAs: (id: string) => void;
  debug: boolean;
  onExit: () => void;
  onDebugConfirmAll?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h1 className="text-2xl font-serif text-rose">血与刃的白蔷薇</h1>
        <p className="text-sm text-stone-400">
          房间 {roomId} · {nickname} {isHost ? '(房主)' : ''} · 第 {view.roundNumber} 轮 · {phaseLabel(phase)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {debug && isHost && players.length > 0 && (
          <select
            className="rounded border border-stone-700 bg-stone-950 px-2 py-1 text-sm"
            value={activeViewerId}
            onChange={(e) => onViewAs(e.target.value)}
          >
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nickname}
              </option>
            ))}
          </select>
        )}
        {onDebugConfirmAll && (
          <button onClick={onDebugConfirmAll} className="rounded border border-amber-700/70 bg-amber-950/50 px-2 py-1 text-xs text-amber-200 hover:bg-amber-900/70">
            调试：一键全部确认
          </button>
        )}
        <button onClick={onExit} className="text-sm text-stone-400 hover:text-stone-100">
          退出
        </button>
      </div>
    </div>
  );
}

interface RoundHistoryEntry {
  roundNumber: number;
  magic: string | null;
  actions: Array<{ player: string; action: string; card?: Card }>;
  reveal: { cards: Card[]; playerMap: Record<string, Card> | null; shuffled: boolean } | null;
}

function buildRoundHistory(view: ClientView): RoundHistoryEntry[] {
  const entries: RoundHistoryEntry[] = [];
  let current: RoundHistoryEntry | null = null;

  const playerName = (playerId: string): string =>
    view.players.find((p) => p.id === playerId)?.nickname ?? playerId;

  for (const event of view.eventLog) {
    const payload = event.payload as Record<string, unknown>;
    if (event.type === 'CRYSTAL_REVEALED') {
      const roundNumber = Number(payload.roundNumber ?? view.roundNumber);
      current = { roundNumber, magic: null, actions: [], reveal: null };
      entries.push(current);
      continue;
    }
    if (!current) continue;

    if (event.type === 'MAGIC_RESOLVED') {
      const magicId = Number(payload.magicId ?? 0);
      const magic = magicBook.find((m) => m.id === magicId);
      const details = formatMagicResolution(view, payload);
      current.magic = `${magicId}. ${magic?.name ?? '未知魔法'}${details ? `（${details}）` : ''}`;
      continue;
    }
    if (event.type === 'CARD_PLAYED') {
      const playerId = String(payload.playerId ?? '');
      const card = typeof payload.card === 'string' ? (payload.card as Card) : undefined;
      current.actions.push({
        player: playerName(playerId),
        action: card ? `出牌：${cardLabel(card)}` : '出牌',
        ...(card ? { card } : {}),
      });
      continue;
    }
    if (event.type === 'PLAYER_PASSED') {
      current.actions.push({
        player: playerName(String(payload.playerId ?? '')),
        action: '跳过',
      });
      continue;
    }
    if (event.type === 'CARDS_REVEALED') {
      current.reveal = {
        cards: Array.isArray(payload.cards) ? (payload.cards as Card[]) : [],
        playerMap: payload.playerMap && typeof payload.playerMap === 'object'
          ? (payload.playerMap as Record<string, Card>)
          : null,
        shuffled: Boolean(payload.shuffled),
      };
    }
  }

  return entries;
}

function RoundHistoryPanel({ view }: { view: ClientView }) {
  const history = useMemo(() => buildRoundHistory(view), [view]);
  const [historyOpen, setHistoryOpen] = useState(true);

  return (
    <div className="rounded-lg border border-stone-700 bg-stone-900 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-rose">出牌记录</h3>
        <button
          className="rounded border border-stone-600 px-2 py-0.5 text-xs text-stone-300 hover:bg-stone-700"
          onClick={() => setHistoryOpen((open) => !open)}
        >
          {historyOpen ? '收起' : '展开'}
        </button>
      </div>
      {historyOpen && (history.length === 0 ? (
        <p className="mt-2 text-xs text-stone-500">游戏开始后这里会记录每一轮的出牌情况。</p>
      ) : (
        <div className="mt-3 space-y-4">
          {history.map((round) => (
            <div key={round.roundNumber} className="rounded border border-stone-800 bg-stone-950 p-3">
              <p className="text-xs font-semibold text-stone-300">
                第 {round.roundNumber} 轮{round.magic ? ` · ${round.magic}` : ''}
              </p>
              {round.actions.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-stone-400">
                  {round.actions.map((action, i) => (
                    <li key={`${round.roundNumber}-${i}`}>
                      <span className="text-stone-200">{action.player}</span> {action.action}
                      {action.card && <span className="ml-1 text-stone-500">（牌面已公开）</span>}
                    </li>
                  ))}
                </ul>
              )}
              {round.reveal && (
                <div className="mt-2 text-xs text-stone-400">
                  <p>{round.reveal.shuffled ? '公开牌面（已洗混）：' : '公开牌面对应：'}</p>
                  {round.reveal.playerMap ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {Object.entries(round.reveal.playerMap).map(([playerId, card]) => (
                        <span key={playerId} className="rounded bg-stone-800 px-1.5 py-0.5">
                          {view.players.find((p) => p.id === playerId)?.nickname ?? playerId}：
                          <CardBadge card={card} />
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {round.reveal.cards.map((card, i) => (
                        <CardBadge key={`${card}-${i}`} card={card} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function MagicNotice({ view }: { view: ClientView }) {
  const round = view.round;
  if (!round?.magicNumber) return null;
  const magic = magicBook.find((m) => m.id === round.magicNumber);
  const casterName = view.players.find((p) => p.id === round.crystalRevealerId)?.nickname ?? '未知玩家';
  const waiting = view.phase === 'MAGIC_RESOLUTION';
  const resolvedEvent = getCurrentMagicResolvedEvent(view);
  const details = resolvedEvent ? formatMagicResolution(view, resolvedEvent.payload) : null;

  return (
    <div className="rounded-lg border border-rose/40 bg-rose/10 px-4 py-3">
      <p className="text-sm text-rose">
        <span className="font-semibold">本轮魔法：{round.magicNumber}. {magic?.name ?? '未知'}</span>
        <span className="ml-3">发动者：{casterName}</span>
        {details && <span className="ml-3">{details}</span>}
        <span className="ml-3">{waiting ? '等待发动者解析…' : '已生效'}</span>
      </p>
    </div>
  );
}

function ReferencePanels({ view }: { view: ClientView }) {
  const [magicOpen, setMagicOpen] = useState(false);
  return (
    <div className="magic-book-panel rounded-lg border border-stone-700 bg-stone-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-rose">魔法之书</h3>
          <button className="rounded border border-stone-600 px-2 py-0.5 text-xs text-stone-300 hover:bg-stone-700" onClick={() => setMagicOpen((open) => !open)}>
            {magicOpen ? '收起' : '展开'}
          </button>
        </div>
        <span className="text-xs text-stone-400">
          水晶：{view.me.crystal !== null ? <span className="text-rose">{view.me.crystal}</span> : '已使用'}
        </span>
      </div>
      {magicOpen && (
        <div className="mt-3 grid gap-2">
          {magicBook.map((magic) => {
            const isMine = view.me.crystal === magic.id;
            return (
              <div key={magic.id} className={`rounded border p-2 ${isMine ? 'border-rose bg-rose/10' : 'border-stone-800 bg-stone-950'}`}>
                <p className="text-sm font-semibold text-stone-200">
                  {magic.id}. {magic.name}
                  {isMine && <span className="ml-1 text-xs text-rose">（你的水晶）</span>}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-stone-400">{magic.description}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConfirmationHint({ confirmation }: { confirmation: ClientView['phaseConfirmation'] }) {
  if (!confirmation) return null;
  return (
    <p className="mt-3 text-sm text-stone-500">
      {confirmation.confirmedByMe ? '你已确认，等待其他玩家确认…' : '请点击按钮确认。'}
      <span className="ml-1">（{confirmation.confirmed}/{confirmation.required} 人已确认）</span>
    </p>
  );
}

function IdentityPanel({
  view,
  onConfirm,
  onConfirmAll,
}: {
  view: ClientView;
  onConfirm: () => void;
  onConfirmAll?: (() => void) | undefined;
}) {
  return (
    <div className="mt-6 rounded-lg border border-rose/40 bg-stone-900 p-6">
      <h2 className="text-xl font-serif text-rose">你的身份</h2>
      <p className="mt-2 text-3xl font-bold">{roleLabel(view.me.role)}</p>
      <p className="text-stone-300">阵营：{factionLabel(view.me.faction)}</p>
      <div className="mt-4">
        <p className="text-sm text-stone-400">初始手牌</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {view.me.hand.map((card, i) => (
            <CardBadge key={`${card}-${i}`} card={card} />
          ))}
        </div>
        <p className="mt-2 text-sm text-stone-400">水晶：{view.me.crystal}</p>
      </div>
      <ConfirmationHint confirmation={view.phaseConfirmation} />
      {!view.phaseConfirmation?.confirmedByMe && (
        <div className="mt-5 flex gap-2">
          <button className="rounded bg-rose px-4 py-2 font-semibold text-stone-900 hover:bg-stone-100" onClick={onConfirm}>
            我知道了
          </button>
          {onConfirmAll && (
            <button className="rounded bg-stone-700 px-4 py-2 text-white hover:bg-stone-600" onClick={onConfirmAll}>
              全部玩家确认（调试）
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function NightPanel({ view, onContinue }: { view: ClientView; onContinue: () => void }) {
  return (
    <div className="mt-6 rounded-lg border border-stone-700 bg-stone-900 p-6">
      <h2 className="text-xl font-serif text-rose">夜间信息</h2>
      {view.me.nightRecognition ? (
        <p className="mt-2 text-sm text-stone-400">你看见过的玩家会在圆桌座位上显示眼睛标记。</p>
      ) : (
        <p className="mt-2 text-stone-400">你没有获得额外夜间信息。</p>
      )}
      {view.me.role === 'DOUBLE_KNIFE' && (
        <p className="mt-2 text-rose">你的幽魂已替换为第二张双刃。</p>
      )}
      <ConfirmationHint confirmation={view.phaseConfirmation} />
      {!view.phaseConfirmation?.confirmedByMe && (
        <button className="mt-4 rounded bg-rose px-4 py-2 font-semibold text-stone-900 hover:bg-stone-100" onClick={onContinue}>
          进入下一阶段
        </button>
      )}
    </div>
  );
}

function CoinPhasePanel({
  view,
  activePlayerId,
  onSelect,
}: {
  view: ClientView;
  activePlayerId: string;
  onSelect: (targetId: string) => void;
}) {
  const isActive = view.currentCoinHolderId === activePlayerId;
  const targets = view.players.filter((p) => p.hasCrystal && p.id !== activePlayerId);
  return (
    <Panel title="水晶阶段">
      {isActive ? (
        <>
          <p className="text-stone-300">你是当前金币持有人，请选择一名仍拥有水晶的玩家。</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {targets.map((p) => (
              <button
                key={p.id}
                className="rounded border border-rose px-4 py-2 text-rose hover:bg-rose hover:text-stone-900"
                onClick={() => onSelect(p.id)}
              >
                {p.nickname}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="text-stone-400">等待金币持有人选择水晶玩家…</p>
      )}
    </Panel>
  );
}

function MagicResolutionPanel({
  view,
  activePlayerId,
  magicId,
  onResolve,
}: {
  view: ClientView;
  activePlayerId: string;
  magicId: number;
  onResolve: (targetIds: string[], magic6Choice?: 'FIRST' | 'LAST') => void;
}) {
  const casterId = view.round?.crystalRevealerId;
  const isActive = casterId === activePlayerId;
  const [selected, setSelected] = useState<string[]>([]);

  const requiresTargets = [1, 5, 7, 11, 12].includes(magicId);
  const requiresTwoTargets = magicId === 5;
  const requiresChoice = magicId === 6;
  const targets = view.players.filter((p) => p.id !== casterId && p.handCount > 0);

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (requiresTwoTargets && prev.length >= 2) return prev;
      return [...prev, id];
    });
  };

  const canResolve = !requiresTargets || (requiresTwoTargets ? selected.length === 2 : selected.length === 1);

  return (
    <Panel title={`魔法解析：${magicNames[magicId] ?? magicId}`}>
      {!isActive ? (
        <p className="text-stone-400">等待魔法发动者操作…</p>
      ) : (
        <>
          {requiresTargets && (
            <>
              <p className="text-stone-300">{requiresTwoTargets ? '请选择两名玩家（行动联动）' : '请选择一名玩家'}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {targets.map((p) => (
                  <button
                    key={p.id}
                    className={`rounded border px-4 py-2 ${selected.includes(p.id) ? 'border-rose bg-rose text-stone-900' : 'border-stone-600 text-stone-300 hover:bg-stone-700'}`}
                    onClick={() => toggle(p.id)}
                  >
                    {p.nickname}
                  </button>
                ))}
              </div>
            </>
          )}
          {requiresChoice && (
            <div className="mt-3 flex gap-2">
              <button className="rounded border border-stone-600 px-4 py-2 text-stone-300 hover:bg-stone-700" onClick={() => onResolve([], 'FIRST')}>
                保持正常顺序
              </button>
              <button className="rounded border border-rose px-4 py-2 text-rose hover:bg-rose hover:text-stone-900" onClick={() => onResolve([], 'LAST')}>
                最后行动
              </button>
            </div>
          )}
          {!requiresTargets && !requiresChoice && (
            <p className="text-stone-400">该魔法无需额外选择，点击确认解析。</p>
          )}
          {(requiresTargets || !requiresChoice) && (
            <button
              className="mt-4 rounded bg-blood px-4 py-2 font-semibold text-white hover:bg-red-800 disabled:opacity-40"
              disabled={!canResolve}
              onClick={() => {
                if (requiresChoice) return;
                onResolve(selected);
              }}
            >
              确认解析
            </button>
          )}
        </>
      )}
    </Panel>
  );
}

function ActionPanel({
  view,
  activePlayerId,
  client,
}: {
  view: ClientView;
  activePlayerId: string;
  client: GameClient;
}) {
  const currentPlayerId = client.currentPlayerId;
  const isMyTurn = currentPlayerId === activePlayerId;
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null);
  const canPass = client.canPass(activePlayerId);
  const randomForced = client.isRandomForced(activePlayerId);
  const magic5Constraint = view.round?.magic5Constraint;
  const magic5EarlierAction = magic5Constraint?.laterId === activePlayerId
    ? view.round?.actions[magic5Constraint.earlierId]
    : undefined;
  const magic5MustPass = magic5EarlierAction === 'PASS';
  const magic5MustPlay = magic5EarlierAction === 'PLAYED';

  if (!isMyTurn) {
    const current = view.players.find((p) => p.id === currentPlayerId);
    return (
      <Panel title="玩家行动">
        <p className="text-stone-400">等待 {current?.nickname ?? '当前玩家'} 行动…</p>
      </Panel>
    );
  }

  const play = () => {
    if (randomForced) {
      client.handleCommand({ type: 'PLAY_CARD', playerId: activePlayerId, card: view.me.hand[0]! });
      return;
    }
    if (selectedCardIndex === null) return;
    const selectedCard = view.me.hand[selectedCardIndex];
    if (!selectedCard) return;
    client.handleCommand({ type: 'PLAY_CARD', playerId: activePlayerId, card: selectedCard });
  };

  return (
    <Panel title="你的行动">
      <p className="text-stone-300">
        {randomForced ? '你被魔法强制随机出牌。' : magic5MustPass ? '行动联动：第一位玩家弃牌，你必须跟随弃牌。' : magic5MustPlay ? '行动联动：第一位玩家出牌，你必须跟随出牌。' : canPass ? '请出牌或跳过。' : '你被强制要求出牌。'}
      </p>
      {!randomForced && !magic5MustPass && (
        <div className="mt-3 flex flex-wrap gap-2">
          {view.me.hand.map((card, i) => (
            <button
              key={`${card}-${i}`}
              className={`rounded border px-3 py-1 ${selectedCardIndex === i ? 'border-rose bg-rose text-stone-900' : 'border-stone-600 text-stone-200 hover:bg-stone-700'}`}
              onClick={() => setSelectedCardIndex((cur) => (cur === i ? null : i))}
            >
              {cardLabel(card)}
            </button>
          ))}
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <button
          className="rounded bg-blood px-4 py-2 font-semibold text-white hover:bg-red-800 disabled:opacity-40"
          disabled={!randomForced && !magic5MustPass && selectedCardIndex === null}
          onClick={play}
        >
          {randomForced ? '随机出牌' : '确认出牌'}
        </button>
        {(canPass && !magic5MustPlay) && (
          <button
            className="rounded border border-stone-600 px-4 py-2 text-stone-300 hover:bg-stone-700"
            onClick={() => client.handleCommand({ type: 'PASS', playerId: activePlayerId })}
          >
            跳过
          </button>
        )}
      </div>
    </Panel>
  );
}

function Magic10Panel({
  view,
  activePlayerId,
  client,
}: {
  view: ClientView;
  activePlayerId: string;
  client: GameClient;
}) {
  const pending = client.getPendingMagic10();
  if (!pending) return <Panel title="换牌">等待魔法结算…</Panel>;

  if (!pending.targetId) {
    const isCaster = pending.casterId === activePlayerId;
    if (!isCaster) return <Panel title="换牌">等待发动者选择…</Panel>;
    const candidates = view.players.filter((p) => {
      const action = view.round?.actions[p.id];
      return action === 'PLAYED' && p.handCount > 0;
    });
    return (
      <Panel title="魔法 10：换牌">
        <p className="text-stone-300">你可以不发动，或选择一名已出牌且仍有手牌的玩家。</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="rounded border border-stone-600 px-4 py-2 text-stone-300 hover:bg-stone-700"
            onClick={() => client.handleCommand({ type: 'MAGIC10_TARGET', playerId: activePlayerId, targetId: null })}
          >
            不发动
          </button>
          {candidates.map((p) => (
            <button
              key={p.id}
              className="rounded border border-rose px-4 py-2 text-rose hover:bg-rose hover:text-stone-900"
              onClick={() => client.handleCommand({ type: 'MAGIC10_TARGET', playerId: activePlayerId, targetId: p.id })}
            >
              {p.nickname}
            </button>
          ))}
        </div>
      </Panel>
    );
  }

  const isTarget = pending.targetId === activePlayerId;
  if (!isTarget) return <Panel title="换牌">等待被选玩家换牌…</Panel>;

  return (
    <Panel title="魔法 10：换牌">
      <p className="text-stone-300">请从当前手牌选择一张牌替换本轮已出的牌；如果手里还有同名牌，也可以选择它。</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {view.me.hand.map((card, i) => (
          <button
            key={`${card}-${i}`}
            className="rounded border border-rose px-4 py-2 text-rose hover:bg-rose hover:text-stone-900"
            onClick={() => client.handleCommand({ type: 'MAGIC10_REPLACEMENT', playerId: activePlayerId, replacementCard: card })}
          >
            {cardLabel(card)}
          </button>
        ))}
      </div>
    </Panel>
  );
}

function RevealPlayerInfo({ view }: { view: ClientView }) {
  const playerMap = view.round?.reveal?.playerMap;
  if (playerMap) {
    return (
      <div className="mt-2 text-sm text-stone-300">
        <p>本轮出牌对应：</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {Object.entries(playerMap).map(([playerId, card]) => {
            const nickname = view.players.find((p) => p.id === playerId)?.nickname ?? playerId;
            return (
              <span key={playerId} className="rounded border border-stone-600 bg-stone-800 px-2 py-1 text-xs">
                {nickname}：<CardBadge card={card} />
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  const playedPlayers = view.round
    ? Object.entries(view.round.actions)
        .filter(([, action]) => action === 'PLAYED')
        .map(([playerId]) => view.players.find((p) => p.id === playerId)?.nickname ?? playerId)
    : [];

  return (
    <div className="mt-2 text-sm text-stone-300">
      <p>本轮出牌玩家：{playedPlayers.length > 0 ? playedPlayers.join('、') : '无'}</p>
      {playedPlayers.length > 0 && <p className="text-xs text-stone-500">牌面已洗混，不公开具体对应关系。</p>}
    </div>
  );
}

function RevealPanel({ view, onReveal }: { view: ClientView; onReveal: () => void }) {
  const reveal = view.round?.reveal;
  return (
    <Panel title="揭示">
      <p className="text-stone-400">所有玩家已行动，准备公开本轮牌面。</p>
      <RevealPlayerInfo view={view} />
      {reveal && (
        <div className="mt-2 flex flex-wrap gap-2">
          {reveal.cards.map((card, i) => (
            <CardBadge key={`${card}-${i}`} card={card} />
          ))}
        </div>
      )}
      <ConfirmationHint confirmation={view.phaseConfirmation} />
      {!view.phaseConfirmation?.confirmedByMe && (
        <button className="mt-4 rounded bg-blood px-4 py-2 text-white hover:bg-red-800" onClick={onReveal}>
          揭示
        </button>
      )}
    </Panel>
  );
}

function ResolutionPanel({
  view,
  onContinue,
  mode,
}: {
  view: ClientView;
  onContinue: () => void;
  mode: 'reveal' | 'resolution';
}) {
  const reveal = view.round?.reveal;
  const resolution = view.round?.resolution;
  return (
    <Panel title={mode === 'reveal' ? '本轮公开牌' : '本轮结果'}>
      {mode === 'reveal' && reveal && (
        <>
          <RevealPlayerInfo view={view} />
          <div className="mt-2 flex flex-wrap gap-2">
            {reveal.cards.map((card, i) => (
              <CardBadge key={`${card}-${i}`} card={card} />
            ))}
          </div>
        </>
      )}
      {mode === 'resolution' && resolution && (
        <>
          <p>出现血刃：{resolution.hasBloodBlade ? '是' : '否'}</p>
          <p>出现白蔷薇：{resolution.hasWhiteRose ? '是' : '否'}</p>
          <p>花苞数量：{resolution.budCount}</p>
          <p>白蔷薇安全：{resolution.whiteRoseSafe ? '是' : '否'}</p>
          <div className="mt-2 text-sm text-stone-400">
            <p>献祭区：{formatPile(resolution.sacrificePile)}</p>
            <p>死亡区：{formatPile(resolution.deathPile)}</p>
            <p>血刃区：{formatPile(resolution.bladePile)}</p>
          </div>
        </>
      )}
      <ConfirmationHint confirmation={view.phaseConfirmation} />
      {!view.phaseConfirmation?.confirmedByMe && (
        <button className="mt-4 rounded bg-blood px-4 py-2 text-white hover:bg-red-800" onClick={onContinue}>
          {mode === 'reveal' ? '结算本轮' : '继续'}
        </button>
      )}
    </Panel>
  );
}

function GameOverPanel({
  gameOver,
  rematchConfirmation,
  onBackToRoom,
  onRematch,
}: {
  gameOver: NonNullable<ReturnType<GameClient['getGameOverSnapshot']>>;
  rematchConfirmation: ClientView['rematchConfirmation'];
  onBackToRoom: () => void;
  onRematch: () => void;
}) {
  const rematchConfirmed = rematchConfirmation?.confirmedByMe ?? false;
  return (
    <Panel title="游戏结束">
      <p className="text-3xl font-bold text-rose">{gameOver.winner === 'WHITE_ROSE' ? '白蔷薇阵营胜利' : '血刃阵营胜利'}</p>
      <p className="mt-2 text-stone-300">胜利原因：{gameOver.winReason}</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {gameOver.players.map((p) => (
          <div key={p.id} className="rounded border border-stone-700 bg-stone-950 p-3 text-sm">
            <p className="font-semibold">{p.nickname}</p>
            <p>身份：{roleLabel(p.role)}</p>
            <p>阵营：{factionLabel(p.faction)}</p>
            <p>手牌：{p.hand.map(cardLabel).join(', ') || '空'}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          className="rounded bg-blood px-4 py-2 font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={rematchConfirmed}
          onClick={onRematch}
        >
          {rematchConfirmed ? '已确认，等待其他玩家' : '再来一局'}
        </button>
        <button className="rounded border border-stone-600 px-4 py-2 font-semibold text-stone-300 hover:bg-stone-700" onClick={onBackToRoom}>
          返回房间
        </button>
      </div>
      {rematchConfirmation && (
        <p className="mt-3 text-sm text-stone-400">
          再来一局确认：{rematchConfirmation.confirmed}/{rematchConfirmation.required} 人
          {rematchConfirmation.allConfirmed ? '，正在开始…' : '，等待其他玩家确认。'}
        </p>
      )}
    </Panel>
  );
}

function SeatMap({ view, myPlayerId, currentPlayerId }: { view: ClientView; myPlayerId: string; currentPlayerId: string | null }) {
  const me = view.players.find((p) => p.id === myPlayerId);
  const [collapsed, setCollapsed] = useState(false);
  if (!me || view.players.length === 0) return null;

  return (
    <section className={`seat-map${collapsed ? ' seat-map--collapsed' : ''}`}>
      <button className="seat-map__toggle" type="button" onClick={() => setCollapsed((value) => !value)} aria-expanded={!collapsed}>
        {collapsed ? '展开座位图' : '收起座位图'}
      </button>
      {!collapsed && <>
        <RoundTable view={view} myPlayerId={myPlayerId} currentPlayerId={currentPlayerId} />
        <HandCardArea cards={view.me.hand} />
      </>}
    </section>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-lg border border-stone-700 bg-stone-900 p-6">
      <h2 className="text-lg font-serif text-rose">{title}</h2>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function CardBadge({ card }: { card: Card }) {
  return <span className="rounded border border-stone-600 bg-stone-800 px-3 py-1">{cardLabel(card)}</span>;
}
