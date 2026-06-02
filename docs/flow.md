## 0. 全体ループ

まず、アプリ全体の一番大きな流れです。

```mermaid
flowchart TD
    A[ユーザーがWebアプリを開く] --> B{ログイン済みか}
    B -->|いいえ| C[登録 / ログイン]
    B -->|はい| D[ホーム]
    C --> D

    D --> E{AIペット作成済みか}
    E -->|いいえ| F[AIペット作成へ]
    E -->|はい| G[日常利用へ]

    F --> W1[→1 初期設定・飼い主理解へ]
    G --> W2[→2 日常利用・記憶更新へ]

    W7[7→ 交流後の記憶更新から戻る] --> D
```

## 1. 初期設定・飼い主理解

ここでは、AIペットの見た目育成ではなく、飼い主理解を育てるための初期データを作ります。

```mermaid
flowchart TD
    S1[1→ 初期設定開始] --> A[AIペット作成]
    A --> B[ペット名を設定]
    B --> C[ペットの口調・性格を設定]
    C --> D[初期プロフィール入力]

    D --> E[興味・趣味を入力]
    D --> F[最近ハマっていることを入力]
    D --> G[話しやすい話題を入力]
    D --> H[出したくない話題を入力]

    E --> I[LLM処理: 初期プロフィール理解]
    F --> I
    G --> I
    H --> I

    I --> J[趣味・関心を抽出]
    I --> K[価値観を抽出]
    I --> L[最近の話題を抽出]
    I --> M[苦手な話題を抽出]
    I --> N[会話スタイルを推定]

    J --> O[User Memory DBに保存]
    K --> O
    L --> O
    M --> O
    N --> O

    O --> P[AIペットの飼い主理解が初期化される]
    P --> W2[→2 日常利用・記憶更新へ]
```

## 2. 日常利用・記憶更新

ここが「ペットを育てる」部分です。
ユーザーが毎回がっつりチャットするのではなく、軽い入力や履歴からLLMが飼い主理解を更新します。

```mermaid
flowchart TD

%% =========================
%% 2. 日常利用開始
%% =========================

S2[2→ 日常利用開始] --> A[ホーム画面]

A --> B{ユーザーの行動}

B -->|ペットと軽く話す| C[短いチャット入力]
B -->|今日の出来事を書く| D[日記・履歴入力]
B -->|興味を追加する| E[興味タグ追加]
B -->|公開設定を見る| F[公開プロフィール確認]
B -->|相手と交換する| W3[→3 ペット交換開始へ]
B -->|交流履歴を見る| W7[→7 交流履歴へ]

C --> G[raw_inputとして保存]
D --> G
E --> G

%% =========================
%% 2-A. ルールベース判定
%% =========================

G --> H[ルールベース安全判定]

H --> I{明らかに共有禁止か}

I -->|はい| J[Blocked Memoryに保存]
J --> K[共有禁止理由を保存]
K --> L[今後の出力で避ける条件に追加]
L --> M[Private Memoryにも必要なら抽象化して保存]
M --> Z[ホーム画面へ戻る]

I -->|いいえ| N{明らかに共有可能か}

N -->|はい| O[Public Memory候補にする]
N -->|いいえ| P[LLM分類へ]

%% =========================
%% 2-B. 明らかに共有可能な情報
%% =========================

O --> Q[共有用に抽象化]
Q --> R[Public Memoryに保存]
R --> S[Private Memoryにも飼い主理解として保存]
S --> T[AIペットの飼い主理解が更新される]
T --> Z

%% =========================
%% 2-C. LLM分類
%% =========================

P --> U[LLM処理: 入力内容を意味分類]

U --> V[趣味・関心を抽出]
U --> W[価値観を抽出]
U --> X[最近の出来事を抽出]
U --> Y[苦手な話題を抽出]
U --> AA[会話スタイルを推定]
U --> AB[個人情報・センシティブ情報を検出]
U --> AC[公開してよい粒度を推定]

V --> AD[LLM分類結果を統合]
W --> AD
X --> AD
Y --> AD
AA --> AD
AB --> AD
AC --> AD

AD --> AE{保存先を判定}

AE -->|内部記憶のみ| AF[Private Memoryに保存]
AE -->|共有可能| AG[Public Memoryに保存]
AE -->|共有禁止| AH[Blocked Memoryに保存]
AE -->|ユーザー確認が必要| AI[Review Required Memoryに保存]

%% =========================
%% 2-D. Private Memory
%% =========================

AF --> AJ[飼い主理解にのみ利用]
AJ --> AK[交換時には使わない]
AK --> AL[AIペットの理解が深まる]
AL --> Z

%% =========================
%% 2-E. Public Memory
%% =========================

AG --> AM[交換用プロフィールに反映]
AM --> AN[相手ペットとの照合に利用可能]
AN --> AO[ただし生ログは共有しない]
AO --> AP[安全な要約として保存]
AP --> AL

%% =========================
%% 2-F. Blocked Memory
%% =========================

AH --> AQ[共有禁止情報として保存]
AQ --> AR[会話生成・レポート生成時の禁止条件に追加]
AR --> AS[Public Memoryには反映しない]
AS --> AL

%% =========================
%% 2-G. Review Required Memory
%% =========================

AI --> AT[ユーザー確認待ちとして保存]
AT --> AU[公開設定画面に表示]
AU --> AV{ユーザーが許可するか}

AV -->|許可する| AW[抽象化してPublic Memoryに移動]
AV -->|許可しない| AX[Blocked Memoryに移動]
AV -->|あとで確認| AY[Review Required Memoryに残す]

AW --> AL
AX --> AL
AY --> AL

%% =========================
%% 2-H. 公開プロフィール確認
%% =========================

F --> BA[Public Memoryを表示]
BA --> BB[現在共有されうる話題を確認]
BB --> BC{ユーザーが編集するか}

BC -->|公開範囲を広げる| BD[Review Required Memoryから選択]
BC -->|公開範囲を狭める| BE[Public Memoryから削除]
BC -->|変更しない| Z

BD --> BF[選択内容をPublic Memoryに移動]
BE --> BG[Blocked MemoryまたはPrivate Memoryに移動]

BF --> Z
BG --> Z

Z[ホーム画面へ戻る]
```

