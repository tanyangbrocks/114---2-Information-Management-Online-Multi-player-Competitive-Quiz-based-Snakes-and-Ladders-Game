import Link from "next/link";
import { Gamepad2, Shield } from "lucide-react";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-10 px-4 py-16">
      <header className="space-y-3 text-center">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-700">Realtime Supabase</p>
        <h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl">蛇梯棋即時答題平台</h1>
        <p className="text-balance text-slate-600">
          以 Next.js App Router、Tailwind 與 Supabase Realtime 打造，支援多名玩家同步棋步、抽卡與主辦方控場。
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/host/setup"
          className="group flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm shadow-slate-200/60 backdrop-blur transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md"
        >
          <Shield className="h-8 w-8 text-sky-600" aria-hidden />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">主辦方入口</h2>
            <p className="mt-1 text-sm text-slate-600">建立場次、設定回合答案、後臺監看與發題。</p>
          </div>
          <span className="text-sm font-medium text-sky-700 group-hover:underline">前往設定 →</span>
        </Link>
        <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/60 p-6 text-left shadow-inner">
          <Gamepad2 className="h-8 w-8 text-indigo-600" aria-hidden />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">玩家入口</h2>
            <p className="mt-1 text-sm text-slate-600">請使用主辦方提供的邀請連結，格式為 /play/邀請碼。</p>
          </div>
        </div>
      </div>
    </main>
  );
}
