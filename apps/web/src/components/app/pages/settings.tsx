'use client'

import React from 'react'
import { useTheme } from 'next-themes'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Icon } from '../primitives'
import { STATUS_COL } from '../data'
import { useAccentColor } from '@/components/accent-color-provider'
import { ACCENT_PRESETS } from '@/lib/accent-presets'
import { useWorkspaceSettings, useUpdateWorkspaceSettings } from '@/lib/use-workspace-settings'
import type { WorkspaceCoverPhoto } from '@/app/api/workspaces/cover-photos/route'

const Toggle = ({ on }: { on: boolean }) => (
  <div style={{
    width: 36, height: 20, borderRadius: 999, padding: 2,
    background: on ? 'var(--accent)' : 'var(--border-2)',
    transition: 'background .15s', cursor: 'pointer',
    display: 'flex', alignItems: 'center',
    justifyContent: on ? 'flex-end' : 'flex-start',
  }}>
    <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.2)' }}/>
  </div>
)

type ThemeValue = 'light' | 'dark' | 'system'

const THEME_OPTIONS: { value: ThemeValue; label: string; icon: string }[] = [
  { value: 'light',  label: 'ライト',   icon: 'sun' },
  { value: 'system', label: 'システム', icon: 'monitor' },
  { value: 'dark',   label: 'ダーク',   icon: 'moon' },
]

