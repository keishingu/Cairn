// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ProjectDetailPage({ params }: Props) {
  const { id } = await params
  // TODO: open detail panel for this project
  // For now, redirect to the projects list
  redirect(`/projects?open=${id}`)
}
