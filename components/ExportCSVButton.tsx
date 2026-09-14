import React, { useState } from 'react';
import { TouchableOpacity, Text, ActivityIndicator, Alert, Platform } from 'react-native';
import { Download } from 'lucide-react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { buildCSV } from '../lib/csv';

export default function ExportCSVButton({ data, filename = 'export', label = 'Export to CSV', className = '' }: any) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!data || data.length === 0) {
      Alert.alert('No Data', 'There is no data to export for this date.');
      return;
    }

    setExporting(true);
    try {
      // 1. Generate CSV string
      const headers = Object.keys(data[0]);
      const rows = data.map((row: any) => headers.map(key => row[key]));
      const csvString = buildCSV(headers, rows);
      const fileName = `${filename}_${Date.now()}.csv`;

      if (Platform.OS === 'web') {
        // expo-sharing has no web implementation -- Sharing.isAvailableAsync() is
        // always false there, so web needs its own Blob + anchor download instead.
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        // 2. Save to temp file
        const fileUri = `${FileSystem.documentDirectory}${fileName}`;
        await FileSystem.writeAsStringAsync(fileUri, csvString, { encoding: FileSystem.EncodingType.UTF8 });

        // 3. Share the file
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'text/csv',
            dialogTitle: 'Export Data',
          });
        } else {
          Alert.alert('Not Supported', 'Sharing is not available on this device.');
        }
      }
    } catch (err: any) {
      Alert.alert('Export Error', err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <TouchableOpacity 
      onPress={handleExport}
      disabled={exporting}
      className={`flex-row items-center justify-center bg-emerald-600 rounded-lg px-4 py-2.5 active:bg-emerald-700 ${className}`}
    >
      {exporting ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <>
          <Download size={16} color="#fff" />
          <Text className="text-white font-bold ml-2 text-sm">{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}
