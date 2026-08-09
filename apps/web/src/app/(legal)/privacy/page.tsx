// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from 'next'
import { LegalPage } from '../_components/legal-page'

export const metadata: Metadata = {
  title: 'プライバシーポリシー | Cairn',
  description: 'Cairnにおける利用者情報の取得、利用、保管および削除について説明します。',
}

const sections = [
  {
    id: 'scope',
    title: '適用範囲',
    content: (
      <>
        <p>
          本プライバシーポリシーは、Cairn
          Project（以下「運営者」）が提供するクラウド版Cairn、iOS・Androidアプリおよび関連するサポート（以下「本サービス」）に適用されます。
        </p>
        <p>
          自ら設置・運用するセルフホスト版については、その設置者が利用者情報の取扱い主体となります。
        </p>
      </>
    ),
  },
  {
    id: 'data',
    title: '取得する情報',
    content: (
      <>
        <p>本サービスでは、機能の提供に必要な範囲で次の情報を取得します。</p>
        <ul>
          <li>
            <strong>アカウント情報:</strong> メールアドレス、表示名、プロフィール画像、認証識別子
          </li>
          <li>
            <strong>利用者コンテンツ:</strong>{' '}
            ワークスペース、プロジェクト、タスク、メッセージ、リアクション、ファイル、画像、カレンダー情報
          </li>
          <li>
            <strong>連携サービス情報:</strong>{' '}
            利用者が明示的に連携したGoogleアカウントの識別情報、カレンダーと予定の情報
          </li>
          <li>
            <strong>決済関連情報:</strong>{' '}
            購入・購読の状態、取引識別子。カード番号などの決済情報は決済事業者が直接取り扱います
          </li>
          <li>
            <strong>端末・利用状況:</strong>{' '}
            Push通知トークン、アプリのバージョン、端末・ブラウザ情報、IPアドレス、操作イベント、障害・診断ログ
          </li>
          <li>
            <strong>お問い合わせ情報:</strong> お問い合わせ内容と、回答に必要な連絡先
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'purpose',
    title: '利用目的',
    content: (
      <ul>
        <li>本人確認、認証、ワークスペースおよび共同作業機能の提供</li>
        <li>メッセージ、タスク、ファイル、カレンダーおよび通知の同期</li>
        <li>利用者が有効にしたAI機能による要約、検索、提案などの提供</li>
        <li>購入・購読の処理、不正利用の防止、セキュリティの維持</li>
        <li>障害調査、品質改善、利用状況の分析およびサポート対応</li>
        <li>法令、規約および権利侵害への対応</li>
      </ul>
    ),
  },
  {
    id: 'permissions',
    title: '端末権限',
    content: (
      <>
        <p>本アプリは、利用者の操作に応じて次の端末権限を利用します。</p>
        <ul>
          <li>
            <strong>写真:</strong> チャットやギャラリーに添付する画像を選択するため
          </li>
          <li>
            <strong>通知:</strong> メンション、タスク更新などをPush通知で届けるため
          </li>
        </ul>
        <p>
          権限を許可しない場合も、該当機能を除く本サービスの利用を継続できます。権限は端末の設定からいつでも変更できます。
        </p>
      </>
    ),
  },
  {
    id: 'providers',
    title: '外部サービスへの取扱いの委託・送信',
    content: (
      <>
        <p>
          運営者は、目的の達成に必要な範囲で、次の種類の事業者に情報の処理を委託または送信します。
        </p>
        <ul>
          <li>Supabase（認証、データベース、リアルタイム同期、ファイル保管）</li>
          <li>Vercel（WebアプリおよびAPIの配信）</li>
          <li>ExpoおよびApple・Google（アプリ配信、更新、Push通知）</li>
          <li>OpenAI（利用者がAI機能を有効にした場合の入力処理）</li>
          <li>PostHog（本番環境における利用状況の分析）</li>
          <li>Stripe（購入、購読および請求の処理）</li>
          <li>Google（ログインおよび利用者が選択したカレンダー連携）</li>
          <li>Inngest（通知やインデックス作成などの非同期処理）</li>
        </ul>
        <p>
          これらの事業者には、契約、設定およびアクセス制御を通じて、本ポリシーと同等の保護を求めます。処理先が国外となる場合があります。
        </p>
      </>
    ),
  },
  {
    id: 'sharing',
    title: '第三者提供',
    content: (
      <p>
        運営者は、本人の同意がある場合、法令に基づく場合、人の生命・身体・財産の保護に必要な場合、または事業承継に伴う場合を除き、個人データを第三者へ販売または提供しません。前項の委託先は、運営者の指示に基づいて情報を処理します。
      </p>
    ),
  },
  {
    id: 'security',
    title: '安全管理',
    content: (
      <p>
        通信の暗号化、権限に基づくアクセス制御、認証情報の安全な保管、操作範囲の制限、ログによる調査など、利用者情報の漏えい、滅失または毀損を防ぐために合理的な安全管理措置を講じます。
      </p>
    ),
  },
  {
    id: 'retention',
    title: '保存期間と削除',
    content: (
      <>
        <p>
          利用者情報は、アカウントの存続中および本サービスの提供、法的義務、紛争対応、不正防止に必要な期間保持します。不要となった情報は、バックアップの更新期間を考慮しつつ削除または匿名化します。
        </p>
        <p>
          アカウントや関連データの削除、開示、訂正、利用停止を希望する場合は、下記のお問い合わせ窓口から申請できます。法令上または共同作業の履歴保全上必要な情報は、識別性を低減したうえで保持する場合があります。
        </p>
      </>
    ),
  },
  {
    id: 'choices',
    title: '利用者の選択',
    content: (
      <ul>
        <li>端末の設定から写真・通知の権限を変更できます</li>
        <li>設定画面からGoogleカレンダーや外部OAuth接続を解除できます</li>
        <li>ブラウザやアプリからサインアウトできます</li>
        <li>お問い合わせ窓口から、情報の開示、訂正、削除等を申請できます</li>
      </ul>
    ),
  },
  {
    id: 'changes',
    title: '本ポリシーの変更',
    content: (
      <p>
        機能、法令または情報の取扱いに重要な変更がある場合、本ページを更新し、必要に応じて本サービス内で通知します。変更後の内容は、本ページに掲載した時点から適用されます。
      </p>
    ),
  },
  {
    id: 'contact',
    title: 'お問い合わせ',
    content: (
      <p>
        運営者: Cairn Project
        <br />
        サポート窓口:{' '}
        <a href="https://github.com/keishingu/Cairn/issues" target="_blank" rel="noreferrer">
          GitHub Issues
        </a>
        <br />
        個人情報を含むお問い合わせは、公開Issueに記載せず、
        <a href="https://moru.tech/#consultation" target="_blank" rel="noreferrer">
          非公開のお問い合わせフォーム
        </a>
        を利用してください。
      </p>
    ),
  },
]

export default function PrivacyPage() {
  return (
    <LegalPage
      title="プライバシーポリシー"
      description="Cairnがどのような情報を、何のために取り扱うのかを説明します。"
      updatedAt="2026年8月9日"
      sections={sections}
    />
  )
}
