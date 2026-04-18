import type { ReactNode } from 'react';

export const metadata = {
  title: 'Bitcoin Bulls vs Bears current-market tracker',
  description: 'BTC market state tracker driven by Fear & Greed, Coinbase spot regime and momentum, and Binance positioning'
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
