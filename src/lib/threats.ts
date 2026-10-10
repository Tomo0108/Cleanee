/**
 * Explains Microsoft Defender detections in plain Japanese.
 *
 * Defender names follow "Type:Platform/Family.Variant!Suffix" (e.g. Trojan:Win32/Wacatac.B!ml),
 * so most of the "why is this a threat" answer can be read straight from the name. The numeric
 * IDs come from the MSFT_MpThreat / MSFT_MpThreatDetection WMI classes.
 */

export interface ThreatType { label: string; what: string; risk: string }

const TYPES: Record<string, ThreatType> = {
  trojan: { label: 'トロイの木馬', what: '正規のソフトやファイルを装って侵入し、裏で不正な処理を行うプログラムです。', risk: '情報の盗み出し、別のマルウェアのダウンロード、遠隔操作の入口などに使われます。' },
  trojandownloader: { label: 'ダウンローダー型トロイの木馬', what: 'インターネットから別のマルウェアをダウンロードして実行するプログラムです。', risk: 'それ自体は小さくても、ランサムウェアや情報窃取型マルウェアを呼び込む入口になります。' },
  trojandropper: { label: 'ドロッパー型トロイの木馬', what: '内部に隠し持った別のマルウェアを PC に展開・設置するプログラムです。', risk: '実行されると、複数のマルウェアが一度にインストールされるおそれがあります。' },
  trojanspy: { label: 'スパイ型トロイの木馬', what: '利用者に気付かれないように操作内容や情報を収集するプログラムです。', risk: 'パスワード、閲覧履歴、入力内容などが外部に送信されるおそれがあります。' },
  trojanproxy: { label: 'プロキシ型トロイの木馬', what: 'PC を攻撃者の通信の中継点として使うプログラムです。', risk: 'あなたの PC が他者への攻撃や不正アクセスの踏み台にされるおそれがあります。' },
  trojanclicker: { label: 'クリッカー型トロイの木馬', what: '広告などを自動でクリックして不正に収益を得るプログラムです。', risk: '通信量や動作の重さに加え、不審なサイトへの接続が発生します。' },
  backdoor: { label: 'バックドア', what: '攻撃者が PC に自由に出入りできる「裏口」を作るプログラムです。', risk: '遠隔操作、ファイルの盗難、追加のマルウェア設置など、ほぼ何でもできる状態になります。' },
  ransom: { label: 'ランサムウェア', what: 'ファイルを暗号化して使えなくし、元に戻す代わりに身代金を要求するプログラムです。', risk: '写真や書類などが失われるおそれがあります。最も深刻な種類の一つです。' },
  worm: { label: 'ワーム', what: 'ネットワークや USB メモリなどを通じて自分自身を複製し、広がっていくプログラムです。', risk: '同じネットワーク上の他の PC にも感染を広げるおそれがあります。' },
  virus: { label: 'ウイルス', what: '他のファイルに自分自身を埋め込んで感染を広げるプログラムです。', risk: '感染したファイルを開くたびに被害が広がり、ファイルが壊れることもあります。' },
  pws: { label: 'パスワード窃取', what: 'ブラウザなどに保存されたパスワードやログイン情報を盗むプログラムです。', risk: 'メール、SNS、ネットバンキングなどのアカウントを乗っ取られるおそれがあります。' },
  passwordstealer: { label: 'パスワード窃取', what: 'ブラウザなどに保存されたパスワードやログイン情報を盗むプログラムです。', risk: 'メール、SNS、ネットバンキングなどのアカウントを乗っ取られるおそれがあります。' },
  spyware: { label: 'スパイウェア', what: '利用者の行動や個人情報を無断で収集・送信するプログラムです。', risk: 'プライバシーの侵害や、収集された情報の悪用につながります。' },
  exploit: { label: 'エクスプロイト', what: 'ソフトウェアの脆弱性（セキュリティ上の欠陥）を悪用する攻撃コードです。', risk: '開いただけでマルウェアに感染させられるおそれがあります。OS やアプリの更新が重要です。' },
  hacktool: { label: 'ハッキングツール', what: '不正アクセスやライセンス回避などに使われるツールです。', risk: '攻撃者が持ち込んだ可能性があり、他のマルウェアと一緒に使われることがあります。' },
  virtool: { label: 'マルウェア作成・隠蔽ツール', what: 'マルウェアを作成したり、検出を逃れるために使われるツールです。', risk: '攻撃の準備段階で使われるもので、他の脅威が潜んでいる可能性があります。' },
  pua: { label: '望ましくない可能性のあるアプリ（PUA）', what: '厳密にはマルウェアではないものの、広告の表示、不要なソフトの同梱、設定の変更など、利用者が望まない動作をするアプリです。', risk: '動作が重くなる、広告が増える、別の不要なソフトが入るといった影響があります。心当たりがあり信頼できるアプリなら許可することもできます。' },
  adware: { label: 'アドウェア', what: '広告を強制的に表示して収益を得るプログラムです。', risk: '広告の表示や不審なサイトへの誘導により、さらに危険なソフトを入れられるおそれがあります。' },
  browsermodifier: { label: 'ブラウザ改変', what: 'ホームページや検索エンジンなど、ブラウザの設定を無断で書き換えるプログラムです。', risk: '検索結果や閲覧先が操作され、詐欺サイトに誘導されるおそれがあります。' },
  softwarebundler: { label: 'ソフトウェアバンドラー', what: 'インストール時に、望まない別のソフトを一緒に入れるプログラムです。', risk: '気付かないうちにアドウェアなどが追加されます。' },
  settingsmodifier: { label: '設定改変', what: 'OS やアプリの設定を無断で変更するプログラムです。', risk: 'セキュリティ設定が弱められることがあります。' },
  misleading: { label: '誤解を招くソフト', what: '実在しない問題を誇張して表示し、有料版の購入などを促すプログラムです。', risk: '不要な支払いや、さらなるソフトのインストールにつながります。' },
  rogue: { label: '偽セキュリティソフト', what: 'セキュリティソフトを装い、偽の警告で金銭をだまし取るプログラムです。', risk: '支払い情報の詐取や、本物の保護の無効化につながります。' },
  program: { label: '望ましくないプログラム', what: '利用者の判断次第で不要と考えられる動作をするプログラムです。', risk: '入れた覚えがなければ削除をおすすめします。' },
  monitoringtool: { label: '監視ツール', what: 'キー入力や画面などを記録・監視するツールです。', risk: '本人の知らないうちに入れられた場合、情報が他人に見られている可能性があります。' },
  remoteaccess: { label: 'リモートアクセスツール', what: 'PC を離れた場所から操作できるツールです。', risk: '本人が入れたものでなければ、他人に PC を操作されている可能性があります。' },
  tool: { label: 'ツール', what: '悪用される可能性のあるユーティリティです。', risk: '自分で入れた覚えがなければ注意が必要です。' },
  behavior: { label: '不審な動作', what: '特定のファイルではなく、プログラムの「振る舞い」が攻撃の特徴と一致したことを示します。', risk: '実行中のプロセスが不審な動作をした可能性があります。フルスキャンをおすすめします。' },
  phish: { label: 'フィッシング', what: '本物のサイトやメールを装い、パスワードやカード情報を入力させようとするものです。', risk: '入力した情報がそのまま盗まれます。' },
  dialer: { label: 'ダイヤラー', what: '有料の回線へ勝手に接続するプログラムです。', risk: '高額な料金を請求されるおそれがあります。' },
  joke: { label: 'ジョークプログラム', what: 'いたずら目的で利用者を驚かせるプログラムです。', risk: '直接の被害は小さいですが、不要であれば削除してください。' },
  ddos: { label: 'DDoS 攻撃ツール', what: '他のサーバーへ大量の通信を送りつける攻撃に使われるプログラムです。', risk: 'PC が攻撃の加担者にされるおそれがあります。' },
  spammer: { label: 'スパム送信', what: '迷惑メールを大量に送信するプログラムです。', risk: 'PC やアカウントが迷惑メールの送信元として悪用されます。' },
  constructor: { label: 'マルウェア生成ツール', what: '新しいマルウェアを作るためのツールです。', risk: '攻撃の準備に使われるものです。' },
};

