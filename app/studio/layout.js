import AuthGate from '@/components/AuthGate';

export default function StudioLayout({ children }) {
  return <AuthGate>{children}</AuthGate>;
}
