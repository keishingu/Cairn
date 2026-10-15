'use client'

import React from 'react'
import type { ProjectDto } from '@/app/api/projects/route'
import type { ProjectRoleDto } from '@/app/api/projects/roles/route'
import { formatAppDate } from '@cairn/shared'
import { Avatar } from '../primitives'
import { useLocale, useT } from '@/components/locale-provider'

interface ProjectRoleMatrixProps {
  projects: ProjectDto[]
  roles: ProjectRoleDto[]
  isMobile?: boolean
  onOpenMembers: (project: ProjectDto) => void
}

function formatSchedule(start: string | null, end: string | null, locale: ReturnType<typeof useLocale>['locale']): string {
  if (!start) return '—'
  const fmt = (date: string) => formatAppDate(locale, `${date}T00:00:00`)
  return end && end !== start ? `${fmt(start)}–${fmt(end)}` : fmt(start)
}

export function ProjectRoleMatrix({ projects, roles, isMobile, onOpenMembers }: ProjectRoleMatrixProps) {
  const t = useT()
  const { locale } = useLocale()
  const [unassignedRoleId, setUnassignedRoleId] = React.useState('')
  if (projects.some(project => !Array.isArray(project.roleAssignments))) {
    return <div role="alert" style={{ padding: 24, textAlign: 'center', color: 'var(--red-text)', fontSize: 13 }}>{t('Could not load project role assignments. Please reload.')}</div>
  }
  const visibleProjects = unassignedRoleId
    ? projects.filter(project => !project.roleAssignments!.some(role => role.roleId === unassignedRoleId))
    : projects

  const renderAssignees = (project: ProjectDto, role: ProjectRoleDto) => {
    const assignment = project.roleAssignments!.find(item => item.roleId === role.id)
    const label = assignment?.memberNames.join(', ') || t('Unassigned')
    return (
      <button
        type="button"
        aria-label={t('{project}: {role} — {assignees}', {
          project: project.title,
          role: role.name,
          assignees: label,
        })}
        onClick={() => onOpenMembers(project)}
        className="hover-bg"
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          padding: '4px 6px', border: 0, borderRadius: 6, background: 'transparent',
          minHeight: 44,
          color: assignment ? 'var(--text-2)' : 'var(--text-4)', textAlign: 'left',
          fontFamily: 'inherit', fontSize: 12, cursor: 'pointer',
        }}
      >
        {assignment ? (
          <>
            <span style={{ display: 'flex', flexShrink: 0 }}>
              {assignment.memberNames.slice(0, 3).map((name, index) => (
                <span key={`${name}-${index}`} style={{ marginLeft: index ? -5 : 0 }}>
                  <Avatar name={name} url={assignment.memberAvatarUrls[index] ?? null} size={20}/>
                </span>
              ))}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
          </>
        ) : label}
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: 8, color: 'var(--text-3)', fontSize: 12 }}>
        <span>{t('Show projects missing role')}</span>
        <select
          aria-label={t('Show projects missing role')}
          className="form-control"
          value={unassignedRoleId}
          onChange={event => setUnassignedRoleId(event.target.value)}
          style={{ minWidth: isMobile ? undefined : 220, maxWidth: isMobile ? undefined : 300, minHeight: isMobile ? 44 : undefined }}
        >
          <option value="">{t('All projects')}</option>
          {roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
        </select>
      </label>

      {visibleProjects.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
          {t('No projects found')}
        </div>
      ) : isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visibleProjects.map(project => (
            <section key={project.id} className="card" aria-label={project.title} style={{ padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                <button type="button" onClick={() => onOpenMembers(project)} style={{ minWidth: 0, minHeight: 44, padding: 0, border: 0, background: 'none', color: 'var(--text)', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, textAlign: 'left', cursor: 'pointer' }}>
                  {project.title}
                </button>
                <span style={{ flexShrink: 0, color: 'var(--text-3)', fontSize: 12 }}>{formatSchedule(project.startDate, project.endDate, locale)}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {roles.map(role => (
                  <div key={role.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(82px, 34%) minmax(0, 1fr)', alignItems: 'center', borderTop: '1px solid var(--divider)' }}>
                    <span style={{ paddingLeft: 4, color: role.color, fontSize: 11.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{role.name}</span>
                    {renderAssignees(project, role)}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: Math.max(560, 260 + roles.length * 180), borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-3)', fontSize: 11, textAlign: 'left' }}>
                <th scope="col" style={{ width: 220, padding: '10px 12px' }}>{t('Projects')}</th>
                <th scope="col" style={{ width: 100, padding: '10px 8px' }}>{t('Schedule')}</th>
                {roles.map(role => <th key={role.id} scope="col" style={{ padding: '10px 8px', color: role.color, fontWeight: 700 }}>{role.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {visibleProjects.map((project, index) => (
                <tr key={project.id} style={{ borderBottom: index < visibleProjects.length - 1 ? '1px solid var(--divider)' : undefined }}>
                  <th scope="row" style={{ padding: '6px 8px', textAlign: 'left' }}>
                    <button type="button" onClick={() => onOpenMembers(project)} className="hover-text" style={{ padding: '6px 4px', border: 0, background: 'none', color: 'var(--text)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, textAlign: 'left', cursor: 'pointer' }}>{project.title}</button>
                  </th>
                  <td style={{ padding: '6px 8px', color: 'var(--text-3)', fontSize: 12 }}>{formatSchedule(project.startDate, project.endDate, locale)}</td>
                  {roles.map(role => <td key={role.id} style={{ padding: '4px 6px' }}>{renderAssignees(project, role)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
