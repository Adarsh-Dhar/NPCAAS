import { NexusLayout } from '@/components/nexus-layout';
import { LiveMatchingEngine } from '@/components/main-feed/live-matching-engine';

export default function Home() {
  return (
    <NexusLayout>
      <LiveMatchingEngine />
    </NexusLayout>
  );
}
