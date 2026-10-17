import React from 'react';
import { TouchableOpacity } from 'react-native';
import { ChevronUp } from 'lucide-react-native';

// Floating "back to top" button for long admin entry lists -- only rendered
// once the caller has scrolled down past a threshold, since the list page
// itself owns the scroll position (no sense showing it at the very top).
export default function ScrollToTopButton({ visible, onPress }: { visible: boolean; onPress: () => void }) {
  if (!visible) return null;

  return (
    <TouchableOpacity
      onPress={onPress}
      className="absolute bottom-8 right-8 bg-slate-900 w-14 h-14 rounded-full items-center justify-center shadow-lg active:bg-slate-700"
      style={{ elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 }}
    >
      <ChevronUp size={26} color="#ffffff" />
    </TouchableOpacity>
  );
}
