import { useState, type ReactNode } from 'react'
import { JOKER, cardId, rankOf, removeCards, type Action, type CardId, type PlayerView } from '@srm/game-core'
import type { SelectionMode } from '../game/selection'
import { cx } from '../ui/cx'
import { AlertIcon } from '../ui/icons'
import { RANKS, cardName, rankLabel, type NameOf } from '../ui/labels'
import { Button } from './Button'

type JokerAction = Extract<Action, { type: 'USE_JOKER' }>

function leavesOnlyJoker(hand: CardId[]): boolean {
  return hand.length === 1 && hand[0] === JOKER
}

function Panel({
  title,
  description,
  warning,
  actions,
  children,
}: {
  title: string
  description?: ReactNode
  warning?: string
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <section
      aria-label={title}
      className="rounded-xl border border-slate-200 bg-white px-3 py-2 leading-normal md:px-4 md:py-3"
    >
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-body">{description}</p>}
      {warning && (
        <p
          role="alert"
          className="mt-2 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          <AlertIcon className="h-4 w-4 shrink-0 text-red-600" />
          {warning}
        </p>
      )}
      {children && <div className="mt-2 md:mt-3">{children}</div>}
      {actions && <div className="mt-2 flex flex-wrap gap-2 md:mt-3">{actions}</div>}
    </section>
  )
}

function Waiting({ text }: { text: string }) {
  return (
    <p
      role="status"
      className="rounded-xl border border-slate-200 bg-gray-50 px-3 py-2 text-sm leading-normal text-body md:px-4 md:py-3"
    >
      {text}
    </p>
  )
}

