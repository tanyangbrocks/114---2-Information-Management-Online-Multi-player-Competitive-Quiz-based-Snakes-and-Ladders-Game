import { Suspense } from "react";
import { HostGameClient } from "./HostGameClient";

export default function HostGamePage({ params }: { params: Promise<{ gameId: string }> }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-slate-600">載入主辦後臺…</div>
      }
    >
      <HostGameClient params={params} />
    </Suspense>
  );
}