/** Fallback by MSFT_MpThreat.CategoryID when the name has no recognisable type. */
const CATEGORY: Record<number, [string, string]> = {
  1: ['アドウェア', 'adware'], 2: ['スパイウェア', 'spyware'], 3: ['パスワード窃取', 'pws'], 4: ['ダウンローダー', 'trojandownloader'],
  5: ['ワーム', 'worm'], 6: ['バックドア', 'backdoor'], 7: ['遠隔操作型トロイの木馬', 'backdoor'], 8: ['トロイの木馬', 'trojan'],
  10: ['キーロガー', 'monitoringtool'], 11: ['ダイヤラー', 'dialer'], 12: ['監視ソフト', 'monitoringtool'], 13: ['ブラウザ改変', 'browsermodifier'],
  18: ['セキュリティ無効化', 'trojan'], 19: ['ジョークプログラム', 'joke'], 21: ['ソフトウェアバンドラー', 'softwarebundler'],
  23: ['設定改変', 'settingsmodifier'], 25: ['リモート操作ソフト', 'remoteaccess'], 27: ['望ましくない可能性のあるアプリ', 'pua'],
  30: ['エクスプロイト', 'exploit'], 32: ['マルウェア作成ツール', 'constructor'], 34: ['ツール', 'tool'], 36: ['DoS 攻撃型トロイの木馬', 'ddos'],
  37: ['ドロッパー', 'trojandropper'], 39: ['監視型トロイの木馬', 'trojanspy'], 40: ['プロキシ型トロイの木馬', 'trojanproxy'],
  42: ['ウイルス', 'virus'], 46: ['不審な動作', 'behavior'], 49: ['望ましくないソフト', 'pua'], 50: ['ランサムウェア', 'ransom'],
};