## 3. ペット交換開始

交換は、Webアプリ前提では鳴き声通信 / QRです。
物理NFCタグを使う場合も、NFC自体で情報交換するのではなく、交換URLを開く入口として使います。

```mermaid
flowchart TD

%% =========================
%% 3. ペット交換開始
%% =========================

S3[3→ ペット交換開始] --> A{交換の入口}

%% =========================
%% 3-A. アプリ内から交換する通常ルート
%% =========================

A -->|アプリ内から交換する| B[ホーム画面の交換ボタンを押す]

B --> C[交換画面を開く]
C --> D[近くのペットを探す説明を表示]

D --> E[鳴き声通信の説明を表示]
E --> F[マイク許可が必要であることを表示]
F --> G[周囲が静かな場所を推奨]
G --> H[音が聞こえない場合はQRに切り替え可能と表示]

H --> I{ユーザーが開始するか}

I -->|開始しない| J[ホーム画面へ戻る]
I -->|開始する| K[鳴き声通信を開始]

K --> W4SOUND[→4 交換画面から鳴き声通信へ]

%% =========================
%% 3-B. NFCタグから始まる別軸ルート
%% =========================

A -->|物理NFCタグにタッチする| L[NFCタグを読み取る]

L --> M[NFCタグ内のURLを開く]
M --> N[WebアプリのNFC交換URLに遷移]

N --> O{ログイン済みか}

O -->|いいえ| P[ログイン / 新規登録]
O -->|はい| Q[NFC交換確認画面]

P --> Q

Q --> R[タグに紐づくAIペットを表示]
R --> S[このペットと交流しますか？と表示]

S --> T{ユーザーが交流を開始するか}

T -->|いいえ| U[交換キャンセル]
T -->|はい| V[NFC交換ルートを開始]

V --> W4NFC[→4 交換画面を介さないNFCルートへ]
```

## 4. 交換方法ごとの詳細

ここが今回のポイントです。

