import { LoaderCircle, VolumeX } from 'lucide-react';
import type { AudioRecoveryAction, AudioRoutingNotice as Notice } from '../../../../shared/audio-health';
import { Button } from '@/components/ui/button';

export function AudioRoutingNotice({ notice, pending, onAction }: { notice: Notice | null; pending: boolean; onAction: (action: AudioRecoveryAction) => void }) {
  if (!notice) return null;
  const Icon = notice.tone === 'pending' ? LoaderCircle : VolumeX;
  return <div className="audio-routing-notice" data-tone={notice.tone} role="status" aria-live="polite" aria-atomic="true">
    <span className="audio-routing-notice__icon"><Icon aria-hidden="true" /></span>
    <p>{notice.message}</p>
    {notice.action ? <Button variant="ghost" size="sm" className="audio-routing-notice__action no-drag" disabled={pending}
      onClick={() => onAction(notice.action!)}>{pending ? 'Working…' : notice.label}</Button> : null}
  </div>;
}
