export function ConnectingScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-cathedral px-4">
      <div className="w-full max-w-md rounded-lg border border-stone-700 bg-stone-900 p-8 text-center">
        <h1 className="text-xl font-serif text-rose">{message}</h1>
        <p className="mt-4 text-stone-400">正在建立 P2P 连接，请稍候…</p>
        <div className="mx-auto mt-6 h-2 w-32 animate-pulse rounded bg-rose/60" />
      </div>
    </div>
  );
}
