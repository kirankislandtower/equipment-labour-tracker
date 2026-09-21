import React from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';

export type MessageModalContent = { title: string; message: string; onClose?: () => void };

// Alert.alert is a no-op on react-native-web, so anything the user must actually
// see (errors, duplicate warnings) has to go through a real Modal instead.
export default function MessageModal({ content, onDismiss }: { content: MessageModalContent | null; onDismiss: () => void }) {
  const handleClose = () => {
    const onClose = content?.onClose;
    onDismiss();
    onClose?.();
  };

  return (
    <Modal visible={!!content} transparent animationType="fade" onRequestClose={handleClose}>
      <View className="flex-1 justify-center items-center bg-slate-900/40 p-4">
        <View className="bg-white rounded-3xl w-full max-w-[340px] p-6 shadow-2xl">
          <View className="items-center mb-6">
            <View className="w-14 h-14 rounded-full items-center justify-center mb-4 bg-amber-50">
              <AlertTriangle size={28} color="#d97706" />
            </View>
            <Text className="text-slate-900 text-xl font-black tracking-tight text-center mb-2">{content?.title}</Text>
            <Text className="text-slate-500 text-center font-medium leading-relaxed">{content?.message}</Text>
          </View>
          <TouchableOpacity onPress={handleClose} className="bg-slate-900 py-3.5 rounded-xl items-center justify-center active:bg-slate-700">
            <Text className="text-white font-bold tracking-wide">OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
