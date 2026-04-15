import { getLiveMarketBeastState } from '@/lib/live-state';
import { LiveSnapshot } from './live-snapshot';

export const dynamic = 'force-dynamic';

const badgeBaseStyle = {
  display: 'inline-block',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '2.16px',
  textTransform: 'uppercase' as const,
  textDecoration: 'none',
  paddingTop: '4px',
  paddingBottom: '4px',
  paddingLeft: '6px',
  paddingRight: '5px',
  borderRadius: 0,
  lineHeight: 1,
  backgroundColor: '#ffffff',
  color: '#000000'
};

export default async function HomePage() {
  const live = await getLiveMarketBeastState();

  return (
    <main style={{ padding: '20px 14px 56px', maxWidth: 1320, margin: '0 auto' }}>
      <LiveSnapshot
        liveSnapshot={live.snapshot}
        creature={live.creature}
        manifest={live.manifest}
        activeStill={live.activeStill}
        activeLoop={live.activeLoop}
        activeLoops={live.activeLoops}
        history={[]}
      />
    </main>
  );
}
