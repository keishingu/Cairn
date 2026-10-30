import { Stack } from 'expo-router'
import { useAppAppearance } from '../../../components/appearance-provider'

// 通知などから詳細を直接開いても、戻り先の一覧をスタックの下に置く
export const unstable_settings = { anchor: 'index' }

// 一覧の上に詳細を重ねる。iOS のスワイプで戻る途中も背面に一覧が見える。
// 詳細は 1 画面だけにして、別のチャットへ移っても戻り先は常に一覧にする
export default function ChatsLayout() {
  const { palette } = useAppAppearance()
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[channelId]" getId={() => 'channel'} />
    </Stack>
  )
}
