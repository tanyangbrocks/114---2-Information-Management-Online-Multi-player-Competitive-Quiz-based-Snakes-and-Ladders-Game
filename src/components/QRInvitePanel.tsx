"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { QrCode } from "lucide-react";

type Props = {
  inviteUrl: string;
  inviteCode: string;
};

export function QRInvitePanel({ inviteUrl, inviteCode }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(inviteUrl, { margin: 1, width: 220, color: { dark: "#0f172a", light: "#ffffff" } }).then(
      (url) => {
        if (!cancelled) setDataUrl(url);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [inviteUrl]);

  return (
    <div className="flex h-full flex-col gap-4 rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm">
      <div className="flex items-center gap-2 text-slate-900">
        <QrCode className="h-5 w-5 text-sky-600" />
        <h2 className="text-lg font-semibold">邀請玩家</h2>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500">邀請碼</p>
        <p className="mt-1 font-mono text-3xl font-bold tracking-[0.2em] text-slate-900">{inviteCode}</p>
      </div>
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 break-all">
        {inviteUrl}
      </div>
      <div className="flex flex-1 items-center justify-center rounded-xl bg-white p-3">
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dataUrl} alt="邀請 QR Code" className="h-52 w-52 object-contain" />
        ) : (
          <p className="text-sm text-slate-500">產生 QR Code 中…</p>
        )}
      </div>
    </div>
  );
}
