import { View, Text, TouchableOpacity, StatusBar, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Truck, Users, ArrowLeft, ChevronRight, ArrowRightLeft, Droplets } from 'lucide-react-native';

export default function EntrySelectScreen() {
  const router = useRouter();

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
        <Text className="text-slate-900 text-2xl font-outfit-black tracking-tight ml-3">New Daily Entry</Text>
      </View>

      {/* Content */}
      <ScrollView className="flex-1 px-6 py-8">
        <Text className="text-slate-500 font-outfit-bold text-[10px] uppercase tracking-widest mb-6">Select Entry Type</Text>

        {/* Equipment Card */}
        <TouchableOpacity 
          onPress={() => router.push('/(app)/entry/equipment')}
          className="bg-white rounded-2xl p-5 mb-4 border border-slate-200 shadow-sm active:scale-[0.98] transition-transform flex-row items-center"
        >
          <View className="w-14 h-14 rounded-xl bg-indigo-50 items-center justify-center mr-4 border border-indigo-100">
            <Truck size={28} color="#4f46e5" />
          </View>
          <View className="flex-1">
            <Text className="text-slate-900 text-xl font-outfit-black tracking-tight mb-1">Equipment</Text>
            <Text className="text-slate-500 font-outfit-medium text-xs leading-relaxed">Log daily equipment usage, working hours, and rental details</Text>
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
            <Text className="text-slate-900 text-xl font-outfit-black tracking-tight mb-1">Labour</Text>
            <Text className="text-slate-500 font-outfit-medium text-xs leading-relaxed">Log daily labour attendance, overtime, and work categories</Text>
          </View>
          <ChevronRight size={20} color="#cbd5e1" />
        </TouchableOpacity>
        
        {/* Material Transfer Card */}
        <TouchableOpacity
          onPress={() => router.push('/(app)/entry/material')}
          className="bg-white rounded-2xl p-5 mb-4 border border-slate-200 shadow-sm active:scale-[0.98] transition-transform flex-row items-center"
        >
          <View className="w-14 h-14 rounded-xl bg-amber-50 items-center justify-center mr-4 border border-amber-100">
            <ArrowRightLeft size={28} color="#d97706" />
          </View>
          <View className="flex-1">
            <Text className="text-slate-900 text-xl font-outfit-black tracking-tight mb-1">Material Transfer</Text>
            <Text className="text-slate-500 font-outfit-medium text-xs leading-relaxed">Log material shifted from one site to another, capture photo</Text>
          </View>
          <ChevronRight size={20} color="#cbd5e1" />
        </TouchableOpacity>

        {/* Flushing Card */}
        <TouchableOpacity
          onPress={() => router.push('/(app)/entry/flushing')}
          className="bg-white rounded-2xl p-5 mb-10 border border-slate-200 shadow-sm active:scale-[0.98] transition-transform flex-row items-center"
        >
          <View className="w-14 h-14 rounded-xl bg-sky-50 items-center justify-center mr-4 border border-sky-100">
            <Droplets size={28} color="#0369a1" />
          </View>
          <View className="flex-1">
            <Text className="text-slate-900 text-xl font-outfit-black tracking-tight mb-1">Flushing</Text>
            <Text className="text-slate-500 font-outfit-medium text-xs leading-relaxed">Log tanker water supply/removal for flushing work</Text>
          </View>
          <ChevronRight size={20} color="#cbd5e1" />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
