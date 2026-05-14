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
    <div className="flex h-full flex-col gap-5 pudding-card !p-6">
      <div className="flex items-center gap-2 text-milky-brown">
        <div className="bg-milky-apricot/30 p-2 rounded-xl">
           <QrCode className="h-6 w-6 text-milky-brown" />
        </div>
        <h2 className="text-xl font-black">邀請玩家</h2>
      </div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-milky-brown/40">INVITE CODE</p>
        <p className="mt-1 font-mono text-4xl font-black tracking-[0.3em] text-milky-brown">{inviteCode}</p>
      </div>
      <div className="rounded-2xl border-2 border-dashed border-milky-beige bg-milky-beige/20 p-4 text-xs font-bold text-milky-brown/60 break-all leading-relaxed">
        {inviteUrl}
      </div>
      <div className="flex flex-1 items-center justify-center rounded-3xl bg-white p-6 shadow-inner border-2 border-milky-beige/30">
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dataUrl} alt="邀請 QR Code" className="h-52 w-52 object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-2">
             <Loader2 className="h-6 w-6 animate-spin text-milky-brown/20" />
             <p className="text-sm font-bold text-milky-brown/40">產生 QR Code 中…</p>
          </div>
        )}
      </div>
    </div>
  );
}
