import { View, StyleSheet, Modal, Pressable } from 'react-native';
import { Text } from '@/components/StyledText';
import { Scanlines } from '@/components/fx';
import { haptics } from '@/feel';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * A custom arcade confirm dialog. Replaces the OS-native `Alert.alert`, which has
 * no working buttons on react-native-web, with a themed modal that behaves the
 * same on web and native and keeps the 8-bit feel. Built on core RN `Modal` (its
 * fade is not Reanimated, so it is unaffected by reduce-motion). Controlled via
 * `visible`; the caller owns the open/close state.
 */
interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Render the confirm action in red for destructive choices (e.g. quitting). */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'OK',
  cancelLabel = 'CANCEL',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirm = () => {
    haptics.medium();
    onConfirm();
  };

  const confirmColor = destructive ? palette.missRed : palette.gold;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      {/* Tapping the dim backdrop cancels; the panel swallows its own taps. */}
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.panel} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <View style={styles.buttons}>
            <Pressable
              style={[styles.button, styles.cancel]}
              onPress={onCancel}
              accessibilityRole="button"
            >
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              style={[styles.button, { borderColor: confirmColor, backgroundColor: confirmColor + '1A' }]}
              onPress={confirm}
              accessibilityRole="button"
            >
              <Text style={[styles.confirmText, { color: confirmColor }]}>{confirmLabel}</Text>
            </Pressable>
          </View>

          <Scanlines />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space(6),
    backgroundColor: palette.bgDeep + 'D8',
  },
  panel: {
    alignSelf: 'stretch',
    // Cap the width so the panel stays a compact card on tablets and web.
    maxWidth: 360,
    width: '100%',
    alignItems: 'center',
    gap: space(3),
    padding: space(5),
    overflow: 'hidden',
    backgroundColor: palette.bgPanel,
    borderWidth: BORDER.chunkier,
    borderColor: palette.gold,
    borderRadius: RADIUS.chip,
  },
  title: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h3,
    color: palette.gold,
    textAlign: 'center',
  },
  message: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.ink,
    textAlign: 'center',
    lineHeight: 20,
  },
  buttons: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    gap: space(3),
    marginTop: space(2),
  },
  button: {
    flex: 1,
    paddingVertical: space(3),
    borderWidth: BORDER.chunk,
    borderRadius: RADIUS.chip,
    alignItems: 'center',
  },
  cancel: { borderColor: palette.inkDim },
  cancelText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
  },
  confirmText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.body,
  },
});
