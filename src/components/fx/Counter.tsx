import { Text, type StyleProp, type TextStyle } from 'react-native';
import { useCountUp } from '@/feel';

/**
 * A number that tweens toward its value. Drop-in for any score/total Text where
 * "numbers go up" should feel good.
 */
interface CounterProps {
  value: number;
  style?: StyleProp<TextStyle>;
  /** Milliseconds per unit of change (bigger jumps take a touch longer). */
  durationPerUnit?: number;
}

export function Counter({ value, style, durationPerUnit }: CounterProps) {
  const display = useCountUp(value, { durationPerUnit });
  return <Text style={style}>{display}</Text>;
}
