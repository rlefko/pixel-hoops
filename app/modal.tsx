import { useLocalSearchParams } from 'expo-router';
import HowToPlayScreen from '@/screens/HowToPlayScreen';
import { resolveHandbookSection } from '@/navigation';

/** Route entry for the How to Play modal. `section` deep-links to a handbook anchor. */
export default function ModalRoute() {
  const { section } = useLocalSearchParams<{ section?: string }>();
  return <HowToPlayScreen initialSection={resolveHandbookSection(section)} />;
}
