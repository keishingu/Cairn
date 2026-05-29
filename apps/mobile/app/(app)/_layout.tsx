import { Tabs } from 'expo-router'

export default function AppLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="projects" options={{ title: 'プロジェクト' }} />
      <Tabs.Screen name="chats" options={{ title: 'チャット' }} />
      <Tabs.Screen name="tasks" options={{ title: 'タスク' }} />
      <Tabs.Screen name="ai" options={{ title: 'AI' }} />
      <Tabs.Screen name="notifications" options={{ title: '通知' }} />
    </Tabs>
  )
}
