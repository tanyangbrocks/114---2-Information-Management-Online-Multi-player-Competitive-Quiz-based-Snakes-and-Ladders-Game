import { Suspense } from "react";
import { PlayClient } from "./PlayClient";

export default function PlayPage({ params }: { params: Promise<{ code: string }> }) {
  return (
    <Suspense
      fallback={<div className="flex min-h-[50vh] items-center justify-center text-slate-600">載入遊戲…</div>}
    >
      <PlayClient params={params} />
    </Suspense>
  );
}
