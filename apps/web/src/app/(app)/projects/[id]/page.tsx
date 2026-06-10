// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { redirect } from 'next/navigation'

// /projects/{id} は ?open=project-{id} クエリパラメータ形式へリダイレクトする。
// シェルがクエリパラメータを読み取り Detail Panel を描画するため、
// プロジェクト一覧ページはアンマウントされず再フェッチが発生しない。
export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/projects?open=project-${id}`)
}