const SettingsAccount = () => (
  <div style={{ maxWidth: 780 }}>
    <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>アカウント</h1>
    <p style={{ margin: '0 0 24px', color: 'var(--text-3)', fontSize: 13 }}>プロフィールや通知などの個人設定です。</p>

    <section style={{ marginBottom: 24 }}>
      <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>プロフィール</h2>
      <div className="card" style={{ padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px', borderBottom: '1px solid var(--divider)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>表示名</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>チームメンバーに表示される名前</div>
          </div>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>山田 太郎</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>メールアドレス</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>ログインに使用するアドレス</div>
          </div>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>yamada@example.com</span>
        </div>
      </div>
    </section>
  </div>
)

const SettingsAppearance = () => {
  const { theme, setTheme } = useTheme()
  const { accentId, setAccentId } = useAccentColor()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  return (
    <div style={{ maxWidth: 780 }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>外観</h1>
      <p style={{ margin: '0 0 24px', color: 'var(--text-3)', fontSize: 13 }}>テーマやカラーなど、表示に関する個人設定です。</p>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>テーマ・カラー</h2>
        <div className="card" style={{ padding: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px', borderBottom: '1px solid var(--divider)' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>テーマ</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>ライト・ダーク・システム設定に従う</div>
            </div>
            {mounted && (
              <div style={{ display: 'flex', gap: 4, background: 'var(--bg-elev)', borderRadius: 10, padding: 4 }}>
                {THEME_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setTheme(opt.value)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '6px 12px', borderRadius: 7, border: 'none',
                      background: theme === opt.value ? 'var(--card)' : 'transparent',
                      color: theme === opt.value ? 'var(--text)' : 'var(--text-3)',
                      fontWeight: theme === opt.value ? 600 : 500,
                      fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer',
                      boxShadow: theme === opt.value ? 'var(--shadow-sm)' : 'none',
                      transition: 'all .12s',
                    }}
                  >
                    <Icon name={opt.icon} size={13}/> {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>ハイライトカラー</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>ボタン・アクティブ状態などのアクセントカラー</div>
            </div>
            {mounted && (
              <div style={{ display: 'flex', gap: 8 }}>
                {ACCENT_PRESETS.map(preset => (
                  <button
                    key={preset.id}
                    title={preset.label}
                    onClick={() => setAccentId(preset.id)}
                    style={{
                      width: 26, height: 26, borderRadius: '50%',
                      background: preset.swatch, border: 'none', cursor: 'pointer', padding: 0,
                      outline: accentId === preset.id ? `3px solid ${preset.swatch}` : '3px solid transparent',
                      outlineOffset: 2,
                      transition: 'outline .12s',
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

const SettingsWorkflow = () => {
  const stages = [
    { id: 'plan',   label: '計画中',     c: STATUS_COL.plan },
    { id: 'review', label: '審議中',     c: STATUS_COL.review },
    { id: 'wait',   label: '実施待ち',   c: STATUS_COL.wait },
    { id: 'doing',  label: '実施中',     c: STATUS_COL.doing },
    { id: 'retro',  label: '振り返り中', c: STATUS_COL.retro },
    { id: 'done',   label: '完了',       c: STATUS_COL.done },
  ]
  return (
    <div style={{ maxWidth: 780 }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>ワークフロー</h1>
      <p style={{ margin: '0 0 24px', color: 'var(--text-3)', fontSize: 13 }}>プロジェクトのステータス遷移とルールを管理します。</p>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>ステージ</h2>
        <div className="card" style={{ padding: 6 }}>
          {stages.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderBottom: i < 5 ? '1px solid var(--divider)' : 'none' }}>
              <Icon name="grip" size={16} color="var(--text-4)" style={{ cursor: 'grab' }}/>
              <span style={{ width: 28, height: 6, borderRadius: 3, background: s.c.bar }}/>
              <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1 }}>{s.label}</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>承認 必須: {['—', '部長', '—', '—', '—', '—'][i]}</span>
              <button className="btn btn-ghost" style={{ width: 28, height: 28, padding: 0 }}><Icon name="edit" size={12}/></button>
            </div>
          ))}
          <button style={{ width: '100%', padding: '10px', border: 'none', background: 'transparent', color: 'var(--text-3)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Icon name="plus" size={13}/> ステージを追加
          </button>
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>自動化ルール</h2>
        <div className="card" style={{ padding: 0 }}>
          {[
            { w: '審議中 → 実施待ち',   t: 'リーダーに通知 + チャットに自動投稿', on: true },
            { w: '実施中 → 振り返り中', t: 'ギャラリー自動アーカイブ',           on: true },
            { w: '完了から30日',         t: 'プロジェクトを自動アーカイブ',       on: false },
          ].map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderBottom: i < 2 ? '1px solid var(--divider)' : 'none' }}>
              <Icon name="flag" size={15} color="var(--accent)"/>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{r.w}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{r.t}</div>
              </div>
              <Toggle on={r.on}/>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

const SettingsAI = () => (
  <div style={{ maxWidth: 780 }}>
    <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>AIエージェント</h1>
    <p style={{ margin: '0 0 24px', color: 'var(--text-3)', fontSize: 13 }}>各プロジェクトに常駐するAIアシスタントの動作を設定します。</p>

    <section style={{ marginBottom: 24 }}>
      <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>モデル</h2>
      <div className="card" style={{ padding: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {[
          { n: 'GPT-4o',      d: '汎用・推奨',     on: true },
          { n: 'GPT-4o mini', d: '高速・低コスト', on: false },
        ].map((m, i) => (
          <div key={i} style={{ padding: 12, borderRadius: 8, border: `2px solid ${m.on ? 'var(--accent)' : 'var(--border)'}`, background: m.on ? 'var(--accent-soft)' : 'var(--card-2)', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="sparkles" size={14} color={m.on ? 'var(--accent-text)' : 'var(--text-3)'}/>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{m.n}</span>
              {m.on && <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, color: 'var(--accent-text)' }}>選択中</span>}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>{m.d}</div>
          </div>
        ))}
      </div>
    </section>

    <section style={{ marginBottom: 24 }}>
      <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>動作</h2>
      <div className="card">
        {[
          { l: 'ファイルアップロード時に自動要約', s: 'PDF / XLSX / GPX', on: true },
          { l: 'チャットで @AI でメンション呼び出し', s: '即時応答', on: true },
          { l: 'ダッシュボードに自動サマリー生成', s: '毎日 7:00 / 22:00', on: true },
          { l: '危険情報を検知して通知', s: '天候・遭難情報・装備不足', on: false },
        ].map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderBottom: i < 3 ? '1px solid var(--divider)' : 'none' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{r.l}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{r.s}</div>
            </div>
            <Toggle on={r.on}/>
          </div>
        ))}
      </div>
    </section>

    <section>
      <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>システムプロンプト</h2>
      <textarea defaultValue="山岳部の活動を支援するアシスタントとして、安全を最優先に、計画書・装備・気象情報をもとに具体的な提案を行ってください。"
        rows={5} style={{ width: '100%', padding: 12, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }}/>
    </section>
  </div>
)

const SettingsWorkspaceGeneral = () => {
  const { data } = useWorkspaceSettings()
  const update = useUpdateWorkspaceSettings()
  const [label, setLabel] = React.useState('')
  const [saved, setSaved] = React.useState(false)

  React.useEffect(() => {
    if (data !== undefined) setLabel(data.projectLabel ?? '')
  }, [data])

  const handleSave = async () => {
    await update.mutateAsync({ projectLabel: label })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ maxWidth: 780 }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>ワークスペース設定</h1>
      <p style={{ margin: '0 0 24px', color: 'var(--text-3)', fontSize: 13 }}>ワークスペース全体の表示・動作に関する設定です。</p>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>用語のカスタマイズ</h2>
        <div className="card" style={{ padding: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>プロジェクトの呼び名</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                ナビゲーションやページタイトルに表示される名称。空欄の場合は「プロジェクト」が使われます。
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="プロジェクト"
                style={{
                  padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 7,
                  background: 'var(--card-2)', color: 'var(--text)', fontSize: 13,
                  fontFamily: 'inherit', outline: 'none', width: 160,
                }}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
              />
              <button
                onClick={handleSave}
                disabled={update.isPending}
                className="btn btn-primary"
                style={{ height: 32, padding: '0 14px', fontSize: 12.5 }}
              >
                {saved ? '保存済み' : '保存'}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

const SettingsCoverPhotos = () => {
  const queryClient = useQueryClient()
  const { data: photos = [], isLoading } = useQuery<WorkspaceCoverPhoto[]>({
    queryKey: ['workspace-cover-photos'],
    queryFn: () => fetch('/api/workspaces/cover-photos').then(r => r.json()),
  })
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = React.useState(false)
  const [uploadError, setUploadError] = React.useState('')
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/workspaces/cover-photos', { method: 'POST', body: fd })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? 'アップロードに失敗しました')
      }
      const newPhoto = await res.json() as WorkspaceCoverPhoto
      queryClient.setQueryData<WorkspaceCoverPhoto[]>(['workspace-cover-photos'], old => [...(old ?? []), newPhoto])
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'エラーが発生しました')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const deletePhoto = useMutation({
    mutationFn: (id: string) => fetch('/api/workspaces/cover-photos', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).then(r => { if (!r.ok && r.status !== 204) throw new Error('削除に失敗しました') }),
    onSuccess: (_data, id) => {
      queryClient.setQueryData<WorkspaceCoverPhoto[]>(['workspace-cover-photos'], old => (old ?? []).filter(p => p.id !== id))
      setConfirmDeleteId(null)
    },
  })

  return (
    <div style={{ maxWidth: 780 }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>カバー写真ライブラリ</h1>
      <p style={{ margin: '0 0 24px', color: 'var(--text-3)', fontSize: 13 }}>
        プロジェクト作成時に選択できるカバー写真をここでまとめてアップロードできます。
      </p>

      <section style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>写真一覧</h2>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="btn btn-primary"
            style={{ height: 32, padding: '0 14px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Icon name={uploading ? 'loader' : 'upload'} size={13}/>
            {uploading ? 'アップロード中…' : '写真を追加'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/heic"
            style={{ display: 'none' }}
            onChange={handleUpload}
          />
        </div>

        {uploadError && (
          <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: 'var(--red-soft)', color: 'var(--red-text)', fontSize: 12.5 }}>
            {uploadError}
          </div>
        )}

        {isLoading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>読み込み中…</div>
        ) : photos.length === 0 ? (
          <div className="card" style={{ padding: 32, textAlign: 'center' }}>
            <Icon name="image" size={28} color="var(--text-4)"/>
            <div style={{ marginTop: 10, fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>写真がまだありません</div>
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-3)' }}>「写真を追加」からアップロードしてください</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {photos.map(photo => (
              <div key={photo.id} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', aspectRatio: '16/9', background: 'var(--card-2)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt={photo.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.6) 100%)', opacity: 0, transition: 'opacity .15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0' }}
                >
                  <button
                    onClick={() => setConfirmDeleteId(photo.id)}
                    style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.5)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Icon name="trash" size={13}/>
                  </button>
                  <div style={{ position: 'absolute', bottom: 6, left: 8, right: 8, fontSize: 11, color: '#fff', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {photo.name}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Delete confirmation dialog */}
      {confirmDeleteId !== null && (() => {
        const photo = photos.find(p => p.id === confirmDeleteId)
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
            onClick={e => { if (e.target === e.currentTarget) setConfirmDeleteId(null) }}
          >
            <div className="card" style={{ width: 360, borderRadius: 14, padding: 20, boxShadow: 'var(--shadow-xl)' }}>
              {photo && (
                <div style={{ borderRadius: 8, overflow: 'hidden', marginBottom: 16, aspectRatio: '16/9' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt={photo.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>
                </div>
              )}
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>写真を削除しますか？</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 18, lineHeight: 1.6 }}>
                「{photo?.name ?? ''}」を削除します。この写真をカバーに設定しているプロジェクトはデフォルトの写真に戻ります。
              </div>
              {deletePhoto.error && (
                <div style={{ marginBottom: 12, padding: '7px 10px', borderRadius: 7, background: 'var(--red-soft)', color: 'var(--red-text)', fontSize: 12 }}>
                  {deletePhoto.error instanceof Error ? deletePhoto.error.message : '削除に失敗しました'}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  disabled={deletePhoto.isPending}
                  style={{ flex: 1, height: 36, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  キャンセル
                </button>
                <button
                  onClick={() => deletePhoto.mutate(confirmDeleteId)}
                  disabled={deletePhoto.isPending}
                  style={{ flex: 1, height: 36, borderRadius: 8, border: 'none', background: 'var(--red)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: deletePhoto.isPending ? 'default' : 'pointer', fontFamily: 'inherit', opacity: deletePhoto.isPending ? 0.7 : 1 }}
                >
                  {deletePhoto.isPending ? '削除中…' : '削除する'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

const SettingsIntegrations = () => {
  const { data, refetch } = useQuery<{ token: string }>({
    queryKey: ['ical-token'],
    queryFn: () => fetch('/api/calendar/token').then(r => r.json()),
  })
  const regenerate = useMutation({
    mutationFn: () => fetch('/api/calendar/token', { method: 'POST' }).then(r => r.json()),
    onSuccess: () => refetch(),
  })
  const [copiedScope, setCopiedScope] = React.useState<string | null>(null)

  const buildUrl = (scope: 'me' | 'workspace') => {
    if (!data?.token) return ''
    const base = typeof window !== 'undefined' ? window.location.origin : ''
    return `${base}/api/calendar/ical?token=${data.token}&scope=${scope}`
  }

  const copy = (scope: 'me' | 'workspace') => {
    void navigator.clipboard.writeText(buildUrl(scope))
    setCopiedScope(scope)
    setTimeout(() => setCopiedScope(null), 2000)
  }

  const feeds: { scope: 'me' | 'workspace'; label: string; desc: string }[] = [
    { scope: 'me',        label: '自分が参加しているプロジェクト', desc: 'メンバーとして参加しているプロジェクトの期間のみ' },
    { scope: 'workspace', label: 'ワークスペース全体',             desc: 'ワークスペース内のすべてのプロジェクト期間' },
  ]

  return (
    <div style={{ maxWidth: 780 }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>連携</h1>
      <p style={{ margin: '0 0 24px', color: 'var(--text-3)', fontSize: 13 }}>外部サービスとの連携を設定します。</p>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700 }}>Google カレンダー連携</h2>
        <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--text-3)' }}>
          URLをコピーして Google カレンダーの「他のカレンダーを追加」→「URLで追加」に貼り付けてください。
        </p>
        <div className="card" style={{ padding: 0 }}>
          {feeds.map((f, i) => (
            <div key={f.scope} style={{ padding: '14px 16px', borderBottom: i === 0 ? '1px solid var(--divider)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{f.label}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 8 }}>{f.desc}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 10px', minWidth: 0 }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                      {data?.token ? buildUrl(f.scope) : '読み込み中…'}
                    </span>
                    <button
                      onClick={() => copy(f.scope)}
                      disabled={!data?.token}
                      className="btn btn-ghost"
                      style={{ height: 26, fontSize: 11.5, padding: '0 8px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <Icon name={copiedScope === f.scope ? 'check' : 'copy'} size={12}/>
                      {copiedScope === f.scope ? 'コピー済み' : 'コピー'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--divider)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>URLを知っている人は誰でもカレンダーを閲覧できます。漏洩した場合は再生成してください。</span>
            <button
              onClick={() => regenerate.mutate()}
              disabled={regenerate.isPending}
              className="btn btn-ghost"
              style={{ height: 28, fontSize: 12, padding: '0 10px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <Icon name="refresh" size={12}/> URL を再生成
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

const NAV_GROUPS = [
  {
    label: '個人',
    items: [
      { id: 'account',    l: 'アカウント',    i: 'user' },
      { id: 'appearance', l: '外観',          i: 'sun' },
    ],
  },
  {
    label: 'ワークスペース',
    items: [
      { id: 'general',       l: 'ワークスペース設定',   i: 'settings' },
      { id: 'cover-photos',  l: 'カバー写真',           i: 'image' },
      { id: 'workflow',      l: 'ワークフロー',         i: 'flag' },
      { id: 'ai',            l: 'AIエージェント',       i: 'sparkles' },
      { id: 'members',       l: 'メンバー',             i: 'users' },
      { id: 'integrations',  l: '連携',                 i: 'layers' },
      { id: 'billing',       l: '請求',                 i: 'archive' },
    ],
  },
]

export const PageSettings = () => {
  const [section, setSection] = React.useState('account')
  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <aside style={{ width: 220, borderRight: '1px solid var(--border)', padding: '20px 14px', background: 'var(--card)' }}>
        <h2 style={{ margin: '0 8px 14px', fontSize: 16, fontWeight: 700 }}>設定</h2>
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.label} style={{ marginBottom: gi < NAV_GROUPS.length - 1 ? 16 : 0 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0 10px', marginBottom: 4 }}>
              {group.label}
            </div>
            {group.items.map(s => (
              <button key={s.id} onClick={() => setSection(s.id)} style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '8px 10px', borderRadius: 7, border: 'none',
                background: section === s.id ? 'var(--card-hover)' : 'transparent',
                color: section === s.id ? 'var(--text)' : 'var(--text-2)',
                fontWeight: section === s.id ? 600 : 500,
                fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left',
              }}>
                <Icon name={s.i} size={14}/> {s.l}
              </button>
            ))}
          </div>
        ))}
      </aside>
      <div style={{ flex: 1, overflow: 'auto', padding: '32px 40px' }}>
        {section === 'account'       && <SettingsAccount/>}
        {section === 'appearance'    && <SettingsAppearance/>}
        {section === 'general'       && <SettingsWorkspaceGeneral/>}
        {section === 'cover-photos'  && <SettingsCoverPhotos/>}
        {section === 'workflow'      && <SettingsWorkflow/>}
        {section === 'ai'            && <SettingsAI/>}
        {section === 'integrations'  && <SettingsIntegrations/>}
        {section !== 'account' && section !== 'appearance' && section !== 'general' && section !== 'cover-photos' && section !== 'workflow' && section !== 'ai' && section !== 'integrations' && (
          <div>
            <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>
              {{ members: 'メンバー', billing: '請求' }[section] ?? section}
            </h1>
            <p style={{ color: 'var(--text-3)', fontSize: 13 }}>このセクションの設定は準備中です。</p>
          </div>
        )}
      </div>
    </div>
  )
}
