import './globals.css';
import { AuthProvider } from '@/lib/AuthContext';

export const metadata = {
  title: 'Clearmission Operations',
  manifest: '/manifest.json',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
