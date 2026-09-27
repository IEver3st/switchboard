import { useId, useRef, useState } from 'react';
import { Download, LoaderCircle } from 'lucide-react';
import { communityModuleReviewSchema, type CommunityModuleReview, type ModuleManifest } from '../../../../shared/contracts';
import { switchboardApi } from '@/lib/demo-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function CommunityModuleInstall({ repository: initialRepository = '' }: { repository?: string }) {
  const fieldId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [repository, setRepository] = useState(initialRepository);
  const [review, setReview] = useState<CommunityModuleReview | null>(null);
  const [pending, setPending] = useState<'review' | 'install' | null>(null);
  const [error, setError] = useState('');
  const [installed, setInstalled] = useState(false);

  const inspect = async () => {
    setPending('review'); setError(''); setReview(null);
    try { setReview(communityModuleReviewSchema.parse(await switchboardApi.inspectCommunityModule({ repository }))); }
    catch (cause) { setError(message(cause)); }
    finally { setPending(null); }
  };
  const install = async () => {
    if (!review) return;
    setPending('install'); setError('');
    try { await switchboardApi.installCommunityModule({ reviewId: review.reviewId }); setInstalled(true); }
    catch (cause) { setError(message(cause)); setReview(null); }
    finally { setPending(null); }
  };

  return <>
    <Button ref={trigger} type="button" variant="secondary" size="sm" data-community-install onClick={() => {
      setRepository(initialRepository); setReview(null); setError(''); setInstalled(false); setOpen(true);
    }}><Download aria-hidden />{initialRepository ? 'Review update' : 'Install from GitHub'}</Button>
    <Dialog open={open} onOpenChange={value => { if (!pending) setOpen(value); }}>
      <DialogContent className="community-module-dialog" data-community-dialog onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }} onEscapeKeyDown={event => { if (pending) event.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>{installed ? 'Module installed' : 'Install from GitHub'}</DialogTitle>
          <DialogDescription>{installed ? 'The module is off. Enable it under Features when you are ready.' : 'Install a community device discovery module from a public GitHub release.'}</DialogDescription>
        </DialogHeader>
        {!installed && <form className="community-module-form" onSubmit={event => { event.preventDefault(); void inspect(); }}>
          <label htmlFor={fieldId}>GitHub repository</label>
          <div className="community-module-input">
            <Input id={fieldId} value={repository} placeholder="https://github.com/owner/repository" disabled={pending !== null}
              onChange={event => { setRepository(event.target.value); setReview(null); setError(''); }} autoComplete="off" spellCheck={false} />
            <Button type="submit" variant="secondary" size="sm" disabled={pending !== null || !repository.trim()}>
              {pending === 'review' && <LoaderCircle className="animate-spin" aria-hidden />} {pending === 'review' ? 'Checking…' : 'Review'}
            </Button>
          </div>
        </form>}
        {review && !installed && <div className="community-module-review" data-community-review>
          <div><strong>{review.manifest.name}</strong><span>v{review.manifest.version} · {review.manifest.author}</span></div>
          <p>{review.manifest.description}</p>
          <dl>
            <dt>Source</dt><dd>{review.distribution.repository} · {review.distribution.release}</dd>
            <dt>Device access</dt><dd>Read device names and identity for {review.manifest.permissions.hid.map(permission =>
              permission.productIds.map(productId => `${permission.vendorId}:${productId}`).join(', ')).join(', ')}.</dd>
            <dt>Limits</dt><dd>No hardware writes, network, file access, or custom pages.</dd>
            {review.installedVersion && <><dt>Update</dt><dd>Replaces v{review.installedVersion}. The previous version remains available for rollback. Enable the new version after installation.</dd></>}
          </dl>
          <p className="community-module-trust">Package signature and download verified. The author is self-identified; this module has not been reviewed by Switchboard.</p>
          <details><summary>Signing key</summary><code>{review.distribution.publisher}</code></details>
        </div>}
        {error && <p role="alert" className="community-module-error">{error}</p>}
        <div className="community-module-footer">
          <Button type="button" variant="ghost" size="sm" disabled={pending !== null} onClick={() => setOpen(false)}>{installed ? 'Done' : 'Cancel'}</Button>
          {review && !installed && <Button type="button" variant="primary" size="sm" disabled={pending !== null} onClick={() => void install()} data-community-confirm>
            {pending === 'install' && <LoaderCircle className="animate-spin" aria-hidden />}{pending === 'install' ? 'Installing…' : review.installedVersion ? 'Install update' : 'Install module'}
          </Button>}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}

export function CommunityModuleActions({ module }: { module: ModuleManifest }) {
  const [confirmation, setConfirmation] = useState(false);
  const [block, setBlock] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const manage = async (action: 'remove' | 'rollback' | 'block-publisher') => {
    setPending(true); setError('');
    try { await switchboardApi.manageCommunityModule({ moduleId: module.id, action }); setConfirmation(false); }
    catch (cause) { setError(message(cause)); }
    finally { setPending(false); }
  };
  if (!module.distribution) return null;
  return <section className="community-module-actions" aria-label="Community module management">
    <div className="community-module-buttons">
      <CommunityModuleInstall repository={module.distribution.repository} />
      {module.distribution.previous && <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => void manage('rollback')}>Roll back to {module.distribution.previous.release}</Button>}
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setConfirmation(true)}>Remove…</Button>
    </div>
    {confirmation && <div className="community-module-remove">
      <p>Remove {module.name} and stop its device discovery?</p>
      <label><input type="checkbox" checked={block} disabled={pending} onChange={event => setBlock(event.target.checked)} /> Also block this signing key and remove all its modules.</label>
      <div className="community-module-buttons">
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setConfirmation(false)}>Cancel</Button>
        <Button type="button" variant="danger" size="sm" disabled={pending} onClick={() => void manage(block ? 'block-publisher' : 'remove')}>{pending ? 'Removing…' : 'Remove module'}</Button>
      </div>
    </div>}
    {error && <p role="alert" className="community-module-error">{error}</p>}
    {pending && <span role="status">Updating module…</span>}
  </section>;
}

function message(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
}
