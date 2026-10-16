import React from 'react'
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  PanResponder,
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
import { isVerticalSheetDrag, quickReactions, reactionSheetSwipe, REACTION_EMOJI_CATEGORY_LABELS, SKIN_TONE_SAMPLES } from '@cairn/shared'

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
  const setExpandedAnimated = React.useCallback((next: boolean) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setExpanded(next)
  }, [])
  // シート上部（つまみ〜「もっと見る」）の縦スワイプ。下方向だけ指に追従させ、離したら元の位置へ戻す
  const dragY = React.useRef(new Animated.Value(0)).current
  const expandedRef = React.useRef(expanded)
  expandedRef.current = expanded
  const onCloseRef = React.useRef(onClose)
  onCloseRef.current = onClose
  const panResponder = React.useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => isVerticalSheetDrag(gesture.dx, gesture.dy),
    onPanResponderMove: (_event, gesture) => dragY.setValue(Math.max(0, gesture.dy)),
    onPanResponderRelease: (_event, gesture) => {
      const action = reactionSheetSwipe(gesture.dy, gesture.vy, expandedRef.current)
      Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start()
      if (action === 'expand') setExpandedAnimated(true)
      else if (action === 'collapse') setExpandedAnimated(false)
      else if (action === 'close') onCloseRef.current()
    },
    onPanResponderTerminate: () => Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start(),
  }), [dragY, setExpandedAnimated])
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
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: palette.card,
              borderColor: palette.border,
              paddingBottom: insets.bottom + 16,
              transform: [{ translateY: dragY }],
            },
          ]}
        >
          <View {...panResponder.panHandlers}>
          <View style={styles.handleArea}>
            <View style={[styles.handle, { backgroundColor: palette.border }]} />
          </View>
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
          </View>
          {/* 「+」だけでは他の絵文字を選べると伝わりにくいため、文言付きの全幅ボタンにする。上スワイプでも開ける */}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            onPress={() => setExpandedAnimated(!expanded)}
            style={[styles.moreButton, { backgroundColor: palette.card2 }]}
          >
            <Text style={[styles.moreLabel, { color: palette.text2 }]}>{expanded ? t('Show less') : t('Show more')}</Text>
            <Ionicons name={expanded ? 'chevron-down' : 'chevron-up'} size={16} color={palette.text2} />
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
                    <Text style={{ color: palette.text }}>{t(REACTION_EMOJI_CATEGORY_LABELS[item.id] ?? item.id)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={styles.tones}>
                {SKIN_TONE_SAMPLES.map((emoji, index) => (
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
        </Animated.View>
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
    paddingTop: 4,
    maxHeight: '90%',
  },
  handleArea: { alignItems: 'center', paddingVertical: 6 },
  handle: { width: 36, height: 4, borderRadius: 2 },
  moreButton: {
    marginTop: 8,
    height: 44,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  moreLabel: { fontSize: 14, fontWeight: '600' },
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