```mermaid
flowchart TD

%% =========================
%% 4. 交換フロー全体
%% =========================

S4[4→ 交換フロー開始] --> A{交換の入口}

A -->|アプリ内から交換する| B[交換画面を開く]
A -->|物理NFCタグにタッチする| NFC0[交換画面を介さないNFCルート]

%% =========================
%% 4-A. 通常ルート：交換画面から鳴き声通信
%% =========================

B --> C[近くのペットを探すボタンを押す]
C --> D[鳴き声通信モードを開始]

D --> E[マイク許可を要求]
E --> F{マイク許可されたか}

F -->|いいえ| QR0[QR例外ルートへ]
F -->|はい| G[サーバーに一時トークン発行を要求]

G --> H[Exchange Tokenを発行]
H --> I[有効期限を設定]
I --> J[例: 30秒だけ有効]
J --> K[一時トークンをDBに保存]

K --> L[一時トークンを短いコード列に変換]
L --> M[コード列を鳴き声パターンに変換]

M --> N[例: ピヨ・ピヨ・キュイ・ピッ]
N --> O[Web Audio APIで短い鳴き声を再生]

O --> P[同時に数秒間だけ周囲の音を聞く]
P --> Q[getUserMediaでマイク入力を取得]
Q --> R[音声バッファを取得]
R --> S[FFTで周波数パターンを解析]

S --> T{相手の鳴き声トークンを検出できたか}

T -->|いいえ| U[検出失敗]
U --> V{再試行するか}

V -->|はい| G
V -->|いいえ| QR0

T -->|はい| W[音列から一時トークンを復元]
W --> X[サーバーにトークン照合を要求]

X --> Y{トークンは有効か}

Y -->|いいえ| Z[期限切れ / 不正トークン]
Z --> QR0

Y -->|はい| AA[相手ペット候補を取得]
AA --> AB[交換確認画面を表示]

AB --> AC{ユーザーが承認するか}

AC -->|拒否| AD[交換キャンセル]
AC -->|承認| AE[自分側の承認を保存]

AE --> AF{相手側も承認済みか}

AF -->|いいえ| AG[相手の承認待ち]
AG --> AF

AF -->|はい| AH[Exchange Sessionを確定]
AH --> AI[exchange_method = sound として保存]
AI --> W5[→5 LLM共通項分析へ]

%% =========================
%% 4-B. 例外ルート：QRコード
%% =========================

QR0[QR例外ルート] --> QR1[音交換に失敗した理由を表示]

QR1 --> QR2{失敗理由}

QR2 -->|マイク許可なし| QR3[マイク許可が必要です]
QR2 -->|音を検出できない| QR4[相手の鳴き声を検出できませんでした]
QR2 -->|周囲が騒がしい| QR5[周囲のノイズが多い可能性があります]
QR2 -->|トークン期限切れ| QR6[もう一度交換してください]
QR2 -->|端末非対応| QR7[この端末では音交換が使えません]

QR3 --> QR8[QRコードで交換する]
QR4 --> QR8
QR5 --> QR8
QR6 --> QR8
QR7 --> QR8

QR8 --> QR9[交換用QRコードを表示]
QR9 --> QR10[相手がQRコードを読み取る]
QR10 --> QR11[交換URLを開く]

QR11 --> QR12{相手はログイン済みか}

QR12 -->|いいえ| QR13[ログイン / 新規登録]
QR12 -->|はい| QR14[交換確認画面]
QR13 --> QR14

QR14 --> QR15{相手が承認するか}

QR15 -->|拒否| QR16[交換キャンセル]
QR15 -->|承認| QR17[Exchange Sessionに参加]

QR17 --> QR18{双方が承認済みか}

QR18 -->|いいえ| QR19[承認待ち]
QR19 --> QR18

QR18 -->|はい| QR20[Exchange Sessionを確定]
QR20 --> QR21[exchange_method = qr_fallback として保存]
QR21 --> W5

%% =========================
%% 4-C. 別軸ルート：NFCタグ
%% =========================

NFC0[交換画面を介さないNFCルート] --> NFC1[ユーザーが物理NFCタグにiPhoneを近づける]

NFC1 --> NFC2[NFCタグ内のURLを開く]
NFC2 --> NFC3[例: your-app.com/pet-tag/tag_8f3a92]

NFC3 --> NFC4[サーバーがtag_idを受け取る]
NFC4 --> NFC5{tag_idは有効か}

NFC5 -->|無効| NFC6[無効なタグとして表示]
NFC5 -->|有効| NFC7[タグに紐づくPet IDを取得]

NFC7 --> NFC8{ユーザーはログイン済みか}

NFC8 -->|いいえ| NFC9[ログイン / 新規登録]
NFC8 -->|はい| NFC10[交換確認画面]
NFC9 --> NFC10

NFC10 --> NFC11[このペットと交流しますか？]
NFC11 --> NFC12{ユーザーが承認するか}

NFC12 -->|拒否| NFC13[交換キャンセル]
NFC12 -->|承認| NFC14[Exchange Sessionを作成]

NFC14 --> NFC15[タグ所有者側にも交換通知]
NFC15 --> NFC16{タグ所有者が承認するか}

NFC16 -->|拒否| NFC17[交換キャンセル]
NFC16 -->|承認| NFC18[Exchange Sessionを確定]

NFC18 --> NFC19[exchange_method = nfc_tag として保存]
NFC19 --> W5
```