/** 今あなたが答えるべきことを1つだけ出す */
export function DecisionPanel({
  view,
  mode,
  selected,
  decisionKey,
  act,
  nameOf,
  giveToName,
  onShowResult,
  onRematch,
}: {
  view: PlayerView
  mode: SelectionMode
  selected: CardId[]
  decisionKey: string
  act: (action: Action) => void
  nameOf: NameOf
  giveToName: string
  onShowResult: () => void
  onRematch: () => void
}) {
  const me = view.you.id
  const pending = view.pending

  if (view.phase === 'ended') {
    return (
      <Panel
        title="対戦終了"
        actions={
          <>
            <Button onClick={onRematch}>もう一度遊ぶ</Button>
            <Button variant="secondary" onClick={onShowResult}>
              結果を見る
            </Button>
          </>
        }
      />
    )
  }

  if (pending) {
    switch (pending.type) {
      case 'giveSevens': {
        if (mode.type !== 'give') return <Waiting text="ほかのプレイヤーが渡すカードを選んでいます" />
        const ready = selected.length === mode.count
        return (
          <Panel
            title="7渡し"
            description={`${giveToName} に渡すカードを${mode.count}枚選んでください(${selected.length}/${mode.count})`}
            actions={
              <Button disabled={!ready} onClick={() => act({ type: 'GIVE_SEVENS', playerId: me, cards: selected })}>
                {mode.count}枚を渡す
              </Button>
            }
          />
        )
      }

      case 'bombRank':
        if (pending.by !== me) return <Waiting text={`${nameOf(pending.by)} がQボンバーのランクを選んでいます`} />
        return (
          <Panel
            title="Qボンバー"
            description="ランクを1つ指定してください。全員(あなたを含む)が、そのランクのカードを全て場に出します。それで手札が0枚になった人は強制敗北です。"
          >
            <BombGrid view={view} act={act} />
          </Panel>
        )

      case 'tenDiscard': {
        if (pending.by !== me) return <Waiting text={`${nameOf(pending.by)} が10捨てで出すカードを選んでいます`} />
        const card = selected[0]
        const suicide = card !== undefined && leavesOnlyJoker(removeCards(view.you.hand, [card]))
        return (
          <Panel
            title="10捨て"
            description="手札からもう1枚選んで場に出します。隣が埋まっていなくても置けます(そのカードの効果は発動しません)。"
            warning={
              card === JOKER
                ? 'ジョーカーはゲームから除外され、砂嵐・3スペでも回収できません'
                : suicide
                  ? '出すとジョーカーだけが残り、強制敗北します'
                  : undefined
            }
            actions={
              <Button
                variant={suicide ? 'danger' : 'primary'}
                disabled={card === undefined}
                onClick={() => card !== undefined && act({ type: 'TEN_DISCARD', playerId: me, card })}
              >
                {card === undefined ? 'カードを選んでください' : `${cardName(card)} を出す`}
              </Button>
            }
          />
        )
      }

      case 'fourStop':
        if (!pending.yourTurnToAnswer) return <Waiting text="4止めの宣言を待っています" />
        return (
          <Panel
            title="4止め"
            description={`${nameOf(pending.eightBy)} が8を出しました。4を2枚公開すると、8切りのスキップを奪えます(次のあなたの手番が飛びます。パスは減りません)。`}
            actions={
              <>
                <Button onClick={() => act({ type: 'REACT', playerId: me, effect: 'fourStop' })}>4止めを宣言する</Button>
                <Button variant="secondary" onClick={() => act({ type: 'REACT', playerId: me, effect: 'skip' })}>
                  スキップ
                </Button>
              </>
            }
          />
        )

      case 'jokerReaction':
        if (!pending.yourTurnToAnswer) return <Waiting text="砂嵐・3スペの宣言を待っています" />
        return (
          <Panel
            title="ジョーカーが使われました"
            description={`${nameOf(pending.jokerBy)} がジョーカーを ${cardName(cardId(pending.cell.suit, pending.cell.rank))} の位置に置きました。宣言すると、ジョーカーを奪えます。`}
            actions={
              <>
                {pending.yourOptions.map((effect, i) => (
                  <Button
                    key={effect}
                    variant={i === 0 ? 'primary' : 'secondary'}
                    onClick={() => act({ type: 'REACT', playerId: me, effect })}
                  >
                    {effect === 'sandstorm' ? '砂嵐(3を3枚公開)' : '3スペ(♠3を公開)'}
                  </Button>
                ))}
                <Button variant="subtle" onClick={() => act({ type: 'REACT', playerId: me, effect: 'skip' })}>
                  スキップ
                </Button>
              </>
            }
          />
        )

      case 'jokerTake':
        if (pending.holder !== me) return <Waiting text={`${nameOf(pending.holder)} がジョーカーをもらうか選んでいます`} />
        return (
          <Panel
            title="ジョーカーをもらいますか?"
            description="もらわない場合、ジョーカーはゲームから除外されます。手札がジョーカーだけになると強制敗北になる点に注意してください。"
            actions={
              <>
                <Button onClick={() => act({ type: 'JOKER_TAKE', playerId: me, take: true })}>もらう</Button>
                <Button variant="secondary" onClick={() => act({ type: 'JOKER_TAKE', playerId: me, take: false })}>
                  もらわない
                </Button>
              </>
            }
          />
        )
    }
  }

  if (mode.type === 'turn') return <TurnActions key={decisionKey} view={view} selected={selected} act={act} />

  switch (view.you.status) {
    case 'finished':
      return <Waiting text="あなたは上がりました。対戦の終わりを待っています" />
    case 'eliminated':
      return <Waiting text="あなたはパス切れで脱落しました。対戦の終わりを待っています" />
    case 'defeated':
      return <Waiting text="あなたは強制敗北しました。対戦の終わりを待っています" />
    case 'playing':
      return <Waiting text={view.turnPlayerId ? `${nameOf(view.turnPlayerId)} が考えています` : '準備しています'} />
  }
}

