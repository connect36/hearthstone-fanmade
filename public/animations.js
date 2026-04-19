(function () {
  const STYLE_ID = 'clawteam-anim-styles';
  const LAYER_ID = 'clawteam-anim-layer';
  const DEFAULT_EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

  function getGlobalRoot() {
    if (typeof window !== 'undefined') return window;
    if (typeof globalThis !== 'undefined') return globalThis;
    return {};
  }

  function isElement(value) {
    return !!value && typeof value === 'object' && value.nodeType === 1;
  }

  function resolveElement(value) {
    if (!value) return null;
    if (isElement(value)) return value;
    if (typeof value === 'string' && typeof document !== 'undefined') {
      return document.querySelector(value);
    }
    return null;
  }

  function prefersReducedMotion() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function ensureStyles(doc) {
    if (!doc || doc.getElementById(STYLE_ID)) return;

    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .clawteam-anim-layer {
        position: fixed;
        inset: 0;
        pointer-events: none;
        overflow: hidden;
        z-index: 2147483647;
      }

      .clawteam-toast,
      .clawteam-banner {
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        color: #f7efe0;
        text-shadow: 0 2px 12px rgba(0, 0, 0, 0.35);
        letter-spacing: 0.02em;
        font-weight: 800;
        pointer-events: none;
        user-select: none;
      }

      .clawteam-toast {
        bottom: 16px;
        padding: 10px 14px;
        border-radius: 999px;
        background: rgba(8, 12, 18, 0.82);
        border: 1px solid rgba(255, 255, 255, 0.14);
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.22);
        backdrop-filter: blur(10px);
      }

      .clawteam-banner {
        top: 50%;
        min-width: min(92vw, 26rem);
        max-width: min(92vw, 34rem);
        padding: 16px 18px;
        border-radius: 22px;
        background: linear-gradient(180deg, rgba(22, 35, 52, 0.96), rgba(10, 15, 25, 0.96));
        border: 1px solid rgba(255, 255, 255, 0.12);
        box-shadow: 0 24px 54px rgba(0, 0, 0, 0.35);
      }

      .clawteam-banner[data-variant="victory"] {
        background: linear-gradient(180deg, rgba(68, 112, 63, 0.96), rgba(22, 44, 25, 0.96));
      }

      .clawteam-banner[data-variant="defeat"] {
        background: linear-gradient(180deg, rgba(121, 45, 45, 0.96), rgba(44, 16, 16, 0.96));
      }

      .clawteam-banner[data-variant="turn"] {
        background: linear-gradient(180deg, rgba(31, 65, 94, 0.96), rgba(11, 22, 36, 0.96));
      }

      .clawteam-anim-pulse {
        box-shadow: 0 0 0 rgba(255, 255, 255, 0);
        animation: clawteam-pop 240ms ease-out both;
      }

      .clawteam-anim-hit {
        filter: saturate(1.15);
        animation: clawteam-shake 300ms linear both;
      }

      .clawteam-anim-heal {
        filter: saturate(1.08);
        animation: clawteam-glow 320ms ease-out both;
      }

      .clawteam-anim-float {
        will-change: transform, opacity;
        animation: clawteam-lift 340ms cubic-bezier(0.18, 0.84, 0.24, 1) both;
      }

      @keyframes clawteam-pop {
        0% { transform: scale(0.92); opacity: 0; }
        60% { transform: scale(1.04); opacity: 1; }
        100% { transform: scale(1); opacity: 1; }
      }

      @keyframes clawteam-shake {
        0%, 100% { transform: translate3d(0, 0, 0); }
        20% { transform: translate3d(-4px, 0, 0); }
        40% { transform: translate3d(4px, 0, 0); }
        60% { transform: translate3d(-3px, 0, 0); }
        80% { transform: translate3d(3px, 0, 0); }
      }

      @keyframes clawteam-glow {
        0% { box-shadow: 0 0 0 rgba(0, 0, 0, 0); }
        50% { box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.08), 0 0 26px rgba(99, 179, 237, 0.22); }
        100% { box-shadow: 0 0 0 rgba(0, 0, 0, 0); }
      }

      @keyframes clawteam-lift {
        0% { transform: translateY(10px) scale(0.96); opacity: 0; }
        100% { transform: translateY(0) scale(1); opacity: 1; }
      }

      @media (prefers-reduced-motion: reduce) {
        .clawteam-anim-float,
        .clawteam-toast,
        .clawteam-banner {
          animation: none !important;
          transition: none !important;
        }
      }
    `;
    doc.head.appendChild(style);
  }

  function ensureLayer(doc) {
    if (!doc) return null;
    let layer = doc.getElementById(LAYER_ID);
    if (!layer) {
      layer = doc.createElement('div');
      layer.id = LAYER_ID;
      layer.className = 'clawteam-anim-layer';
      doc.body.appendChild(layer);
    }
    return layer;
  }

  function getRect(el) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return null;
    return el.getBoundingClientRect();
  }

  function asPoint(value) {
    if (!value) return null;
    if (typeof value.x === 'number' && typeof value.y === 'number') {
      return value;
    }
    if (isElement(value)) {
      const rect = getRect(value);
      if (!rect) return null;
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    return null;
  }

  function runAnimation(el, keyframes, options, fallbackClass) {
    if (!el) return null;

    const canAnimate = !options.reducedMotion && typeof el.animate === 'function';
    if (!canAnimate) {
      if (fallbackClass) el.classList.add(fallbackClass);
      if (fallbackClass) {
        window.setTimeout(() => el.classList.remove(fallbackClass), options.durationMs || 280);
      }
      return null;
    }

    const anim = el.animate(keyframes, {
      duration: options.durationMs || 280,
      easing: options.easing || DEFAULT_EASE,
      fill: 'both',
      delay: options.delayMs || 0,
    });

    anim.addEventListener('finish', () => {
      if (fallbackClass) el.classList.remove(fallbackClass);
    });
    anim.addEventListener('cancel', () => {
      if (fallbackClass) el.classList.remove(fallbackClass);
    });
    return anim;
  }

  function createFloatingLabel(layer, text, variant, durationMs, doc) {
    if (!layer || !doc) return null;
    const el = doc.createElement('div');
    el.className = variant === 'toast' ? 'clawteam-toast' : 'clawteam-banner';
    if (variant && variant !== 'toast') el.dataset.variant = variant;
    el.textContent = text;
    layer.appendChild(el);

    const reduce = prefersReducedMotion();
    if (!reduce && typeof el.animate === 'function') {
      const keyframes =
        variant === 'toast'
          ? [
              { transform: 'translateX(-50%) translateY(8px) scale(0.98)', opacity: 0 },
              { transform: 'translateX(-50%) translateY(0) scale(1)', opacity: 1, offset: 0.18 },
              { transform: 'translateX(-50%) translateY(0) scale(1)', opacity: 1, offset: 0.78 },
              { transform: 'translateX(-50%) translateY(8px) scale(0.98)', opacity: 0 },
            ]
          : [
              { transform: 'translateX(-50%) translateY(-58%) scale(0.92)', opacity: 0 },
              { transform: 'translateX(-50%) translateY(-50%) scale(1)', opacity: 1, offset: 0.18 },
              { transform: 'translateX(-50%) translateY(-50%) scale(1)', opacity: 1, offset: 0.78 },
              { transform: 'translateX(-50%) translateY(-42%) scale(0.96)', opacity: 0 },
            ];

      const anim = el.animate(keyframes, {
        duration: durationMs || 1200,
        easing: 'ease-out',
        fill: 'both',
      });
      anim.addEventListener('finish', () => el.remove());
      anim.addEventListener('cancel', () => el.remove());
    } else {
      el.style.animation =
        variant === 'toast'
          ? 'clawteam-lift 260ms ease-out both'
          : 'clawteam-pop 300ms ease-out both';
      window.setTimeout(() => el.remove(), durationMs || 1200);
    }

    return el;
  }

  function createAnimator(options = {}) {
    const doc = options.doc || (typeof document !== 'undefined' ? document : null);
    const root = options.root || (doc ? doc.body : null);
    const reducedMotion = options.reducedMotion ?? prefersReducedMotion();
    const layer = doc ? ensureLayer(doc) : null;

    if (doc) ensureStyles(doc);

    function animateElement(target, keyframes, animOptions, fallbackClass) {
      const el = resolveElement(target);
      if (!el) return null;
      return runAnimation(
        el,
        keyframes,
        {
          durationMs: animOptions?.durationMs,
          delayMs: animOptions?.delayMs,
          easing: animOptions?.easing,
          reducedMotion,
        },
        fallbackClass
      );
    }

    function pulseStat(target, animOptions = {}) {
      return animateElement(
        target,
        [
          { transform: 'scale(1)', filter: 'brightness(1)' },
          { transform: 'scale(1.06)', filter: 'brightness(1.18)' },
          { transform: 'scale(1)', filter: 'brightness(1)' },
        ],
        {
          durationMs: animOptions.durationMs || 240,
          easing: animOptions.easing || 'ease-out',
        },
        'clawteam-anim-pulse'
      );
    }

    function heal(target, animOptions = {}) {
      const color = animOptions.color || 'rgba(86, 204, 130, 0.36)';
      return animateElement(
        target,
        [
          { transform: 'translateY(0) scale(1)', boxShadow: '0 0 0 rgba(0,0,0,0)' },
          { transform: 'translateY(-1px) scale(1.02)', boxShadow: `0 0 0 8px ${color}` },
          { transform: 'translateY(0) scale(1)', boxShadow: '0 0 0 rgba(0,0,0,0)' },
        ],
        {
          durationMs: animOptions.durationMs || 320,
          easing: animOptions.easing || 'ease-out',
        },
        'clawteam-anim-heal'
      );
    }

    function hit(target, animOptions = {}) {
      const color = animOptions.color || 'rgba(255, 107, 107, 0.28)';
      return animateElement(
        target,
        [
          {
            transform: 'translate3d(0, 0, 0)',
            boxShadow: '0 0 0 rgba(0,0,0,0)',
            filter: 'saturate(1)',
          },
          {
            transform: 'translate3d(-2px, 0, 0)',
            boxShadow: `0 0 0 7px ${color}`,
            filter: 'saturate(1.1)',
          },
          {
            transform: 'translate3d(2px, 0, 0)',
            boxShadow: `0 0 0 10px ${color}`,
            filter: 'saturate(1.15)',
          },
          {
            transform: 'translate3d(0, 0, 0)',
            boxShadow: '0 0 0 rgba(0,0,0,0)',
            filter: 'saturate(1)',
          },
        ],
        {
          durationMs: animOptions.durationMs || 300,
          easing: animOptions.easing || 'linear',
        },
        'clawteam-anim-hit'
      );
    }

    function flingCard(target, animOptions = {}) {
      const el = resolveElement(target);
      if (!el) return null;

      const startPoint = asPoint(animOptions.from) || asPoint(animOptions.fromEl);
      const endPoint = asPoint(animOptions.to) || asPoint(animOptions.toEl);
      const baseDuration = animOptions.durationMs || 340;
      const rotate = animOptions.rotate ?? 6;
      const lift = animOptions.lift ?? 10;
      const scale = animOptions.scale ?? 1;

      if (reducedMotion || typeof el.animate !== 'function') {
        el.classList.add('clawteam-anim-float');
        window.setTimeout(() => el.classList.remove('clawteam-anim-float'), baseDuration);
        return null;
      }

      const startX = startPoint ? startPoint.x : 0;
      const startY = startPoint ? startPoint.y : 0;
      const endX = endPoint ? endPoint.x : 0;
      const endY = endPoint ? endPoint.y : 0;
      const dx = startPoint && endPoint ? startX - endX : 0;
      const dy = startPoint && endPoint ? startY - endY : lift;
      const initialRotate = animOptions.fromRotate ?? -rotate;
      const finalRotate = animOptions.toRotate ?? 0;

      el.style.willChange = 'transform, opacity';
      const anim = el.animate(
        [
          {
            transform: `translate3d(${dx}px, ${dy}px, 0) rotate(${initialRotate}deg) scale(${scale * 0.94})`,
            opacity: animOptions.fromOpacity ?? 0,
          },
          {
            transform: `translate3d(${dx * 0.25}px, ${dy * 0.25}px, 0) rotate(${initialRotate * 0.2}deg) scale(${scale * 1.03})`,
            opacity: 1,
            offset: 0.55,
          },
          {
            transform: `translate3d(0, 0, 0) rotate(${finalRotate}deg) scale(${scale})`,
            opacity: 1,
          },
        ],
        {
          duration: baseDuration,
          easing: animOptions.easing || 'cubic-bezier(0.18, 0.84, 0.24, 1)',
          fill: 'both',
          delay: animOptions.delayMs || 0,
        }
      );

      anim.addEventListener('finish', () => {
        el.style.willChange = '';
      });
      anim.addEventListener('cancel', () => {
        el.style.willChange = '';
      });
      return anim;
    }

    function drawCard(target, animOptions = {}) {
      return flingCard(target, {
        ...animOptions,
        lift: animOptions.lift ?? 26,
        rotate: animOptions.rotate ?? 4,
        scale: animOptions.scale ?? 1,
      });
    }

    function flashMessage(message, animOptions = {}) {
      if (!doc || !layer) return null;
      const variant = animOptions.variant || 'toast';
      const text = typeof message === 'string' ? message : animOptions.text || '';
      if (!text) return null;
      return createFloatingLabel(layer, text, variant, animOptions.durationMs || 1200, doc);
    }

    function turnBanner(message, animOptions = {}) {
      if (!doc || !layer) return null;
      const text = typeof message === 'string' ? message : animOptions.text || '';
      if (!text) return null;
      return createFloatingLabel(layer, text, animOptions.variant || 'turn', animOptions.durationMs || 1350, doc);
    }

    function victory(message = 'Victory!', animOptions = {}) {
      return turnBanner(message, { ...animOptions, variant: 'victory', durationMs: animOptions.durationMs || 1600 });
    }

    function defeat(message = 'Defeat', animOptions = {}) {
      return turnBanner(message, { ...animOptions, variant: 'defeat', durationMs: animOptions.durationMs || 1600 });
    }

    function cleanupLayer() {
      if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
    }

    function boardFlash(color = 'rgba(99, 179, 237, 0.16)', animOptions = {}) {
      if (!doc || !layer) return null;
      const el = doc.createElement('div');
      el.className = 'clawteam-banner';
      el.dataset.variant = animOptions.variant || 'turn';
      el.style.background = `linear-gradient(180deg, ${color}, rgba(10, 15, 25, 0.96))`;
      el.style.minWidth = 'min(70vw, 22rem)';
      el.textContent = animOptions.text || '';
      layer.appendChild(el);

      const anim = el.animate(
        [
          { opacity: 0, transform: 'translateX(-50%) translateY(-50%) scale(0.94)' },
          { opacity: 1, transform: 'translateX(-50%) translateY(-50%) scale(1)', offset: 0.15 },
          { opacity: 1, transform: 'translateX(-50%) translateY(-50%) scale(1)', offset: 0.78 },
          { opacity: 0, transform: 'translateX(-50%) translateY(-42%) scale(0.97)' },
        ],
        {
          duration: animOptions.durationMs || 1200,
          easing: 'ease-out',
          fill: 'both',
        }
      );
      anim.addEventListener('finish', () => el.remove());
      anim.addEventListener('cancel', () => el.remove());
      return anim;
    }

    return {
      supported: !!doc,
      reducedMotion,
      root,
      layer,
      pulseStat,
      hit,
      heal,
      flingCard,
      drawCard,
      flashMessage,
      turnBanner,
      victory,
      defeat,
      boardFlash,
      cleanupLayer,
    };
  }

  const api = {
    createAnimator,
    pulseStat(target, options) {
      return createAnimator().pulseStat(target, options);
    },
    flingCard(target, options) {
      return createAnimator().flingCard(target, options);
    },
    flashMessage(message, options) {
      return createAnimator().flashMessage(message, options);
    },
    hit(target, options) {
      return createAnimator().hit(target, options);
    },
    heal(target, options) {
      return createAnimator().heal(target, options);
    },
    drawCard(target, options) {
      return createAnimator().drawCard(target, options);
    },
    turnBanner(message, options) {
      return createAnimator().turnBanner(message, options);
    },
    victory(message, options) {
      return createAnimator().victory(message, options);
    },
    defeat(message, options) {
      return createAnimator().defeat(message, options);
    },
  };

  const root = getGlobalRoot();
  root.ClawHearthstoneAnimations = api;
  root.createAnimator = createAnimator;
  root.pulseStat = api.pulseStat;
  root.flingCard = api.flingCard;
  root.flashMessage = api.flashMessage;
  root.hit = api.hit;
  root.heal = api.heal;
  root.drawCard = api.drawCard;
  root.turnBanner = api.turnBanner;
  root.victory = api.victory;
  root.defeat = api.defeat;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
