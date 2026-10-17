import React from 'react';
import { Animated, View } from 'react-native';

interface ScrollProgressBarProps {
  scrollY: Animated.Value;
  contentHeight: number;
  containerHeight: number;
  color?: string;
}

// Thin fill bar that tracks how far through a scrollable list the admin has
// scrolled, sitting just above the ScrollView so it never scrolls away
// itself -- same idea as the web "scroll progress" pattern, built on RN's
// own Animated API instead of framer-motion (web-only, doesn't run in
// React Native).
export default function ScrollProgressBar({ scrollY, contentHeight, containerHeight, color = '#1e3a8a' }: ScrollProgressBarProps) {
  const maxScroll = Math.max(contentHeight - containerHeight, 1);
  const widthPercent = scrollY.interpolate({
    inputRange: [0, maxScroll],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  return (
    <View style={{ height: 3, width: '100%', backgroundColor: '#e2e8f0' }}>
      <Animated.View style={{ height: 3, width: widthPercent as any, backgroundColor: color }} />
    </View>
  );
}
