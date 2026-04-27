/**
 * QUOTE LOADING SCREEN
 *
 * 8-second interstitial shown between form submission and quote reveal.
 * - Operational transparency: shows "what we're calculating"
 * - Attribution collection: "how did you find us?" grid
 * - Timer always runs full 8s regardless of card selection
 */

import { useState, useEffect, useRef } from 'react';
import { SelectionCard, SelectionCardGrid } from '@/components/ui/selection-card';
import { CONFIG } from '@/lib/config';
import { trackEvent } from '@/lib/tracking';

export interface QuoteLoadingScreenProps {
  quoteAmount: number;
  onComplete: () => void;
}

type AttributionId = 'google' | 'friend' | 'estate_agent' | 'van' | 'social' | 'returning';

const MESSAGES = [
  'Calculating distances\u2026',
  'Working out crew size\u2026',
  'Checking van availability\u2026',
  'Comparing your options\u2026',
  'Finalising your quote\u2026',
];

const DURATION = 8000;

const KEYFRAME_CSS = `
  @keyframes ql-spin {
    to { transform: rotate(360deg); }
  }
  @keyframes ql-msg-in {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes ql-thanks-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
`;

export function QuoteLoadingScreen({ quoteAmount: _quoteAmount, onComplete }: QuoteLoadingScreenProps) {
  const [progress, setProgress] = useState(0);
  const [msgIndex, setMsgIndex] = useState(0);
  const [msgKey, setMsgKey] = useState(0);
  const [selected, setSelected] = useState<AttributionId | null>(null);
  const [thanksVisible, setThanksVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  const selectedRef = useRef<AttributionId | null>(null);
  const completedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Progress bar + message cycling
  useEffect(() => {
    const startTime = performance.now();
    let prevMsgIdx = 0;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const p = Math.min(elapsed / DURATION, 1);
      setProgress(p);

      const newMsgIdx = Math.min(Math.floor(p * MESSAGES.length), MESSAGES.length - 1);
      if (newMsgIdx !== prevMsgIdx) {
        prevMsgIdx = newMsgIdx;
        setMsgIndex(newMsgIdx);
        setMsgKey((k) => k + 1);
      }

      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else if (!completedRef.current) {
        completedRef.current = true;
        if (!selectedRef.current) {
          trackEvent('attribution_skipped');
        }
        setExiting(true);
        setTimeout(() => onCompleteRef.current(), 500);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handleSelect = (id: AttributionId) => {
    if (selectedRef.current) return;
    selectedRef.current = id;
    setSelected(id);
    setThanksVisible(true);

    trackEvent('attribution_selected', { attribution_source: id });

    try {
      const existing = JSON.parse(localStorage.getItem('painless_quote') || '{}') as Record<string, unknown>;
      existing.attribution = id;
      existing.attribution_timestamp = new Date().toISOString();
      localStorage.setItem('painless_quote', JSON.stringify(existing));
    } catch {
      // localStorage unavailable — silent fail
    }
  };

  const cards: { id: AttributionId; label: string; image: string }[] = [
    { id: 'google',       label: 'Google search',  image: 'google' },
    { id: 'friend',       label: 'Recommendation', image: 'recommendation' },
    { id: 'estate_agent', label: 'Estate agent',   image: 'estateagent' },
    { id: 'van',          label: 'Saw our van',    image: 'van-saw' },
    { id: 'social',       label: 'Social media',   image: 'social' },
    { id: 'returning',    label: 'Used us before', image: 'used' },
  ];

  return (
    <>
      <style>{KEYFRAME_CSS}</style>

      <div
        style={{
          opacity: exiting ? 0 : 1,
          transition: 'opacity 0.5s ease',
          background: '#FAF6F1',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '44px 16px 32px',
        }}
      >
        <div style={{ width: '100%', maxWidth: 540, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── Header: spinner + title ── */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            {/* Spinner */}
            <svg
              width="40"
              height="40"
              viewBox="0 0 40 40"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="20" cy="20" r="17" stroke="#E8DDD3" strokeWidth="3" />
              <circle
                cx="20"
                cy="20"
                r="17"
                stroke="#C4856C"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray="70 37"
                style={{
                  animation: 'ql-spin 1s linear infinite',
                  transformOrigin: '20px 20px',
                }}
              />
            </svg>

            {/* Title */}
            <h2
              style={{
                fontFamily: "'Fraunces', Georgia, serif",
                fontWeight: 700,
                fontSize: 21,
                color: '#3D3229',
                margin: 0,
                textAlign: 'center',
                lineHeight: 1.2,
              }}
            >
              Preparing your quote
            </h2>
          </div>

          {/* ── Progress bar + message ── */}
          <div>
            <div
              style={{
                background: '#E8DDD3',
                height: 5,
                borderRadius: 3,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${progress * 100}%`,
                  background: 'linear-gradient(90deg, #2A9D8F, #34B8A8)',
                  transition: 'width 0.08s linear',
                  borderRadius: 3,
                }}
              />
            </div>

            <div style={{ height: 22, marginTop: 8 }}>
              <p
                key={msgKey}
                style={{
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  fontWeight: 400,
                  fontSize: 14,
                  color: '#8B7B6B',
                  margin: 0,
                  textAlign: 'center',
                  animation: 'ql-msg-in 0.3s ease both',
                }}
              >
                {MESSAGES[msgIndex]}
              </p>
            </div>
          </div>

          {/* ── Attribution section ── */}
          <div>
            <p
              style={{
                fontFamily: "'Fraunces', Georgia, serif",
                fontWeight: 700,
                fontSize: 18,
                color: '#3D3229',
                textAlign: 'center',
                margin: '0 0 14px',
              }}
            >
              While you wait — how did you find us?
            </p>

            {/* Card grid */}
            <SelectionCardGrid columns={{ default: 2, sm: 3 }}>
              {cards.map((card) => (
                <SelectionCard
                  key={card.id}
                  value={card.id}
                  title={card.label}
                  imageUrl={`${CONFIG.site.assetBaseUrl}/images/howknow/${card.image}.webp`}
                  isSelected={selected === card.id}
                  disabled={selected !== null && selected !== card.id}
                  onSelect={() => handleSelect(card.id)}
                  loading="eager"
                />
              ))}
            </SelectionCardGrid>

            {/* Feedback text */}
            <div style={{ textAlign: 'center', marginTop: 12, minHeight: 20 }}>
              {thanksVisible ? (
                <p
                  style={{
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#2A9D8F',
                    margin: 0,
                    animation: 'ql-thanks-in 0.3s ease both',
                  }}
                >
                  Thanks! That really helps us.
                </p>
              ) : (
                <p
                  style={{
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    fontSize: 13,
                    color: '#A89888',
                    margin: 0,
                  }}
                >
                  Completely optional — your quote is on its way regardless
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default QuoteLoadingScreen;
