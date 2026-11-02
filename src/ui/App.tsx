import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  DoorOpen,
  Expand,
  Footprints,
  Hand,
  Leaf,
  Link,
  MapPin,
  Maximize2,
  Minimize2,
  Music2,
  RotateCcw,
  Settings2,
  Share2,
  Sparkles,
  Volume2,
  VolumeX,
  Wind,
  X,
  Users,
  Bell,
  Bird,
  Circle,
  Pause,
  Play,
} from 'lucide-react';
import type { TempleEngine } from '../scene/engine';
import { Onboarding, Social, PeoplePanel, InventoryPanel, MiniMap, TouchControls } from './Experience';
import { getState, setState, toast, useGame, type Panel } from '../state';
import type { RoomInfo } from '../../shared/world';

function Lotus({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M32 45C16 37 24 21 32 12c8 9 16 25 0 33Z" />
      <path d="M32 45C14 48 10 34 9 26c11 0 18 5 23 19Zm0 0c18 3 22-11 23-19-11 0-18 5-23 19Z" />
      <path d="M15 51q17 9 34 0" />
    </svg>
  );
}
const roomNames: Record<string, string> = {
  'an-nhien': 'An Nhiên',
  'truc-lam': 'Trúc Lâm',
  'tinh-tam': 'Tĩnh Tâm',
};
function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
function IconButton({
  label,
  children,
  onClick,
  active = false,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      className={`icon-button ${active ? 'active' : ''}`}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

export default function App() {
  const host = useRef<HTMLDivElement>(null),
    engine = useRef<TempleEngine | null>(null),
    game = useGame();
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled || !host.current) return;
      try {
        setState({ loading: 5, loadingLabel: 'Đang tải bộ dựng cảnh' });
        const { TempleEngine } = await import('../scene/engine');
        await document.fonts.ready;
        if (cancelled || !host.current) return;
        setState({ loading: 20, loadingLabel: 'Đã tải mã và phông chữ' });
        engine.current = new TempleEngine(host.current);
      } catch (err) {
        console.error(err);
        setState({
          error: 'Không thể khởi tạo cảnh 3D. Hãy bật tăng tốc đồ họa trong trình duyệt rồi tải lại trang.',
        });
      }
    }, 50);
    const onFull = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFull);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      engine.current?.dispose();
      engine.current = null;
      document.removeEventListener('fullscreenchange', onFull);
    };
  }, []);
  const toggle = (panel: Panel) => setState({ panel: game.panel === panel ? null : panel });
  const full = () => {
    const p = document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen?.();
    p?.catch(() => toast('Trình duyệt này chưa hỗ trợ chế độ toàn màn hình.'));
  };
  const share = async () => {
    const url = engine.current?.inviteLink() || location.href;
    try {
      await navigator.clipboard.writeText(url);
      toast('Đã sao chép đường dẫn phòng.');
    } catch {
      setState({ panel: 'rooms' });
      toast('Chọn và sao chép liên kết trong bảng phòng.');
    }
  };
  return (
    <main className={`temple-app ${game.joined ? 'in-world' : 'in-lobby'}`}>
      <div className="scene-host" ref={host} />
      <div className="vignette" />
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            engine.current?.resetCamera();
          }}
          aria-label="An Nhiên — đưa góc nhìn về ban đầu"
        >
          <span className="brand-symbol">
            <Lotus size={38} />
          </span>
          <span>
            <strong>
              sansa<span className="brand-dot">.</span>
            </strong>
            <small>ZEN GARDEN · AN NHIÊN</small>
          </span>
        </a>
        <div className="room-pill">
          <button onClick={() => toggle('rooms')} aria-label="Chọn phòng">
            <span className={`status-dot ${game.status === 'online' ? 'live' : ''}`} />
            <span>{roomNames[game.room.room] || game.room.room}</span>
            <ChevronDown size={14} />
          </button>
          <span className="pill-divider" />
          <span className="room-count">
            <Users size={14} />
            {game.status === 'online'
              ? `${game.online} / ${game.room.capacity}`
              : game.status === 'connecting'
                ? 'Đang kết nối'
                : 'Mất kết nối'}
          </span>
        </div>
        <div className="top-actions">
          <IconButton label="Chia sẻ phòng" onClick={share}>
            <Share2 size={18} />
          </IconButton>
          <IconButton label="Hướng dẫn" onClick={() => toggle('help')} active={game.panel === 'help'}>
            <CircleHelp size={19} />
          </IconButton>
          <IconButton label="Cài đặt" onClick={() => toggle('settings')} active={game.panel === 'settings'}>
            <Settings2 size={19} />
          </IconButton>
          <IconButton label={fullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'} onClick={full}>
            {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </IconButton>
        </div>
      </header>
      <section className={`intro ${game.started ? 'quiet' : ''}`} aria-label="Lời chào">
        <div className="eyebrow">
          <span />
          MỘT KHOẢNG LẶNG CHO TÂM
        </div>
        <h1>
          Trở về
          <br />
          với <em>an nhiên.</em>
        </h1>
        <p>
          Bỏ lại những vội vàng.
          <br />
          Chỉ cần có mặt, và thở.
        </p>
        <div className="weather">
          <Leaf size={13} />
          <span>Nắng nhẹ</span>
          <i>·</i>
          <Wind size={14} />
          <span>Gió êm</span>
        </div>
      </section>
      <div className="toast" role="status" aria-live="polite" data-visible={!!game.toast}>
        <Lotus size={22} />
        {game.toast}
      </div>
      {game.status === 'offline' && (
        <div className="offline-note">
          <span className="status-dot" />
          Mất kết nối · Đang thử kết nối lại
        </div>
      )}
      {false && !game.started && game.ready && !game.panel && (
        <div className="welcome-card">
          <span className="tiny-overline">CHÀO BẠN, {game.name.toLocaleUpperCase('vi')}</span>
          <p>
            Một bước chân nhẹ.
            <br />
            Một ngày bình yên hơn.
          </p>
          <button className="primary" onClick={() => void engine.current?.enter()}>
            Bước vào sân chùa <ArrowUpRight size={17} />
          </button>
          <small>Âm thanh thiên nhiên sẽ được bật</small>
        </div>
      )}
      {game.seated && !game.panel && (
        <section className="meditation-card">
          <div className="breath-orbit">
            <Lotus size={34} />
          </div>
          <span className="tiny-overline">TRỞ VỀ VỚI HƠI THỞ</span>
          <h2>Hít vào. Thở ra.</h2>
          <p>Không cần vội. Bạn đang ở đây.</p>
          <strong className="timer">{formatTime(game.meditationSeconds)}</strong>
          <button className="text-button" onClick={() => void engine.current?.stand()}>
            Đứng dậy <ArrowUpRight size={14} />
          </button>
        </section>
      )}
      {(game.bows > 0 || game.action === 'bow') && game.panel !== 'beads' && (
        <div className="bow-progress">
          <span className="tiny-overline">108 LỄ AN LÀNH</span>
          <strong>
            {game.bows}
            <span>/108</span>
          </strong>
          <div className="progress-track">
            <i style={{ width: `${(game.bows / 108) * 100}%` }} />
          </div>
          <span>
            {game.action === 'bow'
              ? game.bowRunning
                ? 'Đang lễ Phật'
                : 'Dừng sau lượt này'
              : 'Đã hoàn tất lượt hiện tại'}
          </span>
        </div>
      )}
      {game.panel && (
        <aside
          className={`side-panel panel-${game.panel}`}
          aria-label={
            {
              rooms: 'Các phòng thiền',
              audio: 'Âm thanh',
              beads: 'Chuỗi 108 hạt',
              settings: 'Cài đặt',
              help: 'Hướng dẫn',
              people: 'Người đang có mặt',
              inventory: 'Hành trang',
            }[game.panel]
          }
        >
          <button className="panel-close" aria-label="Đóng bảng" onClick={() => setState({ panel: null })}>
            <X size={19} />
          </button>
          {game.panel === 'rooms' ? (
            <RoomPanel engine={engine.current} share={share} />
          ) : game.panel === 'audio' ? (
            <AudioPanel engine={engine.current} />
          ) : game.panel === 'beads' ? (
            <BeadsPanel engine={engine.current} />
          ) : game.panel === 'settings' ? (
            <SettingsPanel engine={engine.current} />
          ) : game.panel === 'people' ? (
            <PeoplePanel engine={engine.current} />
          ) : game.panel === 'inventory' ? (
            <InventoryPanel engine={engine.current} />
          ) : (
            <HelpPanel />
          )}
        </aside>
      )}
      <div className="bottom-left legacy-location">
        <button className="location-label" onClick={() => void engine.current?.navigate(0, 14)}>
          <MapPin size={15} />
          <span>
            {Math.abs(game.x) < 10.5 && game.z < 9 ? 'Chính điện' : 'Sân chùa'}
            <small>THIỀN VIỆN AN NHIÊN</small>
          </span>
        </button>
        <div className="compass" title="Phía tượng Phật là hướng Bắc">
          N<span>⌖</span>
        </div>
      </div>
      <div className="bottom-center">
        <div className="control-hint">
          <span>W A S D</span> bước đi <i>·</i> <span>SHIFT</span> chạy <i>·</i> <span>E / F</span> tương tác{' '}
          <i>·</i> Kéo để nhìn
        </div>
        <nav className="action-bar" aria-label="Thực hành">
          <ActionButton
            label={game.seated ? 'Đứng dậy' : game.pendingSeat ? 'Đang đến…' : 'Ngồi thiền'}
            active={!!game.seated || !!game.pendingSeat}
            onClick={() => void engine.current?.meditate()}
            icon={<Lotus size={27} />}
          />
          <ActionButton
            label={game.action === 'bow' ? (game.bowRunning ? 'Dừng lễ' : 'Tiếp tục') : 'Lễ Phật'}
            active={game.action === 'bow'}
            onClick={() => void engine.current?.bow()}
            icon={
              game.action === 'bow' ? game.bowRunning ? <Pause size={22} /> : <Play size={22} /> : <BowIcon />
            }
          />
          <ActionButton
            label="Chắp tay"
            active={game.action === 'greet'}
            onClick={() => void engine.current?.greet()}
            icon={<Hand size={23} />}
          />
          <span className="action-divider" />
          <ActionButton
            label="Chuỗi hạt"
            active={game.panel === 'beads'}
            onClick={() => toggle('beads')}
            icon={<BeadsIcon />}
          />
          <ActionButton
            label="Âm thanh"
            active={game.panel === 'audio'}
            onClick={() => toggle('audio')}
            icon={game.sound ? <Volume2 size={23} /> : <VolumeX size={23} />}
          />
        </nav>
        <div className="bottom-caption">
          <span />Ở đây, chỉ có giây phút này.
        </div>
      </div>
      {game.joined && (
        <>
          <MiniMap engine={engine.current} />
          <Social engine={engine.current} />
          <TouchControls engine={engine.current} />
          {game.interaction && (
            <button className="interaction-prompt" onClick={() => void engine.current?.interact()}>
              <kbd>E</kbd>
              {game.interaction}
            </button>
          )}
        </>
      )}
      {!game.joined && game.ready && <Onboarding engine={engine.current} />}
      <div className="bottom-right">
        <button
          className="view-button"
          onClick={() => engine.current?.resetCamera()}
          title="Đưa camera về góc ban đầu"
        >
          <Expand size={17} />
          <span>Góc nhìn</span>
        </button>
        <small>AN NHIÊN · MỘT CHỐN ĐỂ TRỞ VỀ</small>
      </div>
      {!game.ready && !game.error && (
        <div className="loading-screen">
          <Lotus size={76} />
          <h2>sansa.</h2>
          <p>{game.loadingLabel}</p>
          <div className="loading-track">
            <i style={{ width: `${game.loading}%` }} />
          </div>
          <small>{game.loading}%</small>
        </div>
      )}
      {game.error && (
        <div className="error-screen" role="alert">
          <Lotus size={50} />
          <h2>Một chút gián đoạn</h2>
          <p>{game.error}</p>
          <button className="primary" onClick={() => location.reload()}>
            Tải lại trang <RotateCcw size={17} />
          </button>
        </div>
      )}
    </main>
  );
}
function ActionButton({
  label,
  icon,
  onClick,
  active,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button className={`action-button ${active ? 'selected' : ''}`} onClick={onClick} aria-pressed={!!active}>
      <span className="action-icon">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
function BowIcon() {
  return (
    <svg
      width="27"
      height="27"
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="22" cy="8" r="3" />
      <path d="m18 11-7 7 6 5h8M18 11l3 7 7 2M11 18l-4 9H3m14-4-1 4H9" />
    </svg>
  );
}
function BeadsIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5">
      {Array.from({ length: 12 }, (_, i) => (
        <circle
          key={i}
          cx={16 + 10 * Math.sin((i * Math.PI) / 6)}
          cy={14 + 10 * Math.cos((i * Math.PI) / 6)}
          r="2"
        />
      ))}
      <path d="m15 26-2 5m4-5 2 5" />
    </svg>
  );
}
function PanelHeading({
  kicker,
  title,
  description,
}: {
  kicker: string;
  title: string;
  description: string;
}) {
  return (
    <div className="panel-heading">
      <span className="tiny-overline">{kicker}</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
function RoomPanel({ engine, share }: { engine: TempleEngine | null; share: () => void }) {
  const game = useGame();
  const [rooms, setRooms] = useState<RoomInfo[]>([]),
    [error, setError] = useState(''),
    [custom, setCustom] = useState(''),
    [instance, setInstance] = useState(game.room.instance),
    [region, setRegion] = useState(game.room.region),
    [joining, setJoining] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    const refresh = () =>
      fetch(`/api/rooms?region=${encodeURIComponent(region)}`, { signal: abort.signal })
        .then((r) => {
          if (!r.ok) throw Error();
          return r.json();
        })
        .then((data) => {
          setRooms(data);
          setError('');
        })
        .catch((e) => {
          if (e.name !== 'AbortError') setError('Chưa lấy được danh sách phòng từ máy chủ.');
        });
    void refresh();
    const timer = setInterval(refresh, 4000);
    return () => {
      abort.abort();
      clearInterval(timer);
    };
  }, [region]);
  const join = async (room: string, inst: number, reg: string) => {
    setJoining(true);
    await engine?.changeRoom({ room, instance: inst, region: reg });
    setJoining(false);
  };
  const shareLink = engine?.inviteLink() || location.href;
  return (
    <>
      <PanelHeading
        kicker="CÙNG NHAU HIỆN DIỆN"
        title="Một chốn an lành"
        description="Chọn một phòng, mời một người bạn cùng ngồi lại."
      />
      <div className="room-list">
        {rooms.map((room, i) => (
          <button
            key={room.key}
            className={`room-card ${room.key === game.room.key ? 'current' : ''}`}
            disabled={joining || (room.count >= room.capacity && room.key !== game.room.key)}
            onClick={() => void join(room.room, room.instance, room.region)}
          >
            <span className={`room-art art-${i % 3}`}>
              <Lotus size={30} />
            </span>
            <span>
              <strong>{roomNames[room.room] || room.room}</strong>
              <small>
                {room.instance > 0 ? `Nhánh ${room.instance} · ` : ''}
                {room.count}/{room.capacity} người đang có mặt
              </small>
            </span>
            {room.key === game.room.key ? <Check size={17} /> : <ArrowUpRight size={17} />}
          </button>
        ))}
      </div>
      {error && <p className="inline-error">{error}</p>}
      <form
        className="custom-room"
        onSubmit={(e) => {
          e.preventDefault();
          if (custom) void join(custom, instance, region);
        }}
      >
        <label>
          Vào phòng công khai theo tên
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
            placeholder="Ví dụ: sen-hong"
            maxLength={40}
          />
        </label>
        <div className="form-row">
          <label>
            Nhánh
            <input
              aria-label="Nhánh phòng"
              type="number"
              min={0}
              max={999}
              value={instance}
              onChange={(e) => setInstance(Math.max(0, Math.min(999, Number(e.target.value))))}
            />
          </label>
          <label>
            Nhóm vùng
            <select value={region} onChange={(e) => setRegion(e.target.value)}>
              {Array.from(new Set(['apac', 'eu', 'us', game.room.region])).map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
        </div>
        <button className="primary" disabled={!custom || joining}>
          Vào phòng <DoorOpen size={16} />
        </button>
      </form>
      <div className="room-management">
        <button className="secondary" disabled={joining} onClick={() => void engine?.createRoom('private')}>
          Tạo phòng riêng có link mời
        </button>
        <button
          className="text-button"
          onClick={() => void engine?.changeRoom({ room: 'an-nhien', instance: 0, region: 'apac' })}
        >
          Trở về phòng chính
        </button>
        <button className="text-button" onClick={() => void engine?.leave()}>
          Rời chùa · về màn hình chào
        </button>
      </div>
      <div className="share-box">
        <label>
          Liên kết phòng hiện tại
          <input readOnly value={shareLink.toString()} onFocus={(e) => e.target.select()} />
        </label>
        <button className="text-button" onClick={share}>
          <Link size={15} /> Sao chép liên kết
        </button>
      </div>
      <p className="footnote">
        Nhóm vùng phân tách các phòng trên máy chủ hiện tại; chưa phải máy chủ đặt tại từng vùng địa lý.
      </p>
    </>
  );
}
const channels = [
  ['wind', 'Gió qua tán lá', Wind],
  ['birds', 'Tiếng chim trong vườn', Bird],
  ['bell', 'Chuông chùa', Bell],
  ['wood', 'Nhịp mõ nhẹ', Circle],
  ['music', 'Giai điệu thiền', Music2],
] as const;
function AudioPanel({ engine }: { engine: TempleEngine | null }) {
  const game = useGame();
  return (
    <>
      <PanelHeading
        kicker="LẮNG NGHE KHOẢNG LẶNG"
        title="Thanh âm an lành"
        description="Một chút thiên nhiên, vừa đủ để trở về."
      />
      <button
        className={`sound-master ${game.sound ? 'on' : ''}`}
        onClick={() => engine?.setSound(!game.sound)}
      >
        {game.sound ? <Volume2 size={23} /> : <VolumeX size={23} />}
        <span>{game.sound ? 'Âm thanh đang bật' : 'Bật âm thanh'}</span>
        <span className={`switch ${game.sound ? 'on' : ''}`} />
      </button>
      <label className="volume-label">
        Âm lượng <span>{Math.round(game.volume * 100)}%</span>
        <input
          aria-label="Âm lượng"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={game.volume}
          onChange={(e) => engine?.setVolume(Number(e.target.value))}
        />
      </label>
      <div className="channel-list">
        {channels.map(([id, label, Icon]) => (
          <button
            key={id}
            className="channel"
            aria-pressed={game.channels[id]}
            onClick={() => engine?.toggleChannel(id)}
          >
            <Icon size={18} />
            <span>{label}</span>
            <span className={`switch ${game.channels[id] ? 'on' : ''}`} />
          </button>
        ))}
      </div>
      <button className="text-button" disabled={!game.sound} onClick={() => engine?.audio.bell()}>
        <Bell size={16} /> Thỉnh một tiếng chuông
      </button>
      <p className="footnote">Âm thanh được tổng hợp riêng cho An Nhiên. Không sử dụng bản ghi tụng kinh.</p>
    </>
  );
}
function BeadsPanel({ engine }: { engine: TempleEngine | null }) {
  const game = useGame();
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const [pulse, setPulse] = useState(0);
  const next = () => {
    engine?.nextBead();
    setPulse((n) => n + 1);
  };
  return (
    <>
      <PanelHeading
        kicker="MỖI HẠT, MỘT NIỆM AN LÀNH"
        title="Chuỗi 108 hạt"
        description="Chạm hoặc vuốt trên chuỗi. Nhẹ nhàng từng hạt một."
      />
      <div
        className={`bead-board ${game.beads === 108 ? 'complete' : ''}`}
        role="button"
        tabIndex={0}
        aria-label="Lần thêm một hạt"
        onKeyDown={(e) => {
          if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
            e.preventDefault();
            next();
          }
        }}
        onPointerDown={(e) => {
          start.current = { x: e.clientX, y: e.clientY };
          swiped.current = false;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 30) {
            next();
            swiped.current = true;
            start.current = { x: e.clientX, y: e.clientY };
          }
        }}
        onPointerUp={() => {
          if (start.current && !swiped.current) next();
          start.current = null;
        }}
        onPointerCancel={() => {
          start.current = null;
        }}
      >
        <svg viewBox="0 0 320 300" aria-hidden="true">
          <defs>
            <radialGradient id="bead">
              <stop offset="0" stopColor="#d7b888" />
              <stop offset=".6" stopColor="#a58050" />
              <stop offset="1" stopColor="#79603c" />
            </radialGradient>
            <radialGradient id="counted">
              <stop offset="0" stopColor="#a6b88c" />
              <stop offset="1" stopColor="#536b49" />
            </radialGradient>
          </defs>
          <ellipse cx="160" cy="140" rx="125" ry="113" fill="none" stroke="#c3b397" strokeWidth="1" />
          {Array.from({ length: 108 }, (_, i) => {
            const angle = (i / 108) * Math.PI * 2 + Math.PI / 2;
            return (
              <circle
                key={i}
                cx={160 + 125 * Math.cos(angle)}
                cy={140 + 113 * Math.sin(angle)}
                r={i === game.beads ? 5.2 : 3.55}
                fill={i < game.beads ? 'url(#counted)' : 'url(#bead)'}
                stroke={i === game.beads ? '#4e6542' : '#f0e9db'}
                strokeWidth={i === game.beads ? 1.6 : 0.6}
              />
            );
          })}
          <circle cx="160" cy="258" r="7" fill="url(#bead)" />
          <path
            d="M160 265v12m-2-6-4 17m8-17 4 17m-6-16v20"
            stroke="#b79461"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <div className="bead-number" key={pulse}>
          <Lotus size={28} />
          <strong>{game.beads.toString().padStart(2, '0')}</strong>
          <span>TRÊN 108 HẠT</span>
        </div>
      </div>
      <div className="bead-status">
        {game.beads === 108 ? (
          <>
            <Sparkles size={16} /> Trọn một vòng. Tâm thêm an.
          </>
        ) : (
          'Hít vào an tĩnh · Thở ra nhẹ nhàng'
        )}
      </div>
      <button className="primary" disabled={game.beads === 108} onClick={next}>
        Lần một hạt <BeadsIcon />
      </button>
      <button className="text-button centered" onClick={() => engine?.resetBeads()}>
        <RotateCcw size={14} /> Bắt đầu vòng mới
      </button>
    </>
  );
}
function SettingsPanel({ engine }: { engine: TempleEngine | null }) {
  const game = useGame();
  const [name, setName] = useState(game.name),
    [color, setColor] = useState(game.color);
  return (
    <>
      <PanelHeading
        kicker="THEO CÁCH CỦA BẠN"
        title="Một chút riêng mình"
        description="Tên gọi nhẹ nhàng, một màu áo yêu thích."
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void engine?.updateIdentity(name.trim() || 'Mây an nhiên', color);
          toast('Đã cập nhật tên và màu áo.');
        }}
      >
        <label>
          Tên trong sân chùa
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={28} required />
        </label>
        <label className="color-label">
          Màu áo
          <div className="robe-colors">
            {['#c88943', '#9f654c', '#7d8b65', '#82718c', '#668d91'].map((c) => (
              <button
                type="button"
                key={c}
                aria-label={`Màu áo ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                style={{ background: c }}
              >
                {color === c && <Check size={19} />}
              </button>
            ))}
          </div>
        </label>
        <button className="primary">
          Lưu thay đổi <Check size={17} />
        </button>
      </form>
      <div className="setting-section">
        <label>
          Chất lượng hình ảnh
          <select
            value={game.quality}
            onChange={(e) => engine?.setQuality(e.target.value as 'auto' | 'high' | 'medium' | 'low')}
          >
            <option value="auto">Tự động theo thiết bị</option>
            <option value="high">Cao · Bóng đổ mềm</option>
            <option value="medium">Vừa · Cân bằng</option>
            <option value="low">Nhẹ · Tiết kiệm tài nguyên</option>
          </select>
        </label>
        <button className="text-button" onClick={() => engine?.resetCamera()}>
          <RotateCcw size={15} /> Khôi phục góc nhìn
        </button>
      </div>
      <p className="footnote">
        Đo tại trình duyệt: {game.fps} khung hình/giây · {game.drawCalls} lệnh vẽ/khung. Kết quả thay đổi theo
        thiết bị và góc nhìn.
      </p>
      <p className="footnote">
        Tên, màu áo và chất lượng được lưu trên thiết bị này. Tiến trình thực hành bắt đầu lại khi tải lại
        trang.
      </p>
    </>
  );
}
function HelpPanel() {
  return (
    <>
      <PanelHeading
        kicker="CỨ THẬT CHẬM THÔI"
        title="Dạo bước trong chùa"
        description="Không có đích đến. Chỉ có những bước chân bình yên."
      />
      <div className="help-list">
        <div>
          <Footprints size={20} />
          <span>
            <strong>Đi một chút</strong>
            <p>
              WASD hoặc phím mũi tên. Giữ Shift để chạy. Trên điện thoại, dùng cần cảm ứng; nút Chạy bật/tắt
              chạy.
            </p>
          </span>
        </div>
        <div>
          <Expand size={20} />
          <span>
            <strong>Nhìn quanh</strong>
            <p>Kéo chuột hoặc vuốt để xoay. Cuộn chuột hoặc chụm hai ngón tay để phóng to, thu nhỏ.</p>
          </span>
        </div>
        <div>
          <Lotus size={23} />
          <span>
            <strong>Ngồi lại</strong>
            <p>
              Nhấn E hoặc F gần bồ đoàn trống để ngồi. Nhấn E trước tượng Phật để cầu nguyện, nhấn lại để kết
              thúc. Bạn cũng có thể chọn Ngồi thiền để tự đi đến.
            </p>
          </span>
        </div>
        <div>
          <BowIcon />
          <span>
            <strong>Lễ Phật & chắp tay</strong>
            <p>Mỗi lượt lễ hoàn chỉnh được tính một lần. Dừng sẽ kết thúc lượt đang thực hiện rồi nghỉ.</p>
          </span>
        </div>
        <div>
          <Users size={20} />
          <span>
            <strong>Cùng hiện diện</strong>
            <p>
              Chia sẻ cùng đường dẫn phòng để thấy nhau khi máy chủ đang kết nối. Bồ đoàn được giữ riêng cho
              người đã ngồi.
            </p>
          </span>
        </div>
      </div>
      <div className="help-quote">
        “Một hơi thở sâu,
        <br />
        một khoảng trời rộng.”
      </div>
    </>
  );
}
