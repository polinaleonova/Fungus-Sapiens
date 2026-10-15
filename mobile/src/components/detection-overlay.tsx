import { StyleSheet, Text, View } from 'react-native';

import { projectBoxToCoverPreview } from '@/lib/bbox-layout';

/** Boxes are normalized 0..1 in the full, EXIF-corrected JPEG returned by FastAPI. */
export type DetectionBox = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label?: string;
  confidence?: number;
};

type Props = {
  boxes: DetectionBox[];
  sourceWidth: number;
  sourceHeight: number;
  previewWidth: number;
  previewHeight: number;
};

export function DetectionOverlay({
  boxes, sourceWidth, sourceHeight, previewWidth, previewHeight,
}: Props) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {boxes.map((box) => {
        const bounds = projectBoxToCoverPreview(
          box, sourceWidth, sourceHeight, previewWidth, previewHeight,
        );
        if (!bounds) return null;
        const confidence = typeof box.confidence === 'number'
          ? ` · ${Math.round(box.confidence * 100)}%`
          : '';
        return (
          <View key={box.id} style={[styles.box, bounds]}>
            <View style={styles.label}>
              <Text numberOfLines={1} style={styles.labelText}>
                {box.label ?? 'Гриб'}{confidence}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#B6FE67',
    borderRadius: 8,
    backgroundColor: 'rgba(182, 254, 103, 0.06)',
  },
  label: {
    position: 'absolute',
    top: 0,
    left: 0,
    maxWidth: 190,
    backgroundColor: '#B6FE67',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderTopLeftRadius: 5,
    borderBottomRightRadius: 6,
  },
  labelText: {
    color: '#122619',
    fontSize: 11,
    fontWeight: '800',
  },
});
