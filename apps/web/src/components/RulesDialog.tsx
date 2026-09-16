import { TIMER } from '../game/config'
import { Dialog } from './Dialog'

const EFFECTS: [rank: string, name: string, effect: string][] = [
  ['3', '砂嵐 / 3スペ', '誰かがジョーカーを使ったとき、3を3枚(砂嵐)か♠3(3スペ)を公開して、ジョーカーを奪う'],
  ['4', '4止め', '誰かが8を出したとき、4を2枚公開して、8切りのスキップを奪う'],
  ['5', '5スキ', '出すと、次の人の手番を飛ばす'],
  ['6', 'ろくろっくび', '自分の手番中に6を2枚公開して、次の自分の手番を飛ばす'],
  ['7', '7渡し', '最初に7を並べた枚数だけ、次の人に好きなカードを渡す'],
  ['8', '8切り', '出すと、次の自分の手番を飛ばす'],
  ['9', '9リバ / 救急車', '出すと手番が逆回りになる / 自分の手番中に9を2枚公開して、次の自分の手番を飛ばす'],
  ['10', '10捨て', '出すと、手札からもう1枚を好きな位置に出す(手札を0枚にはできない)'],
  ['J', 'イレブンバック', '出すと手番が逆回りになる'],
  ['Q', 'Qボンバー', 'ランクを指定し、全員がそのランクを全部場に出す。それで0枚になった人は強制敗北'],
  ['JOKER', 'ジョーカー', '7から繋がった列の端に置き、そのマスのカードを持っている人に出させる'],
]

export function RulesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} title="ルール" onClose={onClose} size="lg">
      <h3 className="text-base font-semibold text-slate-900">基本</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>7から、同じマークの隣に1枚ずつ並べます。手札を先になくした人の勝ちです。</li>
        <li>
          出せるのは、7から途切れずに繋がっている列の両端だけです。効果でできた飛び地の隣には出せません。AとKは繋がりません。
        </li>
        <li>パスは3回まで。4回目で脱落し、手札を全部場に出します。</li>
        <li>効果で手番が飛ばされても、パスの回数は減りません。</li>
        <li>手札がジョーカーだけになる、ジョーカーで上がる、は強制敗北です(禁止アガリ)。</li>
        <li>砂嵐・4止めなどの宣言は、宣言できる人にだけボタンが出ます。</li>
        <li>
          制限時間は1回{TIMER.baseMs / 1000}秒 + 持ち時間{TIMER.reserveMs / 1000}秒です。時間切れになると、
          手番ならパス、宣言ならスキップになります。
        </li>
      </ul>

      <h3 className="mt-6 text-base font-semibold text-slate-900">数字の効果</h3>
      <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-3 py-2 text-xs font-medium text-slate-500">
                数字
              </th>
              <th scope="col" className="px-3 py-2 text-xs font-medium text-slate-500">
                名前
              </th>
              <th scope="col" className="px-3 py-2 text-xs font-medium text-slate-500">
                効果
              </th>
            </tr>
          </thead>
          <tbody>
            {EFFECTS.map(([rank, name, effect]) => (
              <tr key={rank} className="border-t border-slate-200 align-top">
                <td className="px-3 py-2 font-semibold whitespace-nowrap text-slate-900">{rank}</td>
                <td className="px-3 py-2 whitespace-nowrap text-slate-900">{name}</td>
                <td className="px-3 py-2 text-body">{effect}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-6 text-base font-semibold text-slate-900">ラウンド制(3ラウンド・5ラウンド・エンドレス)</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          毎ラウンド、順位でポイントがもらえます(4人戦なら 1位3点・2位2点・3位1点・4位0点)。合計ポイントが一番多い人の優勝です。同点なら最後のラウンドの順位で決めます。
        </li>
        <li>
          2ラウンド目からは、前のラウンドの順位で身分(大富豪・富豪・平民・貧民・大貧民)が決まり、7を並べる前にカードを交換します。
        </li>
        <li>
          大貧民は強いカードから2枚を大富豪に渡し、大富豪は好きなカードを2枚渡します。貧民と富豪は1枚ずつです。全員が同時に渡すので、もらったカードは渡せません。
        </li>
        <li>強さの順番: ジョーカー &gt; 7 &gt; 8 &gt; 6 &gt; 9 &gt; 5 &gt; 10 &gt; 4 &gt; 3 &gt; J &gt; Q &gt; 2 &gt; K &gt; A</li>
      </ul>
    </Dialog>
  )
}
