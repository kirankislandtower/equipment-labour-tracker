import { View, Text, TouchableOpacity, StatusBar, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Truck, Users, ArrowLeft, ChevronRight, ArrowRightLeft, Droplets } from 'lucide-react-native';
import { FLUSHING_ENABLED_FOR_FOREMEN } from '../../../lib/foremanFlags';

export default function EntrySelectScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View className="flex-row items-center px-6 py-4 border-b border-slate-200 bg-white">
        <TouchableOpacity 
          onPress={() => router.replace('/(app)/home')}
          className="p-2 -ml-2 rounded-full active:scale-[0.95] transition-transform"
        >
          <ArrowLeft size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text className="text-slate-900 text-2xl font-outfit-black tracking-tight ml-3">{t('entrySelect.title')}</Text>
      </View>

      {/* Content */}
      <ScrollView className="flex-1 px-6 py-8">
        <Text className="text-slate-500 font-outfit-bold text-[10px] uppercase tracking-widest mb-6">{t('entrySelect.selectType')}</Text>

        {/* Equipment Card */}
        <TouchableOpacity 
          onPress={() => router.push('/(app)/entry/equipment')}
          className="bg-white rounded-2xl p-5 mb-4 border border-slate-200 shadow-sm active:scale-[0.98] transition-transform flex-row items-center"
        >
          <View className="w-14 h-14 rounded-xl bg-indigo-50 items-center justify-center mr-4 border border-indigo-100">
            <Truck size={28} color="#4f46e5" />
          </View>
          <View className="flex-1">
            <Text className="text-slate-900 text-xl font-outfit-black tracking-tight mb-1">{t('entrySelect.equipmentTitle')}</Text>
            <Text className="text-slate-500 font-outfit-medium text-xs leading-relaxed">{t('entrySelect.equipmentDesc')}</Text>
          </View>
          <ChevronRight size={20} color="#cbd5e1" />
        </TouchableOpacity>

        {/* Labour Card */}
        <TouchableOpacity 
          onPress={() => router.push('/(app)/entry/labour')}
          className="bg-white rounded-2xl p-5 mb-4 border border-slate-200 shadow-sm active:scale-[0.98] transition-transform flex-row items-center"
        >
          <View className="w-14 h-14 rounded-xl bg-emerald-50 items-center justify-center mr-4 border border-emerald-100">
            <Users size={28} color="#10b981" />
          </View>
          <View className="flex-1">
            <Text className="text-slate-900 text-xl font-outfit-black tracking-tight mb-1">{t('entrySelect.labourTitle')}</Text>
            <Text className="text-slate-500 font-outfit-medium text-xs leading-relaxed">{t('entrySelect.labourDesc')}</Text>
          </View>
          <ChevronRight size={20} color="#cbd5e1" />
        </TouchableOpacity>
        
        {/* Material Transfer Card */}
        <TouchableOpacity
          onPress={() => router.push('/(app)/entry/material')}
          className={`bg-white rounded-2xl p-5 ${FLUSHING_ENABLED_FOR_FOREMEN ? 'mb-4' : 'mb-10'} border border-slate-200 shadow-sm active:scale-[0.98] transition-transform flex-row items-center`}
        >
          <View className="w-14 h-14 rounded-xl bg-amber-50 items-center justify-center mr-4 border border-amber-100">
            <ArrowRightLeft size={28} color="#d97706" />
          </View>
          <View className="flex-1">
            <Text className="text-slate-900 text-xl font-outfit-black tracking-tight mb-1">{t('entrySelect.materialTitle')}</Text>
            <Text className="text-slate-500 font-outfit-medium text-xs leading-relaxed">{t('entrySelect.materialDesc')}</Text>
          </View>
          <ChevronRight size={20} color="#cbd5e1" />
        </TouchableOpacity>

        {/* Internal Vehicles is Driver-login only now -- no card here for foremen. */}

        {/* Flushing Card -- temporarily paused, see FLUSHING_ENABLED_FOR_FOREMEN */}
        {FLUSHING_ENABLED_FOR_FOREMEN && (
          <TouchableOpacity
            onPress={() => router.push('/(app)/entry/flushing')}
            className="bg-white rounded-2xl p-5 mb-10 border border-slate-200 shadow-sm active:scale-[0.98] transition-transform flex-row items-center"
          >
            <View className="w-14 h-14 rounded-xl bg-sky-50 items-center justify-center mr-4 border border-sky-100">
              <Droplets size={28} color="#0369a1" />
            </View>
            <View className="flex-1">
              <Text className="text-slate-900 text-xl font-outfit-black tracking-tight mb-1">{t('entrySelect.flushingTitle')}</Text>
              <Text className="text-slate-500 font-outfit-medium text-xs leading-relaxed">{t('entrySelect.flushingDesc')}</Text>
            </View>
            <ChevronRight size={20} color="#cbd5e1" />
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
