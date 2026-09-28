import React, { createElement } from 'react';
import { View, Text, Platform } from 'react-native';
import { Camera, Image as ImageIcon } from 'lucide-react-native';
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

  const handleFile = (file: File | undefined) => {
    if (!file) return;
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
  };

  const inputStyle = {
    position: 'absolute' as const,
    top: 0, left: 0, width: '100%', height: '100%',
    opacity: 0, cursor: 'pointer', zIndex: 10
  };

  const cameraInput = createElement('input', {
    type: 'file',
    accept: 'image/*',
    capture: 'environment', // Forces live camera on mobile web browsers (Safari/Chrome)
    onChange: (e: any) => handleFile(e.target.files?.[0]),
    style: inputStyle,
  });

  // No `capture` attribute here -- lets the browser offer its normal photo
  // picker (camera roll on mobile, filesystem on desktop) instead of forcing
  // the camera, for when a live photo wasn't possible at the time.
  const galleryInput = createElement('input', {
    type: 'file',
    accept: 'image/*',
    onChange: (e: any) => handleFile(e.target.files?.[0]),
    style: inputStyle,
  });

  return (
    <View style={{ width: '100%' }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ position: 'relative', flex: 1 }}>
          {cameraInput}
          <View className={`${theme.bg} border-2 border-dashed ${theme.border} rounded-lg py-8 items-center justify-center`}>
            <Camera size={28} color={theme.icon} className="mb-2" />
            <Text className={`${theme.text1} font-bold text-sm text-center`}>Take Live Photo</Text>
          </View>
        </View>
        <View style={{ position: 'relative', flex: 1 }}>
          {galleryInput}
          <View className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-lg py-8 items-center justify-center">
            <ImageIcon size={28} color="#475569" className="mb-2" />
            <Text className="text-slate-700 font-bold text-sm text-center">Choose from Gallery</Text>
          </View>
        </View>
      </View>
      <Text className={`${theme.text2} text-xs mt-2 text-center px-2`}>
        A live photo is preferred and gets time-stamped. Use Gallery only if you couldn't take one on-site.
      </Text>
    </View>
  );
}
