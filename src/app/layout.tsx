import type { ReactNode } from 'react';

export const metadata = {
  title: 'Bull Bear',
  description: 'BTC-driven cinematic bull-bear market beast'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#0b1020', color: '#f5f7fb', fontFamily: 'Inter, Arial, sans-serif' }}>
        <style>{`
          @media (max-width: 640px) {
            body {
              overflow-x: hidden;
            }
          }
        `}</style>
        {children}
      </body>
    </html>
  );
}
