import './globals.css';
import AuthGate from '@/components/AuthGate';

export const metadata = {
  title: 'VBO.AI — Free AI Image & Video Studio',
  description: 'Generate AI images and videos with 200+ models. Free open-source alternative to Higgsfield, Sora, and Runway.',
  icons: {
    icon: '/logo.webp',
    apple: '/logo.webp',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