const PLATFORMS: Record<string, string> = {
  win32: 'Windows 用の実行ファイル', win64: 'Windows（64 ビット）用の実行ファイル', msil: '.NET で作られた Windows プログラム',
  js: 'JavaScript', vbs: 'VBScript', powershell: 'PowerShell スクリプト', html: 'Web ページ（HTML）', o97m: 'Office 文書のマクロ',
  x97m: 'Excel のマクロ', w97m: 'Word のマクロ', script: 'スクリプト', python: 'Python スクリプト', bat: 'バッチファイル',
  pdf: 'PDF 文書', java: 'Java', androidos: 'Android アプリ', macos: 'macOS 用プログラム', linux: 'Linux 用プログラム',
  lnk: 'ショートカット（.lnk）', autoit: 'AutoIt スクリプト', nsis: 'インストーラー（NSIS）', swf: 'Flash', dos: 'DOS プログラム',
};

/** Suffixes documented in Microsoft's malware naming conventions, plus the common "!ml". */
const SUFFIXES: Record<string, string> = {
  ml: '機械学習（AI）による判定で検出されました。既知のマルウェアそのものではなく、特徴が似ていることによる検出のため、まれに誤検出の場合もあります。',
  gen: '特定の個体ではなく、同じ系統のマルウェアに共通する特徴（汎用シグネチャ）で検出されました。',
  dr: 'このファイルは別のマルウェアを展開する「ドロッパー」部分です。',
  ldr: 'このファイルは別のマルウェアを読み込む「ローダー」部分です。',
  dll: 'マルウェアを構成する DLL（部品）ファイルです。',
  pak: '圧縮・難読化（パック）されたマルウェアです。',
  dam: '壊れていて動作しない状態のマルウェアです。危険性は低めです。',
  remnants: 'マルウェア本体を削除した後に残った痕跡です。',
  kit: 'マルウェアを作成するためのキットの一部です。',
  plugin: 'マルウェアの機能を追加するプラグインです。',
  worm: 'ワームとして自己増殖する機能を持つ部分です。',
  sfx: '自己解凍形式の圧縮ファイルに含まれたマルウェアです。',
  lnk: 'ショートカット（.lnk）ファイルを悪用したものです。',
};

