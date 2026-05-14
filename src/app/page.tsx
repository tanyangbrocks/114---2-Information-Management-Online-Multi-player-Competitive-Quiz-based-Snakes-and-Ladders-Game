import Link from "next/link";
import { Gamepad2, Shield, Sparkles } from "lucide-react";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-10 px-6 py-16 bg-milky-white page-fade-in">
      <header className="space-y-4 text-center">
        <div className="mx-auto w-fit rounded-full bg-milky-apricot/20 px-4 py-1 text-[10px] font-black uppercase tracking-[0.3em] text-milky-brown">
          Next.js + Supabase Realtime
        </div>
        <h1 className="text-4xl font-black text-milky-brown sm:text-5xl">
          蛇梯棋冒險平台
        </h1>
        <p className="mx-auto max-w-md text-balance text-sm font-bold text-milky-brown/50">
          結合即時答題、策略卡牌與技能系統。享受軟萌圓潤的遊戲體驗，與好友展開一場奶茶般的甜蜜冒險！
        </p>
      </header>

      <div className="grid gap-6 sm:grid-cols-2">
        <Link
          href="/host/setup"
          className="group pudding-card border-2 flex flex-col gap-4 p-8 transition-all hover:-translate-y-1 hover:border-milky-apricot/50"
        >
          <div className="h-12 w-12 rounded-2xl bg-milky-brown text-white flex items-center justify-center shadow-lg group-hover:rotate-6 transition-transform">
             <Shield className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <h2 className="text-xl font-black text-milky-brown">主辦方入口</h2>
            <p className="mt-2 text-sm font-bold text-milky-brown/40">建立場次、設定題目、掌控全局進度。</p>
          </div>
          <span className="mt-auto text-xs font-black text-milky-apricot uppercase tracking-widest group-hover:translate-x-1 transition-transform">前往設定 →</span>
        </Link>

        <div className="pudding-card border-2 border-dashed border-milky-beige flex flex-col gap-4 p-8 opacity-80">
          <div className="h-12 w-12 rounded-2xl bg-milky-apricot text-white flex items-center justify-center shadow-lg">
             <Gamepad2 className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <h2 className="text-xl font-black text-milky-brown">玩家入口</h2>
            <p className="mt-2 text-sm font-bold text-milky-brown/40">請使用主辦方提供的邀請網址加入遊戲。</p>
          </div>
          <div className="mt-auto flex items-center gap-2 text-[10px] font-black text-milky-brown/30 uppercase tracking-tighter">
             <Sparkles className="h-3 w-3" />
             WAITING FOR INVITATION
          </div>
        </div>
      </div>
    </main>
  );
}
