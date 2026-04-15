'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export function ReviewSelector({ stateId, candidateFiles }: { stateId: string; candidateFiles: string[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function chooseWinner(candidateFile: string) {
    setSelected(candidateFile);
    setMessage(null);

    startTransition(async () => {
      try {
        const response = await fetch('/api/review-selection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stateId, candidateFile })
        });

        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? 'Selection failed.');
        }

        setMessage(`Winner saved: ${candidateFile} → ${payload.promotedTo}`);
        router.refresh();
      } catch (error) {
        setSelected(null);
        setMessage(error instanceof Error ? error.message : 'Selection failed.');
      }
    });
  }

  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
      <div style={{ color: '#8ea3c7', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
        Promote winner
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {candidateFiles.map((candidateFile) => {
          const isActive = selected === candidateFile;
          return (
            <button
              key={candidateFile}
              type="button"
              disabled={isPending}
              onClick={() => chooseWinner(candidateFile)}
              style={{
                borderRadius: 999,
                border: isActive ? '1px solid #22c55e' : '1px solid #2b3655',
                background: isActive ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)',
                color: '#e5edf9',
                padding: '8px 12px',
                cursor: isPending ? 'wait' : 'pointer',
                fontSize: 12,
                fontFamily: 'Consolas, monospace'
              }}
            >
              {isPending && isActive ? 'Saving…' : `Pick ${candidateFile}`}
            </button>
          );
        })}
      </div>
      {message ? <div style={{ color: message.startsWith('Winner saved') ? '#86efac' : '#fca5a5', fontSize: 13, wordBreak: 'break-word' }}>{message}</div> : null}
    </div>
  );
}
