import React, { useEffect, useRef } from 'react';
import { Animated, TouchableOpacity } from 'react-native';

// Generic fade-up entrance, used to stagger sections in on mount. A plain
// component (not inline JSX) so its hooks persist across the parent's
// re-renders instead of restarting on every unrelated state change.
export const FadeInUp = ({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: any }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 450, delay, useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Animated.View
      style={[
        { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
};

// `active:scale-*` className only does anything on web (it's a CSS pseudo-class) --
// this gives real press feedback on native too, via onPressIn/onPressOut.
export const AnimatedPressable = ({ onPress, children, disabled, style }: any) => {
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 50 }).start();
  const onPressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 4 }).start();
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <TouchableOpacity onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} disabled={disabled} activeOpacity={0.9}>
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
};
