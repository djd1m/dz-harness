export const CURSOR_OVERLAY = `(() => {
  if (document.documentElement.dataset.demoPointerReady) return;
  document.documentElement.dataset.demoPointerReady = '1';
  const style = document.createElement('style');
  style.textContent = '[data-demo-pointer]{position:fixed;z-index:2147483647;width:22px;height:28px;pointer-events:none;filter:drop-shadow(0 1px 2px #0008)}[data-demo-ripple]{position:fixed;z-index:2147483646;width:12px;height:12px;border:3px solid #e23b3b;border-radius:50%;pointer-events:none;animation:demo-ripple .45s ease-out forwards}@keyframes demo-ripple{to{transform:scale(4);opacity:0}}';
  document.head.append(style);
  const pointer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  pointer.setAttribute('viewBox', '0 0 22 28'); pointer.setAttribute('data-demo-pointer', '');
  pointer.innerHTML = '<path d="M2 1v21l6-6 5 10 4-2-5-10h8z" fill="white" stroke="#111" stroke-width="2"/>';
  document.documentElement.append(pointer);
  const movePointer = e => { pointer.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)'; };
  addEventListener('mousemove', movePointer, { capture: true });
  const showRipple = e => { const r=document.createElement('i'); r.setAttribute('data-demo-ripple',''); r.style.transform='translate('+(e.clientX-9)+'px,'+(e.clientY-9)+'px)'; document.documentElement.append(r); setTimeout(()=>r.remove(),500); };
  addEventListener('mousedown', showRipple, { capture: true });
})()`;

export function tapTiming(overrides = {}) {
  const timing = { pre: 160, hold: 110, post: 390, ...overrides };
  return { ...timing, total: timing.pre + timing.hold + timing.post };
}

export async function tap(page, selector, overrides = {}) {
  const timing = tapTiming(overrides);
  const locator = page.locator(selector);
  if (!await locator.isVisible()) throw new Error(`селектор не виден: ${selector}`);
  await locator.hover();
  await page.waitForTimeout(timing.pre);
  await locator.click({ delay: timing.hold });
  await page.waitForTimeout(timing.post);
  return timing.total;
}