## 5. LLM共通項分析

ここからがAIペットの中核です。
相手に渡すのは生ログではなく、LLMが生成した共有用要約プロフィールだけです。

```mermaid
flowchart TD
    S5[5→ LLM共通項分析開始] --> A[Exchange Sessionを確定]

    A --> B[ユーザーAのPublic Memoryを取得]
    A --> C[ユーザーBのPublic Memoryを取得]

    B --> D{Public Memoryは十分か}
    C --> E{Public Memoryは十分か}

    D -->|不足| F[A側は情報不足として扱う]
    D -->|十分| G[Aの共有可能プロフィールを使用]

    E -->|不足| H[B側は情報不足として扱う]
    E -->|十分| I[Bの共有可能プロフィールを使用]

    F --> J[利用可能な範囲だけで照合]
    G --> J
    H --> J
    I --> J

    J --> K[LLM処理: ペット同士の照合]

    K --> L[明示的な共通項を抽出]
    K --> M[直接同じではないが関連する話題を抽出]
    K --> N[会話に出しやすい話題を生成]
    K --> O[避けるべき話題と衝突していないか確認]
    K --> P[新しい趣味候補を生成]
    K --> Q[次回につながる話題を生成]

    L --> R[安全性チェック]
    M --> R
    N --> R
    O --> R
    P --> R
    Q --> R

    R --> S{Blocked Memoryに触れていないか}

    S -->|触れている| T[該当内容を削除 / 抽象化]
    S -->|問題なし| U[Exchange Analysis DBに保存]

    T --> U

    U --> V{結果をいつ見るか}

    V -->|今見る| W6A[→6 その場表示へ]
    V -->|あとで見る| W6B[→6 帰宅後レポートへ]

```

## 6. その場表示・帰宅後レポート

メインは帰宅後です。
ただし、会っている最中にも軽く見られるようにします。

### 6-A. その場表示

その場で出す内容は、重くしすぎない方がよいです。
初対面でも使えるように、個人的すぎる内容は避けます。

```mermaid
flowchart TD
    S6A[6→ その場表示] --> A[LLM処理: その場用カード生成]

    A --> B[軽い共通話題カード]
    A --> C[自然に聞ける質問カード]
    A --> D[今話しても違和感のない話題カード]

    B --> E[ユーザーに表示]
    C --> E
    D --> E

    E --> F[その場表示済みとして保存]
    F --> W7[→7 交流履歴・記憶更新へ]
```

### 6-B. 帰宅後レポート

本命はこちらです。
会話中に急かすのではなく、あとから「次につながる話題」として整理します。

```mermaid
flowchart TD
    S6B[6→ 帰宅後レポート] --> A[帰宅後レポート待ちとして保存]

    A --> B{ユーザーがレポートを開くか}

    B -->|まだ開かない| C[交流履歴に未読として保存]
    B -->|開く| D[LLM処理: 帰宅後レポート生成]

    C --> W7A[→7 交流履歴へ]

    D --> E[今日の共通点カード]
    D --> F[会話ネタカード]
    D --> G[次回話題カード]
    D --> H[ありがとうLINE案カード]
    D --> I[新しい趣味候補カード]
    D --> J[AIペットからの一言]

    E --> K[帰宅後レポート画面に表示]
    F --> K
    G --> K
    H --> K
    I --> K
    J --> K

    K --> L[Report Cards DBに保存]
    L --> W7[→7 交流履歴・記憶更新へ]
```

## 7. 交流履歴・飼い主理解への再反映

最後に、ユーザーの反応をもとにAIペットがさらに飼い主を理解します。
これによって、使うほどペットが育つ構造になります。

