import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { assetPath } from './asset-path';
import './globals.css';

export const metadata: Metadata = {
  title: 'SimulaLar — Simulador de financiamento SAC',
  description: 'Simule seu financiamento imobiliário pelo sistema SAC mês a mês.',
  icons: {
    icon: assetPath('/favicon.svg'),
  },
  openGraph: {
    title: 'SimulaLar — Simulador de financiamento SAC',
    description: 'Simule seu financiamento imobiliário pelo sistema SAC mês a mês.',
    images: [assetPath('/og.png')],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SimulaLar — Simulador de financiamento SAC',
    description: 'Simule seu financiamento imobiliário pelo sistema SAC mês a mês.',
    images: [assetPath('/og.png')],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