export const THREAT_STATUS: Record<number, [string, Tone]> = {
  0: ['不明', 'warn'], 1: ['検出（未対処）', 'danger'], 2: ['駆除済み', 'ok'], 3: ['隔離済み', 'ok'], 4: ['削除済み', 'ok'],
  5: ['許可済み', 'warn'], 6: ['ブロック済み', 'ok'], 102: ['隔離に失敗', 'danger'], 103: ['削除に失敗', 'danger'],
  104: ['許可に失敗', 'danger'], 105: ['対処が中断', 'danger'], 107: ['ブロックに失敗', 'danger'],
};

export const DETECTION_SOURCE: Record<number, string> = {
  1: '手動スキャン', 2: '定期スキャン（システム）', 3: 'リアルタイム保護', 4: 'ダウンロード・添付ファイルの検査',
  5: 'ネットワーク検査', 6: 'IE プロテクト', 7: '起動時の早期検査（ELAM）', 8: 'ローカル構成証明', 9: 'リモート構成証明',
};

export const CLEANING_ACTION: Record<number, string> = {
  1: '駆除', 2: '隔離', 3: '削除', 6: '許可', 8: 'ユーザー定義の処理', 9: '処理なし', 10: 'ブロック',
};

export const SEVERITY: Record<number, [string, string, 'ok' | 'warn' | 'danger' | '']> = {
  0: ['不明', '深刻度は判定されていません。', ''],
  1: ['低', '直接的な被害は小さいものの、不要な動作をする可能性があります。', ''],
  2: ['中', '放置するとプライバシーや PC の動作に影響する可能性があります。', 'warn'],
  4: ['高', 'PC やデータに深刻な被害を与えるおそれがあります。早めの対処が必要です。', 'danger'],
  5: ['深刻', '直ちに対処が必要です。PC の乗っ取りやデータの喪失につながるおそれがあります。', 'danger'],
};
// SeverityID 3 is unused by Defender but treat it like "high" if it ever appears.
SEVERITY[3] = SEVERITY[4];

export interface ParsedThreatName { type?: string; platform?: string; family?: string; variant?: string; suffix?: string }

export function parseThreatName(name: string): ParsedThreatName {
  const m = /^([^:]+):([^/]+)\/([^.!]+)(?:\.([^!]+))?(?:!(.+))?$/.exec(name.trim());
  if (!m) return {};
  const [, type, platform, family, variant, suffix] = m;
  return { type, platform, family, variant, suffix };
}

const typeKey = (t: string) => t.toLowerCase().replace(/[^a-z]/g, '');

/** The EICAR file is the industry-standard harmless test string every antivirus detects on purpose. */
const EICAR: ThreatType = {
  label: 'テストファイル（無害）',
  what: 'EICAR はウイルス対策ソフトが正しく動作しているかを確かめるための、業界標準のテストファイルです。実際のウイルスではなく、何の動作もしません。',
  risk: '被害はありません。動作確認のために自分で用意したものでなければ、どこから来たかだけ確認してください。',
};

export function explainThreat(name: string, category?: number) {
  const p = parseThreatName(name);
  let type = /^eicar/i.test(p.family || '') ? EICAR : p.type ? TYPES[typeKey(p.type)] : undefined;
  // Unknown type words (e.g. "TrojanNotifier") fall back to their prefix, then the category ID.
  if (!type && p.type) {
    const key = Object.keys(TYPES).sort((a, b) => b.length - a.length).find((k) => typeKey(p.type!).startsWith(k));
    if (key) type = TYPES[key];
  }
  if (!type && category && CATEGORY[category]) type = TYPES[CATEGORY[category][1]];
  const variantSuffix = p.variant?.split('.').map((v) => v.toLowerCase()).find((v) => SUFFIXES[v]);
  const suffixKey = p.suffix?.toLowerCase();
  return {
    parsed: p,
    type,
    categoryLabel: category && CATEGORY[category] ? CATEGORY[category][0] : undefined,
    platform: p.platform ? PLATFORMS[p.platform.toLowerCase()] || p.platform : undefined,
    suffixNote: (suffixKey && SUFFIXES[suffixKey]) || (variantSuffix && SUFFIXES[variantSuffix]) || undefined,
  };
}