```mermaid
flowchart TD
    S7[7→ 交流履歴・記憶更新] --> A[交流履歴一覧]

    A --> B[過去に交換した相手を表示]
    B --> C{交流詳細を見るか}

    C -->|見ない| W0[→0 ホームへ戻る]
    C -->|見る| D[交流詳細画面]

    D --> E[相手の基本情報を表示]
    D --> F[共通点カードを表示]
    D --> G[会話ネタカードを表示]
    D --> H[次回話題カードを表示]
    D --> I[ありがとうLINE案を表示]
    D --> J[新しい趣味候補を表示]

    F --> K{ユーザーの反応}
    G --> K
    H --> K
    I --> K
    J --> K

    K -->|保存した| L[好反応として記録]
    K -->|削除した| M[不要な話題として記録]
    K -->|ありがとうLINE案を使った| N[実用的な提案として記録]
    K -->|新しい趣味候補を保存した| O[新しい関心候補として記録]
    K -->|何もしない| P[閲覧のみとして記録]

    L --> Q[LLM処理: 交流後の記憶更新]
    M --> Q
    N --> Q
    O --> Q
    P --> Q

    Q --> R[興味を持ちやすい話題を更新]
    Q --> S[避けたい話題を更新]
    Q --> T[好みの提案形式を更新]
    Q --> U[相手との関係性を更新]

    R --> V[User Memory DBを更新]
    S --> V
    T --> V
    U --> V

    V --> W[AIペットの飼い主理解が成長]
    W --> W0[→0 ホームへ戻る]
```

## データ構造も分割して見る

フローだけだと実装イメージがぼやけるので、DBも簡単にまとめます。

```mermaid
erDiagram
    USERS ||--|| PETS : owns
    USERS ||--o{ USER_INPUTS : writes
    USERS ||--|| PRIVATE_MEMORIES : has
    USERS ||--|| PUBLIC_MEMORIES : has
    USERS ||--o{ BLOCKED_MEMORIES : has
    USERS ||--o{ REVIEW_REQUIRED_MEMORIES : has
    USERS ||--o{ EXCHANGE_PARTICIPANTS : joins
    EXCHANGE_SESSIONS ||--o{ EXCHANGE_PARTICIPANTS : includes
    EXCHANGE_SESSIONS ||--|| EXCHANGE_ANALYSES : produces
    EXCHANGE_ANALYSES ||--o{ REPORT_CARDS : contains

    USERS {
        string id
        string name
        datetime created_at
    }

    PETS {
        string id
        string user_id
        string name
        string personality
        string tone
        datetime created_at
    }

    USER_INPUTS {
        string id
        string user_id
        string input_type
        text content
        datetime created_at
    }

    PRIVATE_MEMORIES {
        string id
        string user_id
        json interests
        json values
        json recent_topics
        json conversation_style
        json relationship_notes
        datetime updated_at
    }

    PUBLIC_MEMORIES {
        string id
        string user_id
        json safe_topic_tags
        json safe_summaries
        json public_conversation_hooks
        json shareable_interests
        string visibility_level
        datetime updated_at
    }

    BLOCKED_MEMORIES {
        string id
        string user_id
        string blocked_topic
        string reason
        datetime created_at
    }

    REVIEW_REQUIRED_MEMORIES {
        string id
        string user_id
        string candidate_summary
        string reason
        string status
        datetime created_at
    }

    EXCHANGE_SESSIONS {
        string id
        string exchange_type
        string status
        datetime created_at
        datetime expired_at
    }

    EXCHANGE_PARTICIPANTS {
        string id
        string session_id
        string user_id
        boolean approved
        datetime joined_at
    }

    EXCHANGE_ANALYSES {
        string id
        string session_id
        json used_public_summaries
        json common_topics
        json related_topics
        json conversation_hooks
        json followup_suggestions
        datetime created_at
    }

    REPORT_CARDS {
        string id
        string analysis_id
        string card_type
        text title
        text body
        datetime created_at
    }
```

## LLM処理だけを抜き出すとこうです

プロダクト説明やハッカソン資料では、この図がかなり使いやすいと思います。

```mermaid
flowchart LR
    A[日常入力] --> B[LLM1: 飼い主理解]
    B --> C[共有可否分類]

    C --> D[Private Memory]
    C --> E[Public Memory]
    C --> F[Blocked Memory]
    C --> G[Review Required Memory]

    E --> H[交換イベント]
    H --> I[LLM2: Public Memory同士を照合]

    F --> J[禁止話題チェック]
    I --> J

    J --> K[LLM3: その場カード / 帰宅後レポート生成]
    K --> L[ユーザーの反応]

    L --> M[LLM4: 記憶更新]
    M --> B
```