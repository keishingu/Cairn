import React from 'react'
import { Image, Pressable, StyleSheet, Text } from 'react-native'
import { useWorkspace } from '../hooks/use-account'
import { useAppAppearance } from './appearance-provider'
import { WorkspaceSwitcherModal } from './workspace-switcher-modal'

export function WorkspaceSwitcherButton() {
  const { data: workspace } = useWorkspace()
  const { palette } = useAppAppearance()
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${workspace?.name ?? '現在'}のワークスペースを切り替える`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: palette.accent },
          pressed && styles.pressed,
        ]}
        hitSlop={6}
      >
        {workspace?.logoUrl ? (
          <Image source={{ uri: workspace.logoUrl }} style={styles.logo} />
        ) : (
          <Text style={[styles.initial, { color: palette.onAccent }]}>
            {workspace?.name?.slice(0, 1) ?? 'C'}
          </Text>
        )}
      </Pressable>
      <WorkspaceSwitcherModal
        currentWorkspaceId={workspace?.id}
        visible={open}
        onClose={() => setOpen(false)}
      />
    </>
  )
}

const styles = StyleSheet.create({
  button: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 30,
    height: 30,
    borderRadius: 8,
  },
  initial: { fontSize: 12, fontWeight: '800' },
  pressed: { opacity: 0.72 },
})
