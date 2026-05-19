# 外部連携方針

---

## 1. 基本方針

顧客が現在使っているツールを極力変えずに、プロジェクト推進を滑らかにする。

本プロダクトはSlack / Teams / Google Calendar / Outlookを置き換えるのではなく、それらをつなぐ業務実行基盤として提供する。

---

## 2. チャット連携

### 方針

自前チャットを正としつつ、Slack / Teams連携を提供する。

### 理由

自前チャットは以下のために必要。

- プロジェクトに紐づく会話
- AIのRAG対象
- HTMLレンダリング
- ステータス変更との連動
- ファイル・ギャラリーとの連動
- 監査ログ

### 段階

#### Phase 1

- 自前チャット

#### Phase 2

- Slack通知
- Teams通知

#### Phase 3

- 双方向同期

---

## 3. カレンダー連携

### 方針

内部DBを正とし、Google Calendar / Outlook Calendarへ同期する。

```txt
Project.start_date / Project.end_date
      ↓
Google Calendar / Outlook Calendar
```

### 段階

#### Phase 1

- ICS出力
- Google Calendar一方向同期

#### Phase 2

- Outlook Calendar連携

#### Phase 3

- 双方向同期

---

## 4. 連携対象

### Slack

- 新規メッセージ通知
- メンション通知
- ステータス変更通知
- AI処理完了通知
- ギャラリー追加通知

### Microsoft Teams

- 新規メッセージ通知
- メンション通知
- ステータス変更通知
- AI処理完了通知

### Google Calendar

- プロジェクト予定同期
- 日程変更同期
- 参加者予定反映

### Outlook Calendar

- プロジェクト予定同期
- 日程変更同期
- 参加者予定反映

---

## 5. UI設計

### Communication Mode

- Internal Chat Only
- Internal Chat + Slack Notifications
- Internal Chat + Teams Notifications
- Slack as Primary
- Teams as Primary

### Calendar Sync Mode

- No Sync
- App to Calendar
- Bidirectional Sync（将来）

---

## 6. 顧客向けメッセージ

SlackやTeams、Google CalendarやOutlookをそのまま活かしながら、業務の流れを整理し、AIとともにプロジェクトを前に進める。
