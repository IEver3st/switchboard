export function auditDOM() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const color = (value) => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const bytes = context.getImageData(0, 0, 1, 1).data;
    return [bytes[0], bytes[1], bytes[2], bytes[3] / 255];
  };
  const blend = (foreground, background) => foreground.slice(0, 3).map((value, index) => value * foreground[3] + background[index] * (1 - foreground[3]));
  const luminance = (rgb) => rgb.slice(0, 3).map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const selector = (element) => element.id ? `#${element.id}` : `${element.tagName.toLowerCase()}${[...element.classList].slice(0, 3).map(value => '.' + value).join('')}`;
  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.right <= 0 || rect.bottom <= 0 || rect.top >= innerHeight || rect.left >= innerWidth) return false;
    if (element.closest('[aria-hidden="true"], [inert]')) return false;
    for (let parent = element; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) < 1) return false;
    }
    return true;
  };
  const contrast = [];
  const overflow = [];
  for (const element of document.querySelectorAll('body *')) {
    if (!(element instanceof HTMLElement) || !visible(element)) continue;
    const text = [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent.trim()).filter(Boolean).join(' ');
    if (!text || element.matches('script, style, canvas') || element.closest(':disabled, [aria-disabled="true"]')) continue;
    const style = getComputedStyle(element);
    const backgrounds = [];
    let unknown = false;
    for (let parent = element; parent; parent = parent.parentElement) {
      const parentStyle = getComputedStyle(parent);
      if (parentStyle.backgroundImage !== 'none') { unknown = true; break; }
      backgrounds.push(color(parentStyle.backgroundColor));
      if (backgrounds.at(-1)[3] === 1) break;
    }
    if (unknown) continue;
    let background = [0, 0, 0];
    for (const layer of backgrounds.reverse()) background = blend(layer, background);
    const foreground = blend(color(style.color), background);
    const lights = [luminance(background), luminance(foreground)].sort((a, b) => b - a);
    const ratio = (lights[0] + 0.05) / (lights[1] + 0.05);
    const required = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700) ? 3 : 4.5;
    if (ratio < required) contrast.push({ selector: selector(element), text: text.slice(0, 100), ratio: Number(ratio.toFixed(2)), required, color: style.color, background, font: style.fontSize });
  }
  for (const element of document.querySelectorAll('main, .settings-page, [data-settings-content-scroll], [data-radix-scroll-area-viewport], [role="dialog"]')) {
    if (visible(element) && element.scrollWidth > element.clientWidth + 1) overflow.push({ selector: selector(element), width: element.clientWidth, scrollWidth: element.scrollWidth });
  }
  return { viewport: { width: innerWidth, height: innerHeight }, contrast, overflow,
    images: [...document.images].filter(visible).filter(image => !image.complete || image.naturalWidth === 0).map(image => ({ src: image.getAttribute('src'), alt: image.alt })),
    activeAnimations: document.getAnimations().filter(animation => animation.playState === 'running').length,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    domNodes: document.getElementsByTagName('*').length };
}
