import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { lightColors as colors, radius } from '../constants/theme';
import type { RoutePoint } from '../lib/activity';

const SIZE = 320;
const PADDING = 28;

// Draws the recorded path scaled to fit; there are no map tiles behind it.
export function RouteMap({ points, height = 260 }: { points: RoutePoint[]; height?: number }) {
  const shape = (() => {
    if (points.length < 2) return null;
    const meanLat = points.reduce((sum, p) => sum + p.latitude, 0) / points.length;
    const lonScale = Math.cos((meanLat * Math.PI) / 180);
    const xs = points.map((p) => p.longitude * lonScale);
    const ys = points.map((p) => -p.latitude);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const spanX = Math.max(...xs) - minX;
    const spanY = Math.max(...ys) - minY;
    const scale = (SIZE - PADDING * 2) / Math.max(spanX, spanY, 1e-9);
    const offsetX = (SIZE - spanX * scale) / 2;
    const offsetY = (SIZE - spanY * scale) / 2;
    return xs.map((x, index) => ({
      x: offsetX + (x - minX) * scale,
      y: offsetY + (ys[index] - minY) * scale,
    }));
  })();

  const gridLines = [0.25, 0.5, 0.75].map((fraction) => fraction * SIZE);

  return (
    <View style={[styles.box, { height }]} accessibilityLabel="Route map">
      <Svg width="100%" height="100%" viewBox={`0 0 ${SIZE} ${SIZE}`} preserveAspectRatio="xMidYMid meet">
        {gridLines.map((position) => (
          <React.Fragment key={position}>
            <Line x1={position} y1={0} x2={position} y2={SIZE} stroke={colors.border} strokeWidth={1} />
            <Line x1={0} y1={position} x2={SIZE} y2={position} stroke={colors.border} strokeWidth={1} />
          </React.Fragment>
        ))}
        {shape && (
          <>
            <Polyline
              points={shape.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={colors.primary}
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Circle cx={shape[0].x} cy={shape[0].y} r={8} fill={colors.accent} stroke="#FFFFFF" strokeWidth={3} />
            <Circle
              cx={shape[shape.length - 1].x}
              cy={shape[shape.length - 1].y}
              r={8}
              fill={colors.heroBackground}
              stroke="#FFFFFF"
              strokeWidth={3}
            />
          </>
        )}
      </Svg>
      {!shape && (
        <View style={styles.placeholder} pointerEvents="none">
          <Text style={styles.placeholderText}>Your route will appear as you move.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  placeholder: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: colors.textSubtle, fontSize: 13 },
});
