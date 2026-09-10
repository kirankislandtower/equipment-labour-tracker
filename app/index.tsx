import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Image, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Building2, Eye, EyeOff } from 'lucide-react-native';
import { supabase } from '../lib/supabase';

export default function LoginScreen() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'FOREMAN' | 'ADMIN'>('FOREMAN');
  const [roleLoading, setRoleLoading] = useState(false);

  const handleRoleToggle = (role: 'FOREMAN' | 'ADMIN') => {
    if (role === selectedRole) return;
    setRoleLoading(true);
    setTimeout(() => {
      setSelectedRole(role);
      setRoleLoading(false);
    }, 400);
  };

  const handleLogin = async () => {
    if (loading) return;
    if (!username || !password) {
      Alert.alert('Error', 'Please enter username and password');
      return;
    }

    setLoading(true);
    try {
      // Append a pseudo-domain to allow Supabase to use its secure email/password auth 
      // while letting the user just type their username.
      const pseudoEmail = `${username.toLowerCase().trim()}@islandtower.local`;
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: pseudoEmail,
        password,
      });

      if (error) throw error;

      // Check role
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle(); 
        
      if (userError) {
        console.error('Role check error:', userError);
      }

      let finalRole = selectedRole; // default to what they selected

      if (!userData) {
        if (selectedRole === 'FOREMAN') {
          // Auto-create profile for foremen
          const { error: insertError } = await supabase.from('users').upsert({
            id: data.user.id,
            full_name: username,
            email: pseudoEmail,
            role: 'FOREMAN'
          }, { onConflict: 'id' });
          
          if (insertError && insertError.code !== '23505') {
            console.error('Auto-create profile failed:', insertError);
          }
        }
      } else {
        // Validate that they selected the correct portal
        if (userData.role !== selectedRole) {
          await supabase.auth.signOut();
          Alert.alert('Incorrect Portal', `Your account is registered as an ${userData.role}. Please select the ${userData.role} portal.`);
          setLoading(false);
          return;
        }
        finalRole = userData.role;
      }

      // Log the attendance ONLY for foremen
      if (finalRole !== 'ADMIN') {
        await supabase.from('attendance_logs').insert({
          user_id: data.user.id,
          action: 'LOGIN'
        });
      }

      if (finalRole === 'ADMIN') {
        router.replace('/(admin)/dashboard');
      } else {
        router.replace('/(app)/home');
      }
      
    } catch (error: any) {
      console.error(error);
      Alert.alert('Login Failed', 'Invalid username or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 justify-center items-center bg-slate-50 p-6"
    >
      <View 
        className="w-full max-w-sm bg-white p-8 rounded-[32px] border border-slate-100"
        style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 15, elevation: 10 }}
      >
        <View className="items-center mb-8">
          <View className="bg-white p-2 rounded-3xl mb-4 border border-slate-100" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 }}>
            <Image 
              source={require('../assets/images/island_tower_logo.jpg')} 
              style={{ width: 90, height: 90, borderRadius: 16 }} 
              resizeMode="contain" 
            />
          </View>
          <Text className="text-3xl font-black text-slate-900 text-center tracking-tight">
            ISLAND TOWER
          </Text>
          <Text className="text-slate-500 mt-2 text-center font-medium">
            {selectedRole === 'ADMIN' ? 'Admin Portal' : 'Foreman Portal'}
          </Text>
        </View>

        <View className="space-y-5">
          <View className="flex-row bg-slate-100 p-1 rounded-2xl mb-2">
            <TouchableOpacity 
              className={`flex-1 py-3 rounded-xl flex-row justify-center items-center ${selectedRole === 'FOREMAN' ? 'bg-white' : ''}`}
              style={selectedRole === 'FOREMAN' ? { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 } : {}}
              onPress={() => handleRoleToggle('FOREMAN')}
              disabled={roleLoading}
            >
              {roleLoading && selectedRole !== 'FOREMAN' ? (
                <ActivityIndicator size="small" color="#64748b" />
              ) : (
                <Text className={`font-bold ${selectedRole === 'FOREMAN' ? 'text-slate-900' : 'text-slate-500'}`}>Foreman</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity 
              className={`flex-1 py-3 rounded-xl flex-row justify-center items-center ${selectedRole === 'ADMIN' ? 'bg-white' : ''}`}
              style={selectedRole === 'ADMIN' ? { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 } : {}}
              onPress={() => handleRoleToggle('ADMIN')}
              disabled={roleLoading}
            >
              {roleLoading && selectedRole !== 'ADMIN' ? (
                <ActivityIndicator size="small" color="#64748b" />
              ) : (
                <Text className={`font-bold ${selectedRole === 'ADMIN' ? 'text-slate-900' : 'text-slate-500'}`}>Admin</Text>
              )}
            </TouchableOpacity>
          </View>

          <View>
            <Text className="text-slate-500 mb-2 font-semibold text-xs uppercase tracking-wider">Username</Text>
            <TextInput
              className="w-full bg-white border border-slate-200 rounded-2xl p-4 text-slate-900 placeholder:text-slate-400 font-medium"
              placeholder="Enter your username"
              placeholderTextColor="#94a3b8"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              editable={!loading}
            />
          </View>
          
          <View className="mt-4">
            <Text className="text-slate-500 mb-2 font-semibold text-xs uppercase tracking-wider">Password</Text>
            <View className="w-full bg-white border border-slate-200 rounded-2xl flex-row items-center pr-4">
              <TextInput
                className="flex-1 p-4 text-slate-900 placeholder:text-slate-400 font-medium"
                placeholder="Enter your password"
                placeholderTextColor="#94a3b8"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                editable={!loading}
              />
              <TouchableOpacity 
                onPress={() => setShowPassword(!showPassword)}
                className="p-2 -mr-2 active:opacity-60"
              >
                {showPassword ? (
                  <EyeOff size={20} color="#94a3b8" />
                ) : (
                  <Eye size={20} color="#94a3b8" />
                )}
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity 
            className={`w-full bg-[#1e3a8a] active:opacity-80 rounded-2xl p-4 mt-8 items-center flex-row justify-center ${loading ? 'opacity-70' : ''}`}
            style={{ shadowColor: '#1e3a8a', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 15, elevation: 8 }}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-bold text-lg">Sign In</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View className="items-center mt-6">
        <Text className="text-slate-400 text-xs font-medium">Need help logging in?</Text>
        <View className="flex-row items-center mt-1.5">
          <TouchableOpacity onPress={() => Linking.openURL('tel:+971526605909')}>
            <Text className="text-[#1e3a8a] font-bold text-xs">+971 52 660 5909</Text>
          </TouchableOpacity>
          <Text className="text-slate-300 mx-2">|</Text>
          <TouchableOpacity onPress={() => Linking.openURL('tel:+971547714315')}>
            <Text className="text-[#1e3a8a] font-bold text-xs">+971 54 771 4315</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
