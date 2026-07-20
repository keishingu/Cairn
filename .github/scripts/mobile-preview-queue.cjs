function startedAt(run) {
  const value = run.run_started_at ?? run.created_at
  const timestamp = value ? Date.parse(value) : Number.NaN
  return Number.isNaN(timestamp) ? 0 : timestamp
}

function findEarlierActiveRuns(runs, currentRunId) {
  const activeRuns = runs
    .filter((run) => run.event === 'pull_request' && run.status !== 'completed')
    .sort((left, right) => startedAt(left) - startedAt(right) || left.id - right.id)
  const currentIndex = activeRuns.findIndex((run) => String(run.id) === String(currentRunId))

  if (currentIndex === -1) {
    throw new Error(`Current workflow run ${currentRunId} is not visible in the Actions API yet`)
  }

  return activeRuns.slice(0, currentIndex)
}

module.exports = { findEarlierActiveRuns }
