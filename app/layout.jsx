import '../src/styles.css';

export const metadata = {
  title: 'Edit — Text & Lyrics',
  description: 'Быстрый редактор текста и лирики с инструментами Suno и пресетами.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icons/edit-icon.svg',
    apple: '/icons/edit-icon-192.png',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#10110f',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
