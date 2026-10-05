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

カードの効果・自分の番・脱落(強制敗北)の音は、合うものが見つかっていないので付けていない。
