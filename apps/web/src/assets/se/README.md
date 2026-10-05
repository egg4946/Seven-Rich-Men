# 効果音

すべて [効果音ラボ](https://soundeffect-lab.info/) の素材(2026-10-05 取得)。

規約の要点(<https://soundeffect-lab.info/agreement/>):

- 商用含め無料。クレジット表記は任意
- アプリに操作音として組み込むのは可(GitHub での公開も可)。**音源ファイルそのものの再配布・直リンクは禁止**
- このフォルダのファイルを、ゲーム以外の用途に取り出して配らないこと

差し替えるときは、同じ名前でファイルを置き換える(鳴らす場面は `src/sound/events.ts`、音量の調整は `src/sound/player.ts` の `TRIM`)。

| ファイル | サイト上の名前 | 元のパス(`/sound/` 以下) | 鳴らす場面 |
|---|---|---|---|
| cardPut.mp3 | カードを台の上に出す | various/mp3/card-put1.mp3 | カードが場に着く |
| cardSelect.mp3 | カードをめくる | various/mp3/card-turn-over1.mp3 | 手札を選ぶ |
| deal.mp3 | カードを配る | various/mp3/card-hand-out1.mp3 | カード交換・7渡し |
| click.mp3 | カーソル移動1 | button/mp3/cursor1.mp3 | ボタン・選択 |
| pass.mp3 | キャンセル1 | button/mp3/cancel1.mp3 | パス |
| finish.mp3 | レベルアップ | anime/mp3/levelup1.mp3 | 上がり |
| start.mp3 | 試合開始のゴング | anime/mp3/gong-played1.mp3 | GAME START |
| gameEnd.mp3 | 試合終了のゴング | anime/mp3/gong-played2.mp3 | GAME SET |
| win.mp3 | 歓声と拍手 | voice/mp3/people/people-performance-cheer1.mp3 | 自分が1位で GAME SET |

カードの効果・自分の番・脱落(強制敗北)の音は、合うものが見つかっていないので、ふだんは付けていない。

## ドパガキモード(演出: ドパガキ)でだけ鳴らす音

これも、すべて効果音ラボの素材(2026-10-05 取得)。ひたすら派手に重ねるネタ枠なので、ふだんは鳴らさない音もここでは鳴らす。
このモードを選んだときに初めて読み込む(`src/sound/player.ts` の `preloadDopaSounds`)。

| ファイル | サイト上の名前 | 元のパス(`/sound/` 以下) | 鳴らす場面 |
|---|---|---|---|
| dopaSkip.mp3 | ワープ | battle/mp3/magic-worp1.mp3 | 5スキ |
| dopaSlash.mp3 | 剣で斬る1 | battle/mp3/sword-slash1.mp3 | 8切り |
| dopaReverse.mp3 | DJのスクラッチ2 | anime/mp3/dj-scratch2.mp3 | 9リバ・イレブンバック |
| dopaDiscard.mp3 | 決定ボタンを押す36 | button/mp3/decision36.mp3 | 10捨て |
| dopaBomb.mp3 | 爆発1 | battle/mp3/bomb1.mp3 | 盤面・手札が弾け飛ぶとき(Qボンバー・GAME SET・コンボの節目・PUSH が溜まり切ったとき) |
| dopaJoker.mp3 | ジャジャーン | anime/mp3/jajean1.mp3 | ジョーカー |
| dopaReveal.mp3 | きらーん1 | anime/mp3/eye-shine1.mp3 | 宣言(砂嵐など) |
| dopaOut.mp3 | 呪いの旋律 | anime/mp3/curse-melody1.mp3 | 脱落・強制敗北 |
| dopaTurn.mp3 | 決定ボタンを押す53 | button/mp3/decision53.mp3 | あなたの番・PUSH を押すたび(溜まるほど高い音) |
| dopaCoin.mp3 | アイテムを入手1 | anime/mp3/item-get1.mp3 | カードが場に着くたび(コンボが伸びるほど高い音) |
| dopaPraise.mp3 | 決定ボタンを押す37 | button/mp3/decision37.mp3 | 褒め言葉 |
| dopaHot.mp3 | 超必殺技発動 | battle/mp3/super-arts-motion1.mp3 | コンボの節目(FEVER など)・PUSH が溜まり切ったとき |
| dopaCheer.mp3 | 男衆「イエーイ！」 | anime/mp3/mens-yeah1.mp3 | 同上 |
| dopaFanfare.mp3 | ラッパのファンファーレ | anime/mp3/trumpet1.mp3 | 上がり・1000倍以上の倍率 |
| dopaImpact.mp3 | 文字表示の衝撃音3 | anime/mp3/text-impact3.mp3 | 盤面・手札が弾け飛ぶ前の溜め・暗転した瞬間 |
| dopaJackpot.mp3 | 決定ボタンを押す20 | button/mp3/decision20.mp3 | 暗転が明けるとき(倍率の暗転、自分の上がり、自分が1位の GAME SET)・モードの切り替え |
| dopaReach.mp3 | 警報が鳴る | anime/mp3/emergency-alert1.mp3 | リーチ(誰かの手札が残り1枚) |
| dopaDrop.mp3 | ドーン | anime/mp3/doon1.mp3 | 巨大な 7・爆弾・JOKER が落ちる |

音は試聴せずに名前と説明から選んでいる。合わなければ、同じ名前でファイルを置き換える。
