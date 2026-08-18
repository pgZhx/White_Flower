import { useState } from 'react';

interface HomeScreenProps {
  initialRoom?: string | undefined;
  onCreate: (nickname: string) => void;
  onJoin: (nickname: string, roomId: string) => void;
}

export function HomeScreen({ initialRoom, onCreate, onJoin }: HomeScreenProps) {
  const [nickname, setNickname] = useState('');
  const [roomId, setRoomId] = useState(initialRoom ?? '');

  const handleCreate = () => {
    if (!nickname.trim()) return;
    onCreate(nickname.trim());
  };

  const handleJoin = () => {
    if (!nickname.trim() || !roomId.trim()) return;
    onJoin(nickname.trim(), roomId.trim().toUpperCase());
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-cathedral px-4">
      <div className="w-full max-w-md rounded-lg border border-stone-700 bg-stone-900 p-8 shadow-2xl">
        <h1 className="text-center text-3xl font-serif text-rose">血与刃的白蔷薇</h1>
        <p className="mt-2 text-center text-sm text-stone-400">朋友打开网页即可开始的在线桌游原型</p>
        <div className="mt-6 space-y-4">
          <input
            className="w-full rounded border border-stone-700 bg-stone-950 px-3 py-2 text-stone-100 outline-none focus:border-rose"
            placeholder="你的昵称"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
          <button
            className="w-full rounded bg-blood px-4 py-2 font-semibold text-white hover:bg-red-800 disabled:opacity-40"
            disabled={!nickname.trim()}
            onClick={handleCreate}
          >
            创建房间
          </button>
          <div className="flex items-center gap-2">
            <input
              className="flex-1 rounded border border-stone-700 bg-stone-950 px-3 py-2 text-stone-100 outline-none focus:border-rose"
              placeholder="房间码"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.toUpperCase())}
            />
            <button
              className="rounded border border-rose px-4 py-2 font-semibold text-rose hover:bg-rose hover:text-stone-900 disabled:opacity-40"
              disabled={!nickname.trim() || !roomId.trim()}
              onClick={handleJoin}
            >
              加入
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
