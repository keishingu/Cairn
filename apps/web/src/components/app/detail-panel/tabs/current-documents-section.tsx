'use client'

import React from 'react'
import { Icon } from '../../primitives'
import { InlineError } from '../../inline-error'
import { useProjectFiles } from '@/hooks/use-project-files'
import { useT } from '@/components/locale-provider'

export function CurrentDocumentsSection({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const t = useT()
  const { data: files, isLoading, isError, replaceLatestMutation } = useProjectFiles(projectId)
  const [formOpen, setFormOpen] = React.useState(false)
  const [replaceTargetId, setReplaceTargetId] = React.useState<string | null>(null)
  const [selectedFileId, setSelectedFileId] = React.useState('')
  const [note, setNote] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const formId = React.useId()
  const currentFiles = isError ? [] : (files ?? []).filter(file => file.isLatest)
  const candidates = isError ? [] : (files ?? []).filter(file => !file.isLatest)
  const replaceTarget = currentFiles.find(file => file.id === replaceTargetId) ?? null
  const isReplacement = replaceTargetId !== null
  const targetUnavailable = isReplacement && replaceTarget === null
  const selectedFileUnavailable = selectedFileId !== '' && !candidates.some(file => file.id === selectedFileId)

  const openForm = (targetId: string | null) => {
    setFormOpen(true)
    setReplaceTargetId(targetId)
    setSelectedFileId(candidates[0]?.id ?? '')
    setNote('')
    setError(null)
  }
  const closeForm = () => {
    setFormOpen(false)
    setReplaceTargetId(null)
    setSelectedFileId('')
    setNote('')
    setError(null)
  }
  const handleSave = async () => {
    if (isLoading || isError || !selectedFileId || targetUnavailable || selectedFileUnavailable || (isReplacement && !note.trim())) return
    setError(null)
    try {
      await replaceLatestMutation.mutateAsync({
        fileId: selectedFileId,
        ...(isReplacement ? { replaceFileId: replaceTargetId!, note: note.trim() } : {}),
      })
      closeForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Could not update current documents'))
    }
  }

  return (
    <section aria-labelledby={`${formId}-heading`} style={{ padding: 14, borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <div>
          <h3 id={`${formId}-heading`} style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{t('Current documents')}</h3>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{t('Files marked as latest are shown here for quick reference.')}</div>
        </div>
        {canEdit && currentFiles.length > 0 && candidates.length > 0 && !formOpen && !isLoading && !isError && (
          <button type="button" className="btn btn-sm" disabled={replaceLatestMutation.isPending} onClick={() => openForm(null)}>
            <Icon name="plus" size={12} />{t('Add a current document')}
          </button>
        )}
      </div>

      {isLoading ? <div style={{ color: 'var(--text-4)', fontSize: 12, padding: '8px 0' }}>{t('Loading…')}</div> : null}
      {isError ? <InlineError>{t('Could not load files')}</InlineError> : null}
      {!isLoading && !isError && currentFiles.length === 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 0', color: 'var(--text-3)', fontSize: 12 }}>
          <span>{t('No current documents have been selected.')}</span>
          {canEdit && candidates.length > 0 && !formOpen && !isError && (
            <button type="button" className="btn btn-sm" disabled={replaceLatestMutation.isPending} onClick={() => openForm(null)}>{t('Choose a file')}</button>
          )}
        </div>
      )}

      {!isLoading && !isError && currentFiles.map(file => {
        const href = file.fileType === 'link' ? file.externalUrl : `/api/attachments/${file.id}`
        return (
          <div key={file.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0', borderTop: '1px solid var(--divider)' }}>
            <Icon name="file" size={16} color="var(--accent-text)" />
            <div style={{ flex: 1, minWidth: 0 }}>
              {href
                ? <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text)', fontSize: 12.5, fontWeight: 600, textDecoration: 'none', overflowWrap: 'anywhere' }}>{file.fileName}</a>
                : <span style={{ color: 'var(--text)', fontSize: 12.5, fontWeight: 600 }}>{file.fileName}</span>}
              {file.latestChangeNote && <div style={{ marginTop: 3, color: 'var(--text-3)', fontSize: 11.5, lineHeight: 1.5 }}>{t('Change note')}: {file.latestChangeNote}</div>}
            </div>
            {canEdit && candidates.length > 0 && !formOpen && (
              <button type="button" className="btn btn-sm" disabled={isError || replaceLatestMutation.isPending} onClick={() => openForm(file.id)}>{t('Replace')}</button>
            )}
          </div>
        )
      })}

      {canEdit && formOpen ? (
        <div style={{ borderTop: '1px solid var(--divider)', paddingTop: 10, marginTop: 4, display: 'grid', gap: 8 }}>
          {targetUnavailable
            ? <InlineError>{t('The current document changed. Close this form and choose it again.')}</InlineError>
            : replaceTarget && <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{t('Replacing: {name}', { name: replaceTarget.fileName })}</div>}
          {selectedFileUnavailable && <InlineError>{t('The selected file is no longer available. Choose another file.')}</InlineError>}
          <label htmlFor={`${formId}-file`} style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-2)' }}>{t('Existing project file')}</label>
          <select id={`${formId}-file`} className="form-control" value={selectedFileId} disabled={isLoading || isError || replaceLatestMutation.isPending} onChange={e => setSelectedFileId(e.target.value)}>
            <option value="">{t('Choose a file')}</option>
            {candidates.map(file => <option key={file.id} value={file.id}>{file.fileName}</option>)}
          </select>
          {isReplacement && <>
            <label htmlFor={`${formId}-note`} style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-2)' }}>{t('Change note')}</label>
            <textarea id={`${formId}-note`} className="form-control" rows={3} maxLength={2000} value={note} disabled={replaceLatestMutation.isPending} onChange={e => setNote(e.target.value)} placeholder={t('Explain what changed in this replacement…')} style={{ height: 'auto', minHeight: 78, resize: 'vertical' }} />
          </>}
          {error && <InlineError>{error}</InlineError>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn btn-sm" onClick={closeForm} disabled={replaceLatestMutation.isPending}>{t('Cancel')}</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void handleSave()} disabled={isLoading || isError || !selectedFileId || targetUnavailable || selectedFileUnavailable || Boolean(isReplacement && !note.trim()) || replaceLatestMutation.isPending}>
              {replaceLatestMutation.isPending ? t('Saving…') : t('Save')}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
