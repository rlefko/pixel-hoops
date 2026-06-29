import { View, StyleSheet, Modal, Pressable, ScrollView } from 'react-native';
import { Text } from '@/components/StyledText';
import { Scanlines } from '@/components/fx';
import { SettingsControls } from '@/components/SettingsControls';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * In-run settings, shown as an overlay rather than a route push. The run model is
 * transient state held in RunScreen's reducer, so navigating to the /settings route
 * would unmount RunScreen and lose the run. This modal keeps the run alive behind it
 * and reuses the shared SettingsControls (no save-reset DANGER ZONE in-run). Built on
 * core RN Modal like ConfirmDialog, so its fade is unaffected by reduce-motion.
 */
interface RunSettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

export function RunSettingsModal({ visible, onClose }: RunSettingsModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Tapping the dim backdrop closes; the panel swallows its own taps. */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.panel} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>SETTINGS</Text>
            <Pressable
              onPress={onClose}
              hitSlop={space(3)}
              accessibilityRole="button"
              accessibilityLabel="Close settings"
            >
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.body}
            showsVerticalScrollIndicator={false}
            alwaysBounceVertical={false}
          >
            <SettingsControls />
          </ScrollView>

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
    maxWidth: 360,
    width: '100%',
    maxHeight: '85%',
    paddingHorizontal: space(5),
    paddingVertical: space(4),
    overflow: 'hidden',
    backgroundColor: palette.bgPanel,
    borderWidth: BORDER.chunkier,
    borderColor: palette.gold,
    borderRadius: RADIUS.chip,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h3,
    color: palette.gold,
  },
  close: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h3,
    color: palette.inkDim,
  },
  body: { alignSelf: 'stretch', flexShrink: 1 },
});
