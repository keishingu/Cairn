import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

function tabIcon(name: IoniconsName) {
  return ({ color }: { color: string }) => <Ionicons name={name} size={24} color={color} />
}

export default function AppLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: '#0070f3' }}>
      <Tabs.Screen
        name="projects"
        options={{ title: 'プロジェクト', tabBarIcon: tabIcon('folder-outline') }}
      />
      <Tabs.Screen
        name="chats"
        options={{ title: 'チャット', tabBarIcon: tabIcon('chatbubbles-outline') }}
      />
      <Tabs.Screen
        name="tasks"
        options={{ title: 'タスク', tabBarIcon: tabIcon('checkmark-circle-outline') }}
      />
      <Tabs.Screen
        name="notifications"
        options={{ title: '通知', tabBarIcon: tabIcon('notifications-outline') }}
      />
      <Tabs.Screen
        name="menu"
        options={{ title: 'メニュー', tabBarIcon: tabIcon('menu-outline') }}
      />
    </Tabs>
  )
}
