import React, { createElement } from 'react';
import { View, Text, Platform } from 'react-native';
import { Camera } from 'lucide-react-native';
import { compressImageToDataUri } from '../lib/imageUtils';

interface WebCameraProps {
  onImageCaptured: (uri: string) => void;
  colorTheme: 'blue' | 'green' | 'amber';
}

export default function WebCamera({ onImageCaptured, colorTheme }: WebCameraProps) {
  // Only render on Web platform
  if (Platform.OS !== 'web') return null;

  const styles = {
    blue: { bg: 'bg-blue-50', border: 'border-blue-200', icon: '#1d4ed8', text1: 'text-blue-900', text2: 'text-blue-600' },
    green: { bg: 'bg-green-50', border: 'border-green-200', icon: '#16a34a', text1: 'text-green-900', text2: 'text-green-600' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', icon: '#d97706', text1: 'text-amber-900', text2: 'text-amber-600' }
  };
  
  const theme = styles[colorTheme];

  const inputElement = createElement('input', {
    type: 'file',
    accept: 'image/*',
    capture: 'environment', // Forces live camera on mobile web browsers (Safari/Chrome)
    onChange: (e: any) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async (ev) => {
          if (ev.target?.result) {
            try {
              const compressed = await compressImageToDataUri(ev.target.result as string);
              onImageCaptured(compressed);
            } catch (err) {
              console.error('Image compression failed, using original:', err);
              onImageCaptured(ev.target.result as string);
            }
          }
        };
        reader.readAsDataURL(file);
      }
    },
    style: {
      position: 'absolute', 
      top: 0, left: 0, width: '100%', height: '100%', 
      opacity: 0, cursor: 'pointer', zIndex: 10
    }
  });

  return (
    <View style={{ position: 'relative', width: '100%' }}>
      {inputElement}
      <View className={`${theme.bg} border-2 border-dashed ${theme.border} rounded-lg py-8 items-center justify-center`}>
        <Camera size={32} color={theme.icon} className="mb-2" />
        <Text className={`${theme.text1} font-bold text-base`}>Take Live Photo (Web)</Text>
        <Text className={`${theme.text2} text-xs mt-1 text-center px-4`}>
          Photos are time and location stamped to prevent fraud.
        </Text>
      </View>
    </View>
  );
}
