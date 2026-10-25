import { Tabs } from 'expo-router';
import { Platform, Text } from 'react-native';
import { BarChart3, House, Settings, Sparkles } from 'lucide-react-native';
import { colors, fonts } from '@/theme/colors';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.line,
          ...(Platform.OS === 'web' ? { height: 68, paddingTop: 8, paddingBottom: 10 } : {}),
        },
        tabBarActiveTintColor: colors.amber,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabel: ({ color, children }) => (
          <Text style={{ fontFamily: fonts.bodySemibold, fontSize: 12, lineHeight: 18, color }}>{children}</Text>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Início', tabBarIcon: ({ color }) => <House size={22} color={color} strokeWidth={2} /> }}
      />
      <Tabs.Screen
        name="cenas"
        options={{ title: 'Cenas', tabBarIcon: ({ color }) => <Sparkles size={22} color={color} strokeWidth={2} /> }}
      />
      <Tabs.Screen
        name="uso"
        options={{ title: 'Uso', tabBarIcon: ({ color }) => <BarChart3 size={22} color={color} strokeWidth={2} /> }}
      />
      <Tabs.Screen
        name="ajustes"
        options={{ title: 'Ajustes', tabBarIcon: ({ color }) => <Settings size={22} color={color} strokeWidth={2} /> }}
      />
    </Tabs>
  );
}
