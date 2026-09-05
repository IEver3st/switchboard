import { useEffect, useRef, type RefObject } from 'react';
import { videoTextSize, type VideoEdits } from '../../../../shared/video-edits';

export function VideoEditPreview({ videoRef, edits, canvasSize = 'original' }: {
  videoRef: RefObject<HTMLVideoElement | null>; edits?: VideoEdits; canvasSize?: string;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay) return;
    video.playbackRate = edits?.speed ?? 1;
    video.preservesPitch = true;
    video.style.filter = `brightness(${1 + (edits?.brightness ?? 0)}) contrast(${edits?.contrast ?? 1}) saturate(${edits?.saturation ?? 1})`;
    video.style.scale = edits?.flipHorizontal ? '-1 1' : '';
    const updateVisibility = () => {
      const text = edits?.text;
      const time = video.currentTime * 1000;
      overlay.hidden = !text?.content || time < text.startMs || time >= text.endMs;
    };
    const update = () => {
      updateVisibility();
      const text = edits?.text;
      if (!text) return;
      const bounds = video.getBoundingClientRect();
      const parent = overlay.parentElement!.getBoundingClientRect();
      const ratio = canvasSize === '9:16' ? 9 / 16 : (video.videoWidth || 16) / (video.videoHeight || 9);
      const width = Math.min(bounds.width, bounds.height * ratio);
      const height = Math.min(bounds.height, bounds.width / ratio);
      overlay.style.left = `${bounds.left - parent.left + (bounds.width - width) / 2}px`;
      overlay.style.top = `${bounds.top - parent.top + (bounds.height - height) / 2}px`;
      overlay.style.width = `${width}px`;
      overlay.style.height = `${height}px`;
      overlay.style.padding = `${height * 0.08}px ${width * 0.06}px`;
      const longest = Math.max(1, ...text.content.split('\n').map((line) => [...line].length));
      overlay.style.fontSize = `${Math.min(height * videoTextSize[text.size], width * 0.88 / (longest * 0.65), height * 0.7 / Math.max(1, text.content.split('\n').length) / 1.2)}px`;
    };
    const observer = new ResizeObserver(update);
    observer.observe(video);
    video.addEventListener('loadedmetadata', update);
    for (const event of ['timeupdate', 'seeked']) video.addEventListener(event, updateVisibility);
    let frame: number | null = null;
    const tick = () => { frame = null; updateVisibility(); if (!video.paused && edits?.text?.content) frame = video.requestVideoFrameCallback(tick); };
    const stop = () => { if (frame !== null) video.cancelVideoFrameCallback(frame); frame = null; };
    const play = () => { stop(); if (edits?.text?.content) frame = video.requestVideoFrameCallback(tick); };
    video.addEventListener('play', play);
    video.addEventListener('pause', stop);
    if (!video.paused) play();
    update();
    return () => { stop(); video.removeEventListener('play', play); video.removeEventListener('pause', stop); observer.disconnect(); video.removeEventListener('loadedmetadata', update); for (const event of ['timeupdate', 'seeked']) video.removeEventListener(event, updateVisibility); };
  }, [videoRef, edits, canvasSize]);
  return <div ref={overlayRef} className="editor-text-preview" data-position={edits?.text?.position} hidden={!edits?.text?.content} aria-hidden="true"><span>{edits?.text?.content}</span></div>;
}
