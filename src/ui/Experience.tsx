import { useEffect, useRef, useState, type PointerEvent } from 'react';
import {
  ArrowUpRight,
  Check,
  Eye,
  EyeOff,
  Footprints,
  Hand,
  LockKeyhole,
  Map,
  MessageCircle,
  Send,
  ShieldOff,
  Users,
  X,
} from 'lucide-react';
import type { TempleEngine } from '../scene/engine';
import { getState, setState, toast, useGame } from '../state';
import { LANDMARKS, parseRoom, type AvatarStyle } from '../../shared/world';

export function Onboarding({ engine }: { engine: TempleEngine | null }) {
  const game = useGame();
  const [name, setName] = useState(game.name),
    [avatar, setAvatar] = useState<AvatarStyle>(game.avatar);
  const [mode, setMode] = useState<'enter' | 'create' | 'invite'>('enter'),
    [link, setLink] = useState('');
  const [privacy, setPrivacy] = useState<'private' | 'public'>('private'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const enter = async () => {
    if (!engine || !name.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await engine.updateIdentity(name.trim().slice(0, 24), game.color, avatar);
      let ok = false;
      if (mode === 'create') ok = await engine.createRoom(privacy);
      else if (mode === 'invite') {
        const url = new URL(link, location.href);
        if (!url.searchParams.has('room')) throw Error('Dán liên kết mời có tên phòng.');
        ok = await engine.enter(parseRoom(url.searchParams));
      } else ok = await engine.enter();
      if (!ok) setError(getState().toast || 'Chưa kết nối được máy chủ. Vui lòng thử lại.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Liên kết chưa hợp lệ.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="onboarding" aria-label="Vào SANSA Zen Garden">
      <div className="onboarding-card">
        <span className="tiny-overline">MỘT KHOẢNG LẶNG, CÙNG NHAU</span>
        <h1>
          SANSA <span>ZEN GARDEN</span>
        </h1>
        <p className="onboard-subtitle">Chốn bình an giữa thế giới ảo.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void enter();
          }}
        >
          <label>
            Tên hiển thị
            <input
              autoComplete="nickname"
              maxLength={24}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <fieldset className="avatar-picker">
            <legend>Người bạn đồng hành</legend>
            {(
              [
                ['dck', 'DCK', 'Áo đất · tĩnh tại'],
                ['lotus', 'Liên', 'Áo sen · nhẹ nhàng'],
                ['sage', 'Trúc', 'Áo rêu · thanh bình'],
              ] as const
            ).map(([id, title, desc]) => (
              <button
                type="button"
                key={id}
                aria-pressed={avatar === id}
                className={`avatar-option ${avatar === id ? 'selected' : ''}`}
                onClick={() => {
                  setAvatar(id);
                  void engine?.updateIdentity(name, game.color, id);
                }}
              >
                <span className={`avatar-portrait portrait-${id}`}>
                  <i />
                  <b />
                </span>
                <strong>{title}</strong>
                <small>{desc}</small>
                {avatar === id && <Check size={13} />}
              </button>
            ))}
          </fieldset>
          <div className="entry-tabs" role="group" aria-label="Cách tham gia">
            <button type="button" aria-pressed={mode === 'enter'} onClick={() => setMode('enter')}>
              Vào chùa
            </button>
            <button type="button" aria-pressed={mode === 'create'} onClick={() => setMode('create')}>
              Tạo phòng
            </button>
            <button type="button" aria-pressed={mode === 'invite'} onClick={() => setMode('invite')}>
              Cùng bạn bè
            </button>
          </div>
          {mode === 'create' && (
            <label>
              Quyền vào phòng
              <select value={privacy} onChange={(e) => setPrivacy(e.target.value as typeof privacy)}>
                <option value="private">Riêng tư — chỉ người có link mời</option>
                <option value="public">Công khai — xuất hiện trong danh sách</option>
              </select>
            </label>
          )}
          {mode === 'invite' && (
            <label>
              Liên kết mời
              <input
                type="text"
                placeholder="Dán link bạn bè gửi cho bạn"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                required
              />
            </label>
          )}
          {mode === 'enter' && (
            <div className="entry-room">
              <span className="status-dot live" />
              {game.room.invite ? <LockKeyhole size={14} /> : <Users size={14} />} Phòng {game.room.room}
            </div>
          )}
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary enter-button" disabled={busy || !game.ready || !name.trim()}>
            {busy ? 'Đang vào phòng…' : mode === 'create' ? 'Tạo phòng và bước vào' : 'Bước vào sân chùa'}
            <ArrowUpRight size={18} />
          </button>
        </form>
        <small className="entry-note">Không cần tài khoản · Âm thanh thiên nhiên khi vào chùa</small>
      </div>
      <div className="onboard-caption">
        <span>THIỀN VIỆN AN NHIÊN</span>
        <p>
          Một nơi để chậm lại.
          <br />
          Một người bạn để cùng hiện diện.
        </p>
      </div>
    </section>
  );
}

export function Social({ engine }: { engine: TempleEngine | null }) {
  const game = useGame(),
    [text, setText] = useState(''),
    [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const messages = game.messages.filter((m) => !game.blockedIds.includes(m.playerId));
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [game.messages.length, game.chatOpen]);
  const send = async () => {
    if (!text.trim() || !engine || sending) return;
    setSending(true);
    const ack = await engine.network.sendChat(text.trim());
    setSending(false);
    if (ack.ok) setText('');
    else toast(ack.error || 'Tin nhắn chưa gửi được.');
  };
  return (
    <>
      <div className="social-tools">
        <button
          className={game.chatOpen ? 'selected' : ''}
          aria-label="Trò chuyện"
          onClick={() => setState({ chatOpen: !game.chatOpen })}
        >
          <MessageCircle size={19} />
          <span>Trò chuyện</span>
        </button>
        <button
          aria-label="Người đang có mặt"
          onClick={() => setState({ panel: game.panel === 'people' ? null : 'people' })}
        >
          <Users size={19} />
          <span>{game.online} hiện diện</span>
        </button>
        <button
          aria-label="Túi hành trang"
          onClick={() => setState({ panel: game.panel === 'inventory' ? null : 'inventory' })}
        >
          <Footprints size={18} />
          <span>Hành trang</span>
        </button>
        <button aria-label="Vẫy tay" onClick={() => void engine?.emote('wave')}>
          <Hand size={19} />
          <span>Vẫy tay</span>
        </button>
      </div>
      {game.chatOpen && (
        <section className="chat-box" aria-label="Trò chuyện trong phòng">
          <header>
            <strong>Chuyện bên hiên</strong>
            <button aria-label="Đóng trò chuyện" onClick={() => setState({ chatOpen: false })}>
              <X size={16} />
            </button>
          </header>
          <label className="chat-toggle">
            <input
              type="checkbox"
              checked={game.chatEnabled}
              onChange={(e) => setState({ chatEnabled: e.target.checked })}
            />
            Nhận tin nhắn trong phòng
          </label>
          {game.chatEnabled ? (
            <>
              <div className="chat-messages" role="log" aria-live="polite">
                {!messages.length && <p className="chat-empty">Một lời chào nhẹ cũng đủ làm ngày ấm hơn.</p>}
                {messages.map((m) => (
                  <p key={m.id} className={m.playerId === game.selfId ? 'own' : ''}>
                    <strong>{m.name}</strong>
                    <span>{m.text}</span>
                  </p>
                ))}
                <div ref={end} />
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <input
                  aria-label="Tin nhắn"
                  maxLength={200}
                  placeholder="Gửi một lời an lành…"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <button
                  aria-label="Gửi tin nhắn"
                  disabled={sending || !text.trim() || game.status !== 'online'}
                >
                  <Send size={17} />
                </button>
              </form>
            </>
          ) : (
            <p className="chat-empty">Chat đã tắt trên thiết bị này.</p>
          )}
        </section>
      )}
    </>
  );
}

export function PeoplePanel({ engine }: { engine: TempleEngine | null }) {
  const game = useGame();
  const toggle = (key: 'blockedIds' | 'hiddenIds', id: string) =>
    setState({ [key]: game[key].includes(id) ? game[key].filter((p) => p !== id) : [...game[key], id] });
  return (
    <>
      <div className="panel-heading">
        <span className="tiny-overline">CÙNG HIỆN DIỆN</span>
        <h2>{game.online} người ở đây</h2>
        <p>Cùng phòng {game.room.room}. Ẩn và chặn chỉ áp dụng với bạn trong phiên này.</p>
      </div>
      <div className="people-list">
        {game.players.map((p) => (
          <div className="person-row" key={p.id}>
            <i style={{ background: p.color }} />
            <span>
              <strong>
                {p.name}
                {p.id === game.selfId ? ' (bạn)' : ''}
              </strong>
              <small>
                {
                  {
                    idle: 'Đang ngắm cảnh',
                    walk: 'Đang dạo bước',
                    run: 'Đang chạy',
                    sit: 'Đang ngồi thiền',
                    greet: 'Chắp tay',
                    bow: 'Đang lễ Phật',
                    pray: 'Đang cầu nguyện',
                    wave: 'Đang vẫy tay',
                  }[p.action]
                }
              </small>
            </span>
            {p.id !== game.selfId && (
              <>
                <button
                  aria-label={`Chào ${p.name}`}
                  title="Chắp tay chào mọi người"
                  onClick={() => void engine?.greet()}
                >
                  <Hand size={17} />
                </button>
                <button
                  aria-label={`${game.hiddenIds.includes(p.id) ? 'Hiện' : 'Ẩn'} ${p.name}`}
                  onClick={() => toggle('hiddenIds', p.id)}
                >
                  {game.hiddenIds.includes(p.id) ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
                <button
                  className={game.blockedIds.includes(p.id) ? 'selected' : ''}
                  aria-label={`${game.blockedIds.includes(p.id) ? 'Bỏ chặn' : 'Chặn'} ${p.name}`}
                  onClick={() => toggle('blockedIds', p.id)}
                >
                  <ShieldOff size={17} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

export function InventoryPanel({ engine }: { engine: TempleEngine | null }) {
  const game = useGame();
  return (
    <>
      <div className="panel-heading">
        <span className="tiny-overline">NHỮNG BƯỚC CHÂN NHẸ</span>
        <h2>Hành trang</h2>
        <p>Chọn nơi để đi đến. Nhấn E cạnh chuông hoặc hồ sen để cùng thỉnh chuông, thả đèn với mọi người.</p>
      </div>
      <div className="inventory-beads">
        <strong>108 hạt bồ đề</strong>
        <span>{game.beads} / 108 hạt đã lần</span>
        <button className="text-button" onClick={() => setState({ panel: 'beads' })}>
          Mở chuỗi hạt <ArrowUpRight size={15} />
        </button>
      </div>
      <div className="journey-list">
        {LANDMARKS.map((p, i) => (
          <button
            key={p.id}
            onClick={() => {
              setState({ panel: null });
              void engine?.navigate(p.x, p.z);
            }}
          >
            <span>{String(i + 1).padStart(2, '0')}</span>
            <strong>
              {p.name}
              <small>{game.visited.includes(p.id) ? 'Đã ghé thăm' : 'Chưa ghé thăm'}</small>
            </strong>
            {game.visited.includes(p.id) ? <Check size={17} /> : <ArrowUpRight size={17} />}
          </button>
        ))}
      </div>
      {game.worldEvents.length > 0 && (
        <div className="room-activities" role="log" aria-label="Hoạt động chung trong phòng">
          <strong>Khoảnh khắc cùng nhau</strong>
          {game.worldEvents.slice(-4).map((event) => (
            <p key={event.id}>
              {event.name} · {event.kind === 'bell' ? 'Thỉnh chuông' : 'Thả đèn hoa đăng'}
            </p>
          ))}
        </div>
      )}
    </>
  );
}

export function MiniMap({ engine }: { engine: TempleEngine | null }) {
  const game = useGame(),
    [expanded, setExpanded] = useState(false);
  return (
    <section className={`minimap ${expanded ? 'expanded' : ''}`} aria-label="Bản đồ khu chùa">
      <button className="minimap-heading" aria-label="Mở minimap" onClick={() => setExpanded(!expanded)}>
        <Map size={14} />
        <span>{expanded ? 'Thu bản đồ' : 'Khu chùa'}</span>
        <small>BẮC ↑</small>
      </button>
      <svg viewBox="-30 -24 60 56" role="img" aria-label="Vị trí trong khu chùa">
        <rect x="-29" y="-23" width="58" height="54" rx="6" fill="#d8dfca" />
        <path d="M0 28V8M-25 20H23M-23-15V20M21-14V20" stroke="#f4ebd9" strokeWidth="3" fill="none" />
        <rect x="-10" y="-13" width="20" height="22" rx="1" fill="#a78b68" />
        <path d="M-10-2H10M0-13V9" stroke="#e1ceb0" strokeWidth=".6" />
        <ellipse cx="14" cy="13" rx="5" ry="3.8" fill="#86afa6" />
        <rect x="17" y="-20" width="8" height="7" rx="1" fill="#a78b68" />
        <path d="M-25 17h3m3 8h3m3-8h3" stroke="#b88c55" strokeWidth="3" />
        <g
          className="map-destination"
          role="button"
          aria-label="Đi đến Tượng Phật"
          tabIndex={0}
          onClick={() => void engine?.navigate(0, -6.2)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void engine?.navigate(0, -6.2);
          }}
        >
          <circle cx="0" cy="-6.2" r="2" fill="transparent" />
          <circle cx="0" cy="-6.2" r=".9" fill="#c4a057" />
          {expanded && (
            <text x="0" y="-8.5" textAnchor="middle">
              Tượng Phật
            </text>
          )}
        </g>
        {LANDMARKS.map((p) => (
          <g
            key={p.id}
            className="map-destination"
            role="button"
            aria-label={`Đi đến ${p.name}`}
            tabIndex={0}
            onClick={() => void engine?.navigate(p.x, p.z)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void engine?.navigate(p.x, p.z);
            }}
          >
            <circle cx={p.x} cy={p.z} r="2.4" fill="transparent" />
            <circle cx={p.x} cy={p.z} r=".7" fill="#694f35" />
            {expanded && (
              <text x={p.x} y={p.z - 2.2} textAnchor="middle">
                {p.name}
              </text>
            )}
          </g>
        ))}
        {game.players
          .filter((p) => p.id !== game.selfId && !game.hiddenIds.includes(p.id))
          .map((p) => (
            <circle key={p.id} cx={p.x} cy={p.z} r=".85" fill="#f9f4e8" stroke="#806d56" strokeWidth=".3" />
          ))}
        <circle cx={game.x} cy={game.z} r="1.4" fill="#9d642c" stroke="#fff6dc" strokeWidth=".6" />
      </svg>
      {expanded && <p>Chạm địa điểm để tự đi đến · Chấm vàng là bạn</p>}
    </section>
  );
}

export function TouchControls({ engine }: { engine: TempleEngine | null }) {
  const game = useGame(),
    [stick, setStick] = useState({ x: 0, y: 0 }),
    [running, setRunning] = useState(false);
  const pointer = useRef<number | null>(null),
    pad = useRef<HTMLDivElement>(null);
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (pointer.current !== e.pointerId || !pad.current) return;
    const r = pad.current.getBoundingClientRect(),
      dx = (e.clientX - r.left - r.width / 2) / 36,
      dy = (r.top + r.height / 2 - e.clientY) / 36;
    const length = Math.max(1, Math.hypot(dx, dy));
    const x = dx / length,
      y = dy / length;
    setStick({ x, y });
    engine?.controller.setMoveInput(x, y, running);
  };
  const stop = () => {
    pointer.current = null;
    setStick({ x: 0, y: 0 });
    engine?.controller.setMoveInput(0, 0);
  };
  useEffect(
    () => () => {
      engine?.controller.setMoveInput(0, 0);
    },
    [engine],
  );
  return (
    <div className="touch-controls">
      <div
        className="joystick"
        ref={pad}
        role="group"
        aria-label="Cần di chuyển cảm ứng"
        onPointerDown={(e) => {
          pointer.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          move(e);
        }}
        onPointerMove={move}
        onPointerUp={stop}
        onPointerCancel={stop}
        onLostPointerCapture={stop}
      >
        <span style={{ transform: `translate(${stick.x * 29}px,${-stick.y * 29}px)` }} />
        <i>DI CHUYỂN</i>
      </div>
      <div className="touch-actions">
        <button
          aria-label="Chạy cảm ứng"
          aria-pressed={running}
          onClick={() => {
            setRunning(!running);
            engine?.controller.setMoveInput(stick.x, stick.y, !running);
          }}
        >
          Chạy
        </button>
        <button aria-label="Tương tác cảm ứng" onClick={() => void engine?.interact()}>
          {game.interaction || 'Tương tác'}
        </button>
      </div>
    </div>
  );
}