function TurnActions({ view, selected, act }: { view: PlayerView; selected: CardId[]; act: (action: Action) => void }) {
  const [confirmingPass, setConfirmingPass] = useState(false)
  const me = view.you.id
  const legal = view.legalActions
  const card = selected[0]
  const place = legal.find((a) => a.type === 'PLACE' && a.card === card)
  const jokerUses = card === JOKER ? legal.filter((a): a is JokerAction => a.type === 'USE_JOKER') : []
  const declares = legal.filter((a) => a.type === 'DECLARE')
  const lastPass = view.you.passesLeft === 0

  let description = 'カードを選んで出すか、パスしてください。'
  let warning: string | undefined
  if (card === JOKER) {
    description =
      jokerUses.length > 0
        ? 'ジョーカーを置く位置を選んでください。そのマスのカードを持っている人が、そのカードを場に出します。'
        : '今はジョーカーを置ける位置がありません。'
  } else if (card !== undefined && !place) {
    description = `${cardName(card)} は今は出せません(7から繋がっている列の端にしか出せません)。`
  } else if (card !== undefined && leavesOnlyJoker(removeCards(view.you.hand, [card]))) {
    warning = '出すとジョーカーだけが残り、強制敗北します'
  }
  if (declares.length > 0) {
    description += ' 宣言すると次の手番が飛びます(パスは減りません)。'
  }

  return (
    <Panel
      title="あなたの手番"
      description={description}
      warning={warning}
      actions={
        <>
          {place && card !== undefined && (
            <Button variant={warning ? 'danger' : 'primary'} onClick={() => act(place)}>
              {cardName(card)} を出す
            </Button>
          )}
          {declares.map((action) => (
            <Button key={action.type === 'DECLARE' ? action.effect : ''} variant="secondary" onClick={() => act(action)}>
              {action.type === 'DECLARE' && action.effect === 'rokurokubi' ? 'ろくろっくび(6を2枚公開)' : '救急車(9を2枚公開)'}
            </Button>
          ))}
          {confirmingPass ? (
            <>
              <Button variant="danger" onClick={() => act({ type: 'PASS', playerId: me })}>
                パスして脱落する
              </Button>
              <Button variant="subtle" onClick={() => setConfirmingPass(false)}>
                やめる
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              onClick={() => (lastPass ? setConfirmingPass(true) : act({ type: 'PASS', playerId: me }))}
            >
              {lastPass ? 'パス(脱落します)' : `パス(残り${view.you.passesLeft}回)`}
            </Button>
          )}
        </>
      }
    >
      {jokerUses.length > 0 && <JokerTargets view={view} uses={jokerUses} act={act} />}
    </Panel>
  )
}

function JokerTargets({ view, uses, act }: { view: PlayerView; uses: JokerAction[]; act: (action: Action) => void }) {
  const groups = new Map<CardId, JokerAction[]>()
  for (const use of uses) {
    const target = cardId(use.cell.suit, use.cell.rank)
    groups.set(target, [...(groups.get(target) ?? []), use])
  }

  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {[...groups].map(([target, list]) => (
        <li key={target} className="rounded-lg border border-slate-200 px-3 py-2">
          <p className="text-sm font-medium text-slate-900">{cardName(target)} の位置</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {list.map((use) => {
              const rest = removeCards(view.you.hand, use.withCard ? [JOKER, use.withCard] : [JOKER])
              const forbidden = rest.length === 0
              return (
                <Button
                  key={use.withCard ?? 'alone'}
                  size="sm"
                  variant={forbidden ? 'danger' : use.withCard ? 'secondary' : 'primary'}
                  onClick={() => act(use)}
                >
                  {use.withCard ? `${cardName(use.withCard)} も一緒に出す` : 'ジョーカーだけ置く'}
                  {forbidden ? '(禁止アガリ)' : ''}
                </Button>
              )
            })}
          </div>
        </li>
      ))}
    </ul>
  )
}

function BombGrid({ view, act }: { view: PlayerView; act: (action: Action) => void }) {
  const hand = view.you.hand
  return (
    <div className="grid grid-cols-7 gap-1.5 md:grid-cols-13">
      {RANKS.map((rank) => {
        const mine = hand.filter((id) => rankOf(id) === rank).length
        const rest = hand.filter((id) => rankOf(id) !== rank)
        const suicide = mine > 0 && (rest.length === 0 || leavesOnlyJoker(rest))
        return (
          <button
            key={rank}
            type="button"
            onClick={() => act({ type: 'BOMB_RANK', playerId: view.you.id, rank })}
            aria-label={`${rankLabel(rank)} を指定${mine > 0 ? `(あなたの手札に${mine}枚)` : ''}${suicide ? '。あなたが強制敗北します' : ''}`}
            className={cx(
              'flex h-14 flex-col items-center justify-center rounded-lg border bg-white leading-tight transition-colors hover:bg-gray-50',
              'focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:outline-none',
              suicide ? 'border-red-300 text-red-700' : 'border-slate-200 text-slate-900',
            )}
          >
            <span className="text-base font-semibold">{rankLabel(rank)}</span>
            <span className="text-xxs text-slate-500">{suicide ? '自滅' : mine > 0 ? `手札${mine}` : ' '}</span>
          </button>
        )
      })}
    </div>
  )
}
