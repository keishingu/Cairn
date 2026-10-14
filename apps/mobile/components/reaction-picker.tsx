import React from 'react'
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { emojiCategories, reactionEmojis } from '../lib/reaction-emoji-catalog'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useT } from './locale-provider'
import type { ThemePalette } from '../lib/theme'
import { quickReactions } from '../lib/reaction-history'

const categories: Record<string, string> = {
  people: 'Smileys & people',
  nature: 'Animals & nature',
  foods: 'Food & drink',
  activity: 'Activities',
  places: 'Travel & places',
  objects: 'Objects',
  symbols: 'Symbols',
  flags: 'Flags',
}

export function ReactionPicker({
  visible,
  palette,
  recent,
  historyError,
  onSelect,
  onClose,
}: {
  visible: boolean
  palette: ThemePalette
  recent: string[]
  historyError: boolean
  onSelect: (emoji: string) => void
  onClose: () => void
}) {
  const t = useT()
  const insets = useSafeAreaInsets()
  const [expanded, setExpanded] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const [category, setCategory] = React.useState('people')
  const [tone, setTone] = React.useState(0)
  React.useEffect(() => {
    if (!visible) {
      setExpanded(false)
      setSearch('')
      setCategory('people')
    }
  }, [visible])
  const entries = React.useMemo(
    () => reactionEmojis(search, category, tone),
    [search, category, tone],
  )
  const searching = search.trim().length > 0
  const button = (emoji: string) => (
    <Pressable
      key={emoji}
      accessibilityRole="button"
      accessibilityLabel={t('Add {emoji}', { emoji })}
      onPress={() => onSelect(emoji)}
      style={[styles.quickButton, { backgroundColor: palette.card2 }]}
    >
      <Text style={styles.emoji}>{emoji}</Text>
    </Pressable>
  )
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityLabel={t('Close')}
          accessibilityRole="button"
          onPress={onClose}
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: palette.card,
              borderColor: palette.border,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <View style={styles.heading}>
            <Text style={[styles.title, { color: palette.text }]}>{t('Reaction')}</Text>
            <Pressable
              accessibilityLabel={t('Close')}
              accessibilityRole="button"
              onPress={onClose}
              style={styles.close}
            >
              <Ionicons name="close" size={24} color={palette.text2} />
            </Pressable>
          </View>
          <View style={styles.quick}>
            {quickReactions(recent).map(button)}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('All emoji')}
              accessibilityState={{ expanded }}
              onPress={() => setExpanded((value) => !value)}
              style={[styles.quickButton, { backgroundColor: palette.card2 }]}
            >
              <Ionicons name={expanded ? 'chevron-down' : 'add'} size={24} color={palette.text} />
            </Pressable>
          </View>
          {historyError && (
            <Text accessibilityRole="alert" style={{ color: palette.text2 }}>
              {t('Could not load recent reactions')}
            </Text>
          )}
          {expanded && (
            <>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={t('Search by English name or emoji')}
                accessibilityLabel={t('Search by English name or emoji')}
                placeholderTextColor={palette.text3}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.search, { color: palette.text, backgroundColor: palette.card2 }]}
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                style={styles.tabs}
              >
                {emojiCategories.map((item) => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: category === item.id && !searching }}
                    onPress={() => {
                      setCategory(item.id)
                      setSearch('')
                    }}
                    style={[
                      styles.tab,
                      {
                        backgroundColor:
                          category === item.id && !searching ? palette.accentSoft : palette.card2,
                      },
                    ]}
                  >
                    <Text style={{ color: palette.text }}>{t(categories[item.id] ?? item.id)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={styles.tones}>
                {['👋', '👋🏻', '👋🏼', '👋🏽', '👋🏾', '👋🏿'].map((emoji, index) => (
                  <Pressable
                    key={emoji}
                    accessibilityRole="button"
                    accessibilityLabel={t('Skin tone {number}', { number: index + 1 })}
                    accessibilityState={{ selected: tone === index }}
                    onPress={() => setTone(index)}
                    style={[
                      styles.tone,
                      { backgroundColor: tone === index ? palette.accentSoft : palette.card2 },
                    ]}
                  >
                    <Text style={{ fontSize: 22 }}>{emoji}</Text>
                  </Pressable>
                ))}
              </View>
              <FlatList
                key={category + search + tone}
                data={entries}
                numColumns={8}
                keyExtractor={(item) => item.id}
                style={styles.grid}
                keyboardShouldPersistTaps="handled"
                initialNumToRender={48}
                maxToRenderPerBatch={48}
                ListEmptyComponent={
                  <Text style={{ color: palette.text2 }}>{t('No emoji found')}</Text>
                }
                renderItem={({ item }) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('Add {emoji}', { emoji: item.native })}
                    onPress={() => onSelect(item.native)}
                    style={styles.cell}
                  >
                    <Text style={styles.emoji}>{item.native}</Text>
                  </Pressable>
                )}
              />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0008' },
  sheet: {
    borderTopWidth: 1,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 8,
    maxHeight: '90%',
  },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 15, fontWeight: '700' },
  close: { padding: 10 },
  quick: { flexDirection: 'row', gap: 4 },
  quickButton: {
    flex: 1,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  emoji: { fontSize: 24 },
  search: { minHeight: 44, borderRadius: 10, paddingHorizontal: 12, marginTop: 12 },
  tabs: { flexGrow: 0, marginVertical: 10 },
  tab: { padding: 10, borderRadius: 10, marginRight: 6 },
  tones: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  tone: { padding: 8, borderRadius: 8 },
  grid: { height: 280, flexGrow: 0 },
  cell: { width: '12.5%', height: 46, alignItems: 'center', justifyContent: 'center' },
})
