import {
  Trash2, ShieldCheck, Rocket, Zap, Layers, History, Cookie, EyeOff, Activity, Radar, RefreshCw, Power, MemoryStick,
  Network, LifeBuoy, FileCheck2, Search, FolderX, PackageCheck, Orbit, MousePointerClick, Undo2, FolderSearch, Filter,
  CalendarClock, Fingerprint, Wand2, type LucideIcon,
} from 'lucide-react';
import type { ModuleId } from './modules';

export interface HelpEntry {
  tagline: string;
  lead: string;
  features: { icon: LucideIcon; title: string; text: string }[];
  tips?: string[];
}

export const HELP: Record<ModuleId, HelpEntry> = {
  smart: {
    tagline: 'クリーンアップ・保護・スピードをまとめて点検します',
    lead: '不要なファイルの削除、セキュリティの確認、動作速度の改善をまとめて行います。結果を確認してから実行できます。',
    features: [
      { icon: Trash2, title: 'クリーンアップ', text: 'システムジャンクを見つけて容量を確保' },
      { icon: ShieldCheck, title: '保護', text: 'Microsoft Defender の保護状態をチェック' },
      { icon: Rocket, title: 'スピード', text: 'メモリ解放と DNS キャッシュの更新' },
    ],
    tips: ['結果画面の「詳細を確認」から各機能に移動して、項目を細かく選べます。'],
  },
  junk: {
    tagline: 'キャッシュ、ログ、一時ファイルなどの不要なデータを削除します',
    lead: '一時ファイル、キャッシュ、ログ、更新プログラムの残骸など、Windows に溜まった不要なデータを見つけてディスク容量を取り戻します。',
    features: [
      { icon: Zap, title: 'パフォーマンスの向上', text: '不要なキャッシュを削除して動作を軽快に' },
      { icon: Layers, title: '10 種類以上のジャンク', text: 'ブラウザ・GPU・アプリ・Windows Update まで' },
      { icon: ShieldCheck, title: '安全な削除', text: '使用中・作成直後のファイルには触れません' },
    ],
    tips: [
      '各カテゴリを開くと、ファイルごとに削除対象から外せます。',
      '一時ファイルの保持期間や除外フォルダは「設定」で変更できます。',
      '「管理者」マークの項目は、管理者として実行すると完全に削除できます。',
    ],
  },
  privacy: {
    tagline: 'ブラウザの閲覧履歴や Windows の操作履歴を削除します',
    lead: 'ブラウザの閲覧履歴や Cookie、Windows の最近使ったファイルなど、プライバシーに関わる記録を削除します。',
    features: [
      { icon: History, title: '閲覧履歴', text: 'Chrome・Edge・Firefox・Brave などに対応' },
      { icon: Cookie, title: 'Cookie とセッション', text: '追跡データを残さず消去' },
      { icon: EyeOff, title: 'Windows の操作履歴', text: '最近使ったファイル・実行履歴・クリップボード' },
    ],
    tips: ['保存されたパスワードとブックマークは削除されません。', 'ブラウザを終了してからスキャンしてください。', 'Cookie を削除すると各サイトで再ログインが必要になります。'],
  },
  protection: {
    tagline: 'Microsoft Defender で PC の安全性を確認します',
    lead: 'Windows 標準のウイルス対策エンジンと連携して、保護状態の確認やスキャンを行います。',
    features: [
      { icon: Activity, title: '保護状態', text: 'リアルタイム保護と定義の鮮度をチェック' },
      { icon: Radar, title: 'スキャン', text: 'クイック / フルスキャンを実行' },
      { icon: RefreshCw, title: '定義の更新', text: '最新の脅威に対応' },
    ],
    tips: ['別のウイルス対策ソフトを使っている場合、Defender の情報は取得できません。'],
  },
  optimize: {
    tagline: 'スタートアップ項目とメモリの使用状況を管理します',
    lead: 'Windows の起動時に自動で実行されるアプリを管理し、メモリを解放します。',
    features: [
      { icon: Power, title: 'スタートアップ管理', text: 'タスクマネージャーと同じ仕組みで有効/無効を切替' },
      { icon: MemoryStick, title: 'メモリ解放', text: '各プロセスの未使用メモリを整理' },
    ],
    tips: ['無効にしたアプリは削除されず、いつでも元に戻せます。', '「すべてのユーザー」の項目の変更には管理者権限が必要です。'],
  },
  maintenance: {
    tagline: 'Windows の動作を整えるメンテナンスを実行します',
    lead: 'Windows を快適に保つためのメンテナンスタスクを実行します。',
    features: [
      { icon: Network, title: 'ネットワーク', text: 'DNS キャッシュを消去して接続トラブルを解消' },
      { icon: LifeBuoy, title: '復元ポイント', text: '大きな変更の前にシステムの状態を保存' },
      { icon: FileCheck2, title: 'システム修復', text: 'sfc / DISM / chkdsk で破損をチェック' },
    ],
    tips: ['「管理者」タスクは UAC の確認後、別ウィンドウで実行されます。', '各カードの ⓘ にカーソルを合わせると詳細が表示されます。'],
  },
  uninstaller: {
    tagline: 'アプリを削除し、残ったファイルも整理します',
    lead: 'インストール済みのアプリを一覧で管理し、アンインストール後に残ったフォルダも検出します。',
    features: [
      { icon: Search, title: '検索と並べ替え', text: 'サイズやインストール日で整理' },
      { icon: FolderX, title: '残りファイルの検出', text: 'AppData などに残ったフォルダを削除' },
    ],
    tips: ['アプリ付属のアンインストーラが起動します。画面の指示に従って操作してください。'],
  },
  updater: {
    tagline: 'インストール済みのアプリを最新の状態にします',
    lead: 'Windows パッケージマネージャー (winget) を使って、アプリを一括でサイレント更新します。',
    features: [{ icon: PackageCheck, title: '一括アップデート', text: '選択したアプリを順番に更新' }],
    tips: ['winget が無い場合は Microsoft Store から「アプリ インストーラー」を入手してください。'],
  },
  space: {
    tagline: 'フォルダごとの使用容量を図で確認します',
    lead: 'ドライブ全体のサイズマップを作成し、何が容量を使っているのかを直感的に把握できます。',
    features: [
      { icon: Orbit, title: 'サイズマップ', text: '大きいフォルダほど大きく表示' },
      { icon: MousePointerClick, title: 'ドリルダウン', text: 'クリックでフォルダの中へ、Ctrl+クリックで選択' },
      { icon: Undo2, title: 'ごみ箱へ移動', text: '選んだ項目は元に戻せます' },
    ],
    tips: ['Windows やProgram Files 内のフォルダを削除するとアプリが動作しなくなることがあります。'],
  },
  large: {
    tagline: 'サイズの大きいファイルや、長く使っていないファイルを探します',
    lead: '長い間開いていない動画やインストーラ、古いバックアップなど、ディスクを圧迫しているファイルをまとめて確認できます。',
    features: [
      { icon: FolderSearch, title: 'ユーザーフォルダ全体を検索', text: 'デスクトップ・ダウンロード・ドキュメントなど' },
      { icon: Filter, title: '種類とサイズで絞り込み', text: '動画・アーカイブ・ディスクイメージを一目で' },
      { icon: CalendarClock, title: '最終使用日でチェック', text: '1 年以上触れていないファイルを発見' },
    ],
    tips: ['検索場所はスキャンボタン下のボタンから追加できます。'],
  },
  duplicates: {
    tagline: '内容が同じファイルを見つけて整理します',
    lead: '写真、ドキュメント、ダウンロードしたファイルの重複を、ファイル名ではなく内容で正確に判定します。',
    features: [
      { icon: Fingerprint, title: '内容ベースの比較', text: 'ハッシュが完全一致したファイルのみ' },
      { icon: Wand2, title: 'スマート選択', text: '最も古いファイルを残してコピーを自動選択' },
      { icon: ShieldCheck, title: 'ごみ箱へ安全に移動', text: '間違えても元に戻せます' },
    ],
  },
};
