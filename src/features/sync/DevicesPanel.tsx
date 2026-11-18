// Paired devices on Progress Sync: pair by QR code, see who's online, sync now, unpair.
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import QRCode from 'qrcode';
import { AlertTriangle, Check, ClipboardCopy, Link2, QrCode, RefreshCw, Unlink } from 'lucide-react';
import { timeAgo, useNow } from '@/ui/time';
import { syncSaveNow, useSaveWatch } from '@/features/progress/liveSave';
import { deviceName } from './device';
import { ensureGroup, pairLink, renameDeviceTo, setAutoSync, syncDevicesNow, unpair, useSync } from './sync';

const KIND_LABEL = { progress: 'save progress', reveals: 'reveals', settings: 'settings', builds: 'saved builds', live: 'live run' } as const;

export function DevicesPanel() {
  const { group, auto, status, peers, last, mismatch, error } = useSync();
  const watching = useSaveWatch((s) => s.status === 'live');
  const now = useNow();
  const [showPair, setShowPair] = useState(false);
  const [confirmUnpair, setConfirmUnpair] = useState(false);

  return (
    <div className="space-y-3">
      <div className="panel p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <StatusDot status={group && auto ? status : 'off'} peers={peers.length} />
          <div className="min-w-0 flex-1 text-sm">
            {!group ? (
              <p className="text-muted">Pair your phone, tablet or another computer once and they stay in sync by themselves.</p>
            ) : !auto ? (
              <p className="text-muted">Auto-sync is paused on this device.</p>
            ) : peers.length ? (
              <p>
                Connected to <b>{peers.map((p) => p.name).join(', ')}</b>
              </p>
            ) : (
              <p className="text-muted">{status === 'connecting' ? 'Looking for your other devices…' : 'Waiting for your other devices to open the companion.'}</p>
            )}
            {last && (
              <p className="mt-0.5 text-xs text-faint">
                Got {KIND_LABEL[last.kind]} from {last.from} {timeAgo(last.at, now)}
              </p>
            )}
          </div>
        </div>

        <DeviceNameField />

        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => setShowPair(!showPair)} className="inline-flex items-center gap-2 btn-game font-game text-[16px] px-4 py-2">
            <QrCode size={16} /> {showPair ? 'Hide code' : group ? 'Pair another device' : 'Pair a device'}
          </button>
          {group && (
            <>
              <button
                onClick={() => {
                  if (watching) void syncSaveNow();
                  syncDevicesNow();
                }}
                className="inline-flex items-center gap-2 btn-game quiet font-game text-[16px] px-4 py-2"
              >
                <RefreshCw size={16} /> Sync now
              </button>
              <label className="inline-flex cursor-pointer items-center gap-2 px-2 text-sm text-muted">
                <input type="checkbox" checked={auto} onChange={(e) => void setAutoSync(e.target.checked)} className="accent-[var(--ember)]" />
                Auto-sync
              </label>
              <button
                onClick={() => (confirmUnpair ? void unpair().then(() => setConfirmUnpair(false)) : setConfirmUnpair(true))}
                onBlur={() => setConfirmUnpair(false)}
                className={`ml-auto inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${confirmUnpair ? 'bg-blood/15 text-blood' : 'text-muted hover:text-blood'}`}
              >
                <Unlink size={15} /> {confirmUnpair ? 'Unpair this device?' : 'Unpair'}
              </button>
            </>
          )}
        </div>

        {mismatch && (
          <p className="mt-3 flex gap-2 rounded-lg border border-gold/40 bg-gold/10 p-2.5 text-xs text-gold">
            <AlertTriangle size={15} className="shrink-0" />
            {mismatch} is on a different version of the companion, so its save wasn’t applied. Reload the app on both devices to update.
          </p>
        )}
        {error && <p className="mt-3 text-sm text-blood">{error}</p>}
      </div>

      <AnimatePresence>{showPair && <PairCode />}</AnimatePresence>

      <p className="text-xs text-faint">
        Devices connect to each other directly (over your Wi-Fi when they share it). Free public relays only introduce them, and that handshake is encrypted
        with your pairing key. What syncs: save progress, reveals, saved builds and settings. Performance mode and frame-rate settings stay per device.
      </p>
    </div>
  );
}

function StatusDot({ status, peers }: { status: string; peers: number }) {
  const on = status === 'online' && peers > 0;
  const color = on ? 'bg-toxic' : status === 'error' ? 'bg-blood' : status === 'off' ? 'bg-faint' : 'bg-gold';
  return (
    <span className="inline-flex items-center gap-2 font-game text-[16px]">
      <span className={`h-2.5 w-2.5 rounded-full ${color} ${on ? 'animate-pulse' : ''}`} aria-hidden />
      {on ? `${peers} online` : status === 'off' ? 'Off' : status === 'error' ? 'Error' : 'Waiting'}
    </span>
  );
}

function DeviceNameField() {
  const [name, setName] = useState(deviceName);
  return (
    <label className="mt-3 flex items-center gap-2 text-sm text-muted">
      This device
      <input
        value={name}
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => renameDeviceTo(name)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 text-ink focus:border-line-strong focus:outline-none sm:max-w-60"
      />
    </label>
  );
}

function PairCode() {
  const [link, setLink] = useState('');
  const [svg, setSvg] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void (async () => {
      const url = pairLink(await ensureGroup());
      setLink(url);
      setSvg(await QRCode.toString(url, { type: 'svg', margin: 2, errorCorrectionLevel: 'M', color: { dark: '#0d0b10', light: '#ffffff' } }));
    })();
  }, []);

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
      <div className="flex flex-col items-center gap-4 panel p-5 sm:flex-row sm:items-start">
        <div className="w-56 max-w-full shrink-0 overflow-hidden rounded-xl" dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="text-sm text-muted">
          <p className="flex items-center gap-2 font-medium text-ink">
            <Link2 size={16} /> Scan with the other device’s camera
          </p>
          <p className="mt-2">It opens the companion there and pairs it. From then on both keep each other up to date whenever they’re open.</p>
          <p className="mt-2">Treat this code like a key: anyone with it can join your sync group.</p>
          <button
            onClick={() => {
              void navigator.clipboard.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="mt-3 inline-flex items-center gap-2 btn-game quiet font-game text-[16px] px-3 py-1.5"
          >
            {copied ? <Check size={15} className="text-toxic" /> : <ClipboardCopy size={15} />} {copied ? 'Copied' : 'Copy pairing link'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