/** Microsoft Security Intelligence encyclopedia entry for a detection name. */
export const encyclopediaUrl = (name: string) =>
  `https://www.microsoft.com/ja-jp/wdsi/threats/malware-encyclopedia-description?Name=${encodeURIComponent(name)}`;

/** "file:_C:\\path" → { kind: 'ファイル', path: 'C:\\path' } */
export function describeResource(r: string) {
  const m = /^(\w+):_(.*)$/.exec(r);
  if (!m) return { kind: '', path: r };
  const kinds: Record<string, string> = { file: 'ファイル', containerfile: 'アーカイブ内', process: 'プロセス', regkey: 'レジストリ', regkeyvalue: 'レジストリ値', behavior: '動作', webfile: 'ダウンロード', amsi: 'スクリプト', startup: 'スタートアップ', service: 'サービス' };
  return { kind: kinds[m[1].toLowerCase()] || m[1], path: m[2] };
}

/** 1–4 position on the severity meter (Defender uses IDs 1, 2, 4, 5). */
export const severityLevel = (id: number) => ({ 1: 1, 2: 2, 3: 3, 4: 3, 5: 4 } as Record<number, number>)[id] || 0;

export type Tone = 'ok' | 'warn' | 'danger';

/**
 * The one-line answer shown first: does the user need to do anything?
 * Statuses come from MSFT_MpThreatDetection.ThreatStatusID.
 */
export function verdict(status: number, harmless: boolean): { tone: Tone; title: string; body: string; needsAction: boolean } {
  if (harmless) return { tone: 'ok', title: '危険はありません', body: 'ウイルス対策ソフトの動作確認用ファイルです。自分で用意したものでなければ、入手元だけ確認してください。', needsAction: false };
  if (status === 5) return { tone: 'warn', title: '許可されています', body: 'この項目は実行が許可されています。信頼できるものでなければ、Windows セキュリティの「保護の履歴」で許可を取り消してください。', needsAction: false };
  if ([2, 3, 4, 6].includes(status)) return { tone: 'ok', title: '対処済み・操作は不要です', body: 'Microsoft Defender がすでに無害化しています。念のためフルスキャンを実行すると安心です。', needsAction: false };
  if (status >= 100) return { tone: 'danger', title: '対処に失敗しました', body: '自動での対処ができませんでした。「脅威を削除」を試し、解決しない場合は Windows セキュリティでオフラインスキャンを実行してください。', needsAction: true };
  return { tone: 'danger', title: '対処が必要です', body: '「脅威を削除」で駆除してください。その後フルスキャンを実行し、心当たりのないログインやパスワード変更がないか確認してください。', needsAction: true };
}

/** Name segments in display order, for the colour-coded breakdown. */
export function nameSegments(p: ParsedThreatName, x: ReturnType<typeof explainThreat>) {
  const segs: { key: string; text: string; sep: string; label: string; note: string }[] = [];
  if (p.type) segs.push({ key: 'type', text: p.type, sep: '', label: '種類', note: x.type?.label || '分類名' });
  if (p.platform) segs.push({ key: 'platform', text: p.platform, sep: ':', label: '対象', note: x.platform && x.platform !== p.platform ? x.platform : '動作する環境' });
  if (p.family) segs.push({ key: 'family', text: p.family, sep: '/', label: 'ファミリー', note: 'マルウェアの系統名' });
  if (p.variant) segs.push({ key: 'variant', text: p.variant, sep: '.', label: '亜種', note: '同じ系統の中での区別' });
  if (p.suffix) segs.push({ key: 'suffix', text: p.suffix, sep: '!', label: '補足', note: p.suffix.toLowerCase() === 'ml' ? '機械学習による検出' : '検出方法などの追加情報' });
  return segs;
}
