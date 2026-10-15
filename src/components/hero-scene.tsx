import { createContext, useContext, useId, useLayoutEffect, useRef } from "react";

/**
 * The living picture along the top of every page. It is one long stretch of countryside with a place for each page,
 * in the same order as the menu: home (Overview), the market street (Tasks), the town square (Calendar), the park
 * (Family), the library (Knowledge) and the post office (Activity). Switching pages is a drone shot: the camera
 * lifts to take in more of the countryside, flies along to the new page's place, and settles down onto it. The far
 * hills shrink less than the near ground as it climbs, which gives the depth. The dog stays at home in the garden,
 * and birds, clouds, ducks, washing and butterflies keep it all alive; in dark mode it is night.
 */

const HEIGHT = 140;
// Where each page's place is along the landscape, in the menu's order.
// Room either side of the first and last places, so the view still fills the header from high up.
const LEAD = 1800;
const SPACING = 900;
export const SCENE_COUNT = 6;
const sceneX = (index: number) => LEAD + index * SPACING;
const LENGTH = sceneX(SCENE_COUNT - 1) + 1300;
// The far hills move this much for each step of the near ground.
const FAR_FACTOR = 0.45;
const FAR_OFFSET = 1200;
const FAR_LENGTH = 4600;

const TAU = Math.PI * 2;
const groundY = (x: number) => 84 + 5 * Math.sin((TAU * x) / 600) + 3 * Math.sin((TAU * x) / 240);
const farY = (x: number) => 62 + 14 * Math.sin((TAU * x) / 1200 + 1) + 6 * Math.sin((TAU * x) / 400);

function wavePath(width: number, y: (x: number) => number) {
  const points: string[] = [];
  for (let x = 0; x <= width; x += 20) points.push(`${x},${y(x).toFixed(1)}`);
  return `M0,${HEIGHT} L${points.join(" L")} L${width},${HEIGHT} Z`;
}
const nearGround = wavePath(LENGTH, groundY);
const farHills = wavePath(FAR_LENGTH, farY);

export const wood = "#8a6a4f";
export const leaf = "color-mix(in srgb, var(--sage) 78%, #1f3a26)";
export const leafLight = "color-mix(in srgb, var(--sage) 92%, white)";

/** The shape of the ground the parts below stand on: the countryside's by default, or another scene's. */
export const GroundContext = createContext<(x: number) => number>(groundY);

/** Something standing on the ground at `x`. */
export function At({ x, children }: { x: number; children: React.ReactNode }) {
  const ground = useContext(GroundContext);
  return <g transform={`translate(${x},${ground(x).toFixed(1)})`}>{children}</g>;
}

export function Tree({ x, size = 1, delay = 0 }: { x: number; size?: number; delay?: number }) {
  return (
    <At x={x}>
      <g transform={`scale(${size})`}>
        <rect x={-3} y={-26} width={6} height={28} rx={2} fill={wood} />
        <g className="scene-sway" style={{ animationDelay: `${delay}s` }}>
          <circle cx={0} cy={-38} r={16} fill={leaf} />
          <circle cx={-11} cy={-28} r={11} fill={leaf} />
          <circle cx={11} cy={-29} r={12} fill={leaf} />
          <circle cx={-4} cy={-44} r={7} fill={leafLight} opacity={0.5} />
        </g>
      </g>
    </At>
  );
}

export function Flowers({ x, colours }: { x: number; colours: string[] }) {
  return (
    <At x={x}>
      {colours.map((colour, index) => (
        <g key={index} transform={`translate(${index * 9},0)`}>
          <path d={`M0,2 L0,-${8 + (index % 2) * 4}`} stroke={leaf} strokeWidth={1.5} />
          <circle cx={0} cy={-(9 + (index % 2) * 4)} r={3} fill={colour} />
        </g>
      ))}
    </At>
  );
}

export function Window({ x, y, size = 12 }: { x: number; y: number; size?: number }) {
  return <rect className="scene-window" x={x} y={y} width={size} height={size} rx={2} />;
}

function Home({ x }: { x: number }) {
  return (
    <At x={x}>
      <g className="scene-smoke" aria-hidden="true">
        <circle cx={60} cy={-80} r={4} /><circle cx={60} cy={-80} r={4} /><circle cx={60} cy={-80} r={4} />
      </g>
      <rect x={54} y={-76} width={9} height={18} fill="var(--accent-foreground)" />
      <rect x={0} y={-46} width={76} height={48} rx={4} fill="var(--card)" />
      <path d="M-8,-42 L38,-80 L84,-42 Z" fill="var(--primary)" />
      <rect x={31} y={-26} width={14} height={28} rx={2} fill="var(--mustard)" />
      <Window x={9} y={-36} />
      <Window x={55} y={-36} />
    </At>
  );
}

export function Fence({ x, length }: { x: number; length: number }) {
  const ground = useContext(GroundContext);
  const posts = Array.from({ length: Math.floor(length / 13) + 1 }, (_unused, index) => index * 13);
  return (
    <g>
      {posts.map((post) => (
        <At key={post} x={x + post}><rect x={-1.5} y={-16} width={3} height={17} rx={1} fill="var(--card)" opacity={0.9} /></At>
      ))}
      <path d={`M${x},${ground(x) - 11} L${x + length},${ground(x + length) - 11} M${x},${ground(x) - 5} L${x + length},${ground(x + length) - 5}`} stroke="var(--card)" strokeWidth={2} opacity={0.9} />
    </g>
  );
}

function WashingLine({ x }: { x: number }) {
  const shirts = [["var(--sky)", 16], ["var(--mustard)", 38], ["var(--plum)", 60]] as const;
  return (
    <At x={x}>
      <rect x={-1.5} y={-40} width={3} height={42} fill={wood} />
      <rect x={78.5} y={-40} width={3} height={42} fill={wood} />
      <path d="M0,-38 Q40,-30 80,-38" stroke="var(--card)" strokeWidth={1} fill="none" />
      {shirts.map(([colour, left], index) => (
        <g key={index} transform={`translate(${left},-34)`}>
          <g className="scene-swing" style={{ animationDelay: `${index * 0.4}s` }}>
            <path d="M-7,0 L7,0 L10,5 L6,6 L6,16 L-6,16 L-6,6 L-10,5 Z" fill={colour} />
          </g>
        </g>
      ))}
    </At>
  );
}

function Pond({ x }: { x: number }) {
  return (
    <At x={x}>
      <ellipse cx={80} cy={4} rx={86} ry={11} fill="color-mix(in srgb, var(--sky) 75%, white)" />
      <path d="M30,4 h22 M96,7 h26 M60,9 h14" stroke="white" strokeWidth={1.5} strokeLinecap="round" opacity={0.6} />
      {[50, 104].map((left, index) => (
        <g key={left} transform={`translate(${left},0)`}>
          <g className="scene-bob" style={{ animationDelay: `${index * 0.9}s` }}>
            <ellipse cx={0} cy={-2} rx={8} ry={5} fill="#fffdf8" />
            <circle cx={6} cy={-8} r={4} fill="#fffdf8" />
            <path d="M9,-8 l4,1 l-4,1 z" fill="var(--mustard)" />
            <circle cx={7} cy={-9} r={0.8} fill="#2d241c" />
          </g>
        </g>
      ))}
    </At>
  );
}

function Bench({ x }: { x: number }) {
  return (
    <At x={x}>
      <rect x={0} y={-14} width={34} height={4} rx={1} fill={wood} />
      <rect x={0} y={-22} width={34} height={3} rx={1} fill={wood} />
      <rect x={3} y={-12} width={3} height={13} fill={wood} />
      <rect x={28} y={-12} width={3} height={13} fill={wood} />
    </At>
  );
}

export function Butterflies({ x }: { x: number }) {
  return (
    <At x={x}>
      {[0, 1].map((index) => (
        <g key={index} transform={`translate(${index * 22},${-30 - index * 10})`}>
          <g className="scene-flutter" style={{ animationDelay: `${index * 1.3}s` }}>
            <g className="scene-wings">
              <ellipse cx={-3} cy={0} rx={3.5} ry={2.6} fill={index ? "var(--mustard)" : "var(--rose)"} />
              <ellipse cx={3} cy={0} rx={3.5} ry={2.6} fill={index ? "var(--mustard)" : "var(--rose)"} />
            </g>
          </g>
        </g>
      ))}
    </At>
  );
}

function Shop({ x, awning }: { x: number; awning: string }) {
  return (
    <At x={x}>
      <rect x={0} y={-50} width={64} height={52} rx={3} fill="var(--card)" />
      <rect x={-3} y={-54} width={70} height={6} rx={2} fill={awning} />
      {Array.from({ length: 5 }, (_unused, index) => (
        <path key={index} d={`M${-3 + index * 14},-48 h14 v8 a7,7 0 0 1 -14,0 z`} fill={index % 2 ? "var(--card)" : awning} />
      ))}
      <Window x={8} y={-28} size={18} />
      <rect x={38} y={-28} width={16} height={30} rx={2} fill="var(--muted-foreground)" opacity={0.55} />
    </At>
  );
}

function Lamp({ x }: { x: number }) {
  return (
    <At x={x}>
      <rect x={-1.5} y={-56} width={3} height={58} fill="#5c5048" />
      <circle className="scene-lamp" cx={0} cy={-58} r={5} />
    </At>
  );
}

export function Cat({ x }: { x: number }) {
  return (
    <At x={x}>
      <path className="scene-tail" d="M7,-3 C16,-4 16,-14 12,-18" stroke="#3b302a" strokeWidth={2.5} fill="none" strokeLinecap="round" />
      <ellipse cx={0} cy={-6} rx={7} ry={7} fill="#3b302a" />
      <circle cx={-1} cy={-15} r={5} fill="#3b302a" />
      <path d="M-5,-18 l1,-5 l3,3 z M1,-19 l2,-5 l2,4 z" fill="#3b302a" />
    </At>
  );
}

function Clinic({ x }: { x: number }) {
  return (
    <At x={x}>
      <rect x={0} y={-60} width={96} height={62} rx={4} fill="var(--card)" />
      <rect x={-4} y={-64} width={104} height={7} rx={2} fill="var(--sky)" />
      <rect x={41} y={-54} width={14} height={14} rx={2} fill="var(--alert)" />
      <path d="M48,-51 v8 M44,-47 h8" stroke="white" strokeWidth={2.4} strokeLinecap="round" />
      <Window x={10} y={-34} />
      <Window x={74} y={-34} />
      <rect x={38} y={-22} width={20} height={24} rx={2} fill="color-mix(in srgb, var(--sky) 55%, white)" />
    </At>
  );
}

function Rabbit({ x }: { x: number }) {
  return (
    <At x={x}>
      <g className="scene-hop">
        <ellipse cx={0} cy={-6} rx={7} ry={5.5} fill="#f4ebdf" />
        <circle cx={6} cy={-10} r={3.6} fill="#f4ebdf" />
        <ellipse cx={5} cy={-17} rx={1.3} ry={4.5} fill="#f4ebdf" />
        <ellipse cx={8} cy={-16} rx={1.3} ry={4.5} fill="#f4ebdf" />
        <circle cx={-7} cy={-7} r={2} fill="white" />
      </g>
    </At>
  );
}

function ClockTower({ x }: { x: number }) {
  return (
    <At x={x}>
      <rect x={-17} y={-70} width={34} height={72} rx={3} fill="var(--card)" />
      <path d="M-22,-68 L0,-86 L22,-68 Z" fill="var(--plum)" />
      <circle cx={0} cy={-52} r={11} fill="#fffdf8" stroke="var(--plum)" strokeWidth={2} />
      <line className="scene-hand-hour" x1={0} y1={-52} x2={0} y2={-58} stroke="#2d241c" strokeWidth={2} strokeLinecap="round" />
      <line className="scene-hand-minute" x1={0} y1={-52} x2={0} y2={-61} stroke="#2d241c" strokeWidth={1.4} strokeLinecap="round" />
      <rect x={-6} y={-18} width={12} height={20} rx={6} fill="var(--mustard)" />
      <Window x={-12} y={-34} size={8} />
      <Window x={4} y={-34} size={8} />
    </At>
  );
}

function BusStop({ x }: { x: number }) {
  return (
    <At x={x}>
      <rect x={-1.5} y={-44} width={3} height={46} fill="#5c5048" />
      <circle cx={0} cy={-46} r={7} fill="var(--sky)" />
      <rect x={-3} y={-48} width={6} height={4} rx={1} fill="white" />
      <rect x={10} y={-30} width={44} height={4} rx={2} fill="var(--sky)" opacity={0.85} />
      <rect x={12} y={-27} width={2} height={29} fill="#5c5048" />
      <rect x={50} y={-27} width={2} height={29} fill="#5c5048" />
      <rect x={16} y={-10} width={32} height={3} rx={1} fill={wood} />
    </At>
  );
}

function Library({ x }: { x: number }) {
  return (
    <At x={x}>
      <rect x={-6} y={-4} width={122} height={6} rx={2} fill="color-mix(in srgb, var(--card) 80%, #8a6a4f)" />
      <rect x={0} y={-50} width={110} height={48} fill="var(--card)" />
      <path d="M-6,-48 L55,-74 L116,-48 Z" fill="var(--sage)" />
      {[10, 34, 70, 94].map((left) => <rect key={left} x={left} y={-46} width={7} height={42} rx={2} fill="color-mix(in srgb, var(--card) 85%, #8a6a4f)" />)}
      <rect x={45} y={-30} width={20} height={28} rx={9} fill="var(--primary)" />
      {/* A little stack of books over the door. */}
      <rect x={46} y={-44} width={18} height={4} rx={1} fill="var(--sky)" />
      <rect x={48} y={-40} width={14} height={4} rx={1} fill="var(--mustard)" />
    </At>
  );
}

function PostOffice({ x }: { x: number }) {
  return (
    <At x={x}>
      <rect x={0} y={-54} width={92} height={56} rx={3} fill="var(--card)" />
      <rect x={-4} y={-58} width={100} height={8} rx={2} fill="var(--alert)" />
      <rect x={34} y={-46} width={24} height={15} rx={2} fill="#fffdf8" stroke="var(--alert)" strokeWidth={1.5} />
      <path d="M35,-45 L46,-37 L57,-45" stroke="var(--alert)" strokeWidth={1.5} fill="none" />
      <Window x={10} y={-30} size={14} />
      <Window x={68} y={-30} size={14} />
      <rect x={38} y={-24} width={16} height={26} rx={2} fill="var(--mustard)" />
    </At>
  );
}

function Mailbox({ x }: { x: number }) {
  return (
    <At x={x}>
      <rect x={-2} y={-16} width={4} height={18} fill="#5c5048" />
      <rect x={-9} y={-34} width={18} height={20} rx={8} fill="var(--alert)" />
      <rect x={-5} y={-27} width={10} height={2} rx={1} fill="#2d241c" opacity={0.5} />
    </At>
  );
}

/** A noticeboard with notes pinned to it, like the family's own. */
function Noticeboard({ x }: { x: number }) {
  const notes = [["var(--mustard)", 5, -40], ["var(--sky)", 21, -38], ["var(--rose)", 37, -41], ["var(--sage)", 13, -26], ["var(--primary)", 30, -25]] as const;
  return (
    <At x={x}>
      <rect x={2} y={-22} width={3} height={24} fill={wood} />
      <rect x={45} y={-22} width={3} height={24} fill={wood} />
      <rect x={0} y={-48} width={50} height={32} rx={3} fill="#b08a63" />
      {notes.map(([colour, left, top], index) => (
        <g key={index} className="scene-flap-note" style={{ animationDelay: `${index * 0.5}s` }}>
          <rect x={left} y={top} width={10} height={10} fill={colour} transform={`rotate(${index % 2 ? 6 : -5} ${left + 5} ${top + 5})`} />
        </g>
      ))}
    </At>
  );
}

function Picnic({ x }: { x: number }) {
  return (
    <At x={x}>
      <path d="M0,0 L36,0 L44,6 L-8,6 Z" fill="var(--primary)" opacity={0.85} />
      <path d="M8,0 L4,6 M18,0 L18,6 M28,0 L32,6" stroke="#fffdf8" strokeWidth={2} />
      <rect x={14} y={-8} width={12} height={8} rx={2} fill={wood} />
      <path d="M15,-8 Q20,-14 25,-8" stroke={wood} strokeWidth={1.5} fill="none" />
    </At>
  );
}

/** The whole near countryside, a place for each page with fields and trees in between. */
function NearStrip() {
  const [home, market, square, park, library, post] = Array.from({ length: SCENE_COUNT }, (_unused, index) => sceneX(index));
  return (
    <svg width={LENGTH} height={HEIGHT} viewBox={`0 0 ${LENGTH} ${HEIGHT}`} aria-hidden="true" className="block">
      <path d={nearGround} fill="var(--hill-2)" />
      {/* Fields before home */}
      <Tree x={250} delay={0.4} />
      <Tree x={420} size={0.9} delay={1.1} />
      <Flowers x={600} colours={["var(--rose)", "var(--mustard)", "var(--rose)"]} />
      <Tree x={860} size={1.15} delay={0.2} />
      <Rabbit x={1020} />
      <Tree x={1180} delay={1.3} />
      <Flowers x={1300} colours={["var(--plum)", "var(--mustard)"]} />
      {/* Home and garden: Overview */}
      <WashingLine x={home - 250} />
      <Tree x={home - 110} size={1.1} />
      <Home x={home - 40} />
      <PlayingDog x={home - 190} />
      <Fence x={home + 54} length={92} />
      <Flowers x={home + 66} colours={["var(--rose)", "var(--mustard)", "var(--plum)", "var(--rose)"]} />
      <Tree x={home + 290} delay={0.8} />
      <Flowers x={home + 330} colours={["var(--mustard)", "var(--rose)"]} />
      {/* The market street: Tasks */}
      <Shop x={market - 160} awning="var(--primary)" />
      <Shop x={market - 80} awning="var(--mustard)" />
      <Shop x={market} awning="var(--sky)" />
      <Lamp x={market + 100} />
      <Shopper x={market - 150} />
      <Cat x={market + 130} />
      <Tree x={market + 300} size={1.05} delay={0.5} />
      {/* The town square with its clock: Calendar */}
      <Tree x={square - 150} size={0.95} delay={1.4} />
      <ClockTower x={square - 30} />
      <BusStop x={square + 40} />
      <Waiting x={square + 12} />
      <Flowers x={square + 130} colours={["var(--plum)", "var(--rose)", "var(--mustard)"]} />
      <Rabbit x={square + 300} />
      <Tree x={square + 380} delay={0.2} />
      {/* The park and the pond: Family */}
      <Tree x={park - 230} size={1.15} delay={0.7} />
      <Pond x={park - 170} />
      <Picnic x={park + 30} />
      <Bench x={park + 100} />
      <Grandma x={park + 112} />
      <KiteFlyer x={park + 28} />
      <Flowers x={park + 150} colours={["var(--mustard)", "var(--rose)", "var(--mustard)"]} />
      <Butterflies x={park + 155} />
      <Tree x={park + 205} delay={1.2} />
      <Clinic x={park + 330} />
      {/* The library: Knowledge */}
      <Flowers x={library - 130} colours={["var(--rose)", "var(--plum)"]} />
      <Library x={library - 70} />
      <Tree x={library + 90} size={1.1} delay={0.3} />
      <Bench x={library + 130} />
      <Reader x={library + 142} />
      <Tree x={library + 330} size={0.9} delay={0.9} />
      {/* The post office and noticeboard: Activity */}
      <PostOffice x={post - 80} />
      <Mailbox x={post + 34} />
      <Noticeboard x={post + 60} />
      <Postie x={post - 34} />
      <Tree x={post + 170} delay={0.6} />
      {/* Fields beyond */}
      <Flowers x={post + 260} colours={["var(--rose)", "var(--mustard)", "var(--rose)"]} />
      <Tree x={post + 400} size={1.2} delay={1.6} />
      <Tree x={post + 520} delay={0.1} />
      <Flowers x={post + 700} colours={["var(--mustard)", "var(--plum)"]} />
      <Tree x={post + 860} size={1.1} delay={0.7} />
      <Tree x={post + 1080} delay={1.4} />
    </svg>
  );
}

function FarStrip() {
  const trees = Array.from({ length: 16 }, (_unused, index) => 140 + index * 255 + (index % 3) * 40);
  return (
    <svg width={FAR_LENGTH} height={HEIGHT} viewBox={`0 0 ${FAR_LENGTH} ${HEIGHT}`} aria-hidden="true" className="block" style={{ marginLeft: -FAR_OFFSET }}>
      <path d={farHills} fill="var(--hill-1)" />
      {trees.map((x) => (
        <g key={x} transform={`translate(${x},${farY(x).toFixed(1)})`} opacity={0.55}>
          <rect x={-1.5} y={-10} width={3} height={10} fill={wood} />
          <circle cx={0} cy={-15} r={8} fill={leaf} />
        </g>
      ))}
    </svg>
  );
}

export function Bird({ top, duration, delay, scale = 1 }: { top: string; duration: number; delay: number; scale?: number }) {
  return (
    <span className="scene-bird" style={{ top, animationDuration: `${duration}s`, animationDelay: `${delay}s` }}>
      <span className="scene-bird-bob" style={{ animationDelay: `${delay / 3}s` }}>
        <svg width={22 * scale} height={12 * scale} viewBox="0 0 22 12">
          <g className="scene-flap" style={{ animationDelay: `${(delay % 1) * 0.3}s` }}>
            <path d="M1,6 Q6,0 11,6 Q16,0 21,6" stroke="currentColor" strokeWidth={2} fill="none" strokeLinecap="round" />
          </g>
        </svg>
      </span>
    </span>
  );
}

export function Cloud({ top, scale, duration, delay }: { top: string; scale: number; duration: number; delay: number }) {
  return (
    <span className="scene-cloud" style={{ top, animationDuration: `${duration}s`, animationDelay: `${delay}s` }}>
      <svg width={110 * scale} height={40 * scale} viewBox="0 0 110 40">
        <path d="M14,36 a12,12 0 0 1 4,-23 a18,18 0 0 1 33,-6 a16,16 0 0 1 28,6 a12,12 0 0 1 16,23 z" fill="currentColor" />
      </svg>
    </span>
  );
}

// A walk: out between 5% and 45% of the loop, a pause to turn round, back between 55% and 95%, another pause.
const WALKS = [[0.05, 0.45], [0.55, 0.95]] as const;
const along = (t: number) => (t < 0.05 ? 0 : t < 0.45 ? (t - 0.05) / 0.4 : t < 0.55 ? 1 : t < 0.95 ? 1 - (t - 0.55) / 0.4 : 0);

// The swings, in degrees, that limbs may use; each walk writes out a swing animation for each.
const SWINGS = [16, 24, 30] as const;
type Swing = (typeof SWINGS)[number];

/** The name a walk gives its animations, shared with its limbs. */
const WalkContext = createContext<string | null>(null);

const pct = (offset: number) => `${(offset * 100).toFixed(3)}%`;

/** Arms and legs: still in each pause, and whole strides from setting off to stopping, so never stopped mid-stride. */
function swingKeyframes(name: string, swing: number, duration: number, step: number) {
  const frames = ["0% { transform: rotate(0deg); }"];
  for (const [start, end] of WALKS) {
    const strides = Math.max(2, Math.round(((end - start) * duration) / step));
    frames.push(`${pct(start)} { transform: rotate(0deg); animation-timing-function: ease-in-out; }`);
    for (let stride = 1; stride < strides; stride += 1) {
      frames.push(`${pct(start + ((end - start) * stride) / strides)} { transform: rotate(${(stride % 2 ? 1 : -1) * swing}deg); animation-timing-function: ease-in-out; }`);
    }
    frames.push(`${pct(end)} { transform: rotate(0deg); }`);
  }
  frames.push("100% { transform: rotate(0deg); }");
  return `@keyframes ${name} { ${frames.join(" ")} }`;
}

/**
 * Someone who walks out `distance` along the ground and back again, stopping to turn round at each end. The steps
 * follow the shape of the ground, so feet stay on it over every rise and dip. The drawing inside faces right, and
 * its <Limb>s swing in step while it walks. The walk is written out as CSS animations, so it keeps going through
 * any re-render, and every part of it starts together.
 */
export function Walker({ x, distance, duration, delay = 0, shadow = 9, step = 300, children }: { x: number; distance: number; duration: number; delay?: number; shadow?: number; step?: number; children: React.ReactNode }) {
  const name = `walk-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const ground = useContext(GroundContext);
  const path = Array.from({ length: 41 }, (_unused, index) => {
    const offset = index / 40;
    const dx = along(offset) * distance;
    return `${pct(offset)} { transform: translate(${dx.toFixed(1)}px, ${(ground(x + dx) - ground(x)).toFixed(2)}px); }`;
  }).join(" ");
  const css = [
    `@keyframes ${name}-path { ${path} }`,
    // Turns round while stopped at each end.
    `@keyframes ${name}-turn { 0%, 49.99% { transform: scaleX(1); } 50%, 99.99% { transform: scaleX(-1); } 100% { transform: scaleX(1); } }`,
    ...SWINGS.flatMap((swing) => [swingKeyframes(`${name}-a${swing}`, swing, duration, step), swingKeyframes(`${name}-b${swing}`, -swing, duration, step)]),
    `.${name} { animation-duration: ${duration}ms; animation-delay: ${-delay}ms; animation-iteration-count: infinite; animation-timing-function: linear; }`,
  ].join("\n");
  return (
    <WalkContext.Provider value={name}>
      <At x={x}>
        <style>{css}</style>
        <g className={name} style={{ animationName: `${name}-path` }}>
          <Shadow width={shadow} />
          <g className={name} style={{ animationName: `${name}-turn` }}>{children}</g>
        </g>
      </At>
    </WalkContext.Provider>
  );
}

/**
 * An arm or leg that swings from its top while its Walker is moving, and hangs still whenever it stops. `side` "a"
 * swings opposite to "b". Outside a Walker it simply hangs.
 */
export function Limb({ side, swing, children }: { side: "a" | "b"; swing: Swing; children: React.ReactNode }) {
  const walk = useContext(WalkContext);
  return <g className={walk ? `scene-limb ${walk}` : "scene-limb"} style={walk ? { animationName: `${walk}-${side}${swing}` } : undefined}>{children}</g>;
}

/** A soft shadow on the grass, so whoever stands here is plainly on the ground. */
export function Shadow({ width }: { width: number }) {
  return <ellipse cx={0} cy={1} rx={width} ry={2.2} className="scene-shadow" />;
}

/** The dog, playing in the garden at home: it runs one way, turns, and runs back, wagging all the while. */
function PlayingDog({ x }: { x: number }) {
  return (
    <Walker x={x} distance={120} duration={9000} shadow={17} step={180}>
      <DogDrawing />
    </Walker>
  );
}

/** The family dog, standing with its paws at (0,0) and facing right. Its legs swing while a Walker moves it. */
export function DogDrawing() {
  return (
    <>
      <g transform="translate(-23,-24)">
        <path className="scene-dog-tail" d="M6,10 Q0,4 2,0" stroke="#a0714f" strokeWidth={3} fill="none" strokeLinecap="round" />
        <Limb side="a" swing={30}><rect x={8} y={14} width={4} height={12} rx={2} fill="#8f6243" /></Limb>
        <Limb side="b" swing={30}><rect x={28} y={14} width={4} height={12} rx={2} fill="#8f6243" /></Limb>
        <ellipse cx={20} cy={13} rx={15} ry={7} fill="#a0714f" />
        <Limb side="b" swing={30}><rect x={12} y={14} width={4} height={12} rx={2} fill="#a0714f" /></Limb>
        <Limb side="a" swing={30}><rect x={32} y={14} width={4} height={12} rx={2} fill="#a0714f" /></Limb>
        <circle cx={37} cy={7} r={6.5} fill="#a0714f" />
        <path d="M41,6 h5 a2.5,2.5 0 0 1 0,5 h-4 z" fill="#a0714f" />
        <ellipse cx={34} cy={6} rx={3} ry={5} fill="#7d5338" transform="rotate(-20 34 6)" />
        <circle cx={39.5} cy={5} r={1.1} fill="#2d241c" />
        <circle cx={45.5} cy={7.5} r={1.3} fill="#2d241c" />
      </g>
    </>
  );
}

export type Look = { shirt: string; skin: string; hair: string; trousers?: string };

/**
 * A person standing on the ground at their feet (0,0), facing right. When `walking`, the legs and the far arm swing
 * in step (driven by Walker). The near arm swings too, unless it is holding something: then `hand` draws what it holds,
 * at the hand, with the arm at rest (`reach` turns it forward, in degrees, about the shoulder; `hand={null}` holds
 * something drawn elsewhere). `nearArm` replaces the near arm altogether, for a gesture of its own.
 */
export function Figure({ look, walking = false, reach = 0, hand, nearArm, children }: { look: Look; walking?: boolean; reach?: number; hand?: React.ReactNode; nearArm?: React.ReactNode; children?: React.ReactNode }) {
  const legs = look.trousers ?? "#4a3d36";
  // Swings while walking; otherwise just hangs (or, for a standing foot, taps).
  const limb = (side: "a" | "b", swing: Swing, part: React.ReactNode, still?: string) =>
    walking ? <Limb side={side} swing={swing}>{part}</Limb> : <g className={still}>{part}</g>;
  return (
    <g>
      {limb("a", 24, <rect x={-4.5} y={-13} width={3.6} height={13} rx={1.6} fill={legs} />)}
      {limb("b", 24, <rect x={0.9} y={-13} width={3.6} height={13} rx={1.6} fill={legs} />, "scene-tap")}
      {limb("a", 16, <rect x={-7.5} y={-25} width={3} height={11} rx={1.5} fill={look.shirt} />)}
      <rect x={-5.5} y={-27} width={11} height={16} rx={4} fill={look.shirt} />
      <circle cx={0} cy={-32} r={5.2} fill={look.skin} />
      <path d="M-5.4,-33 a5.4,5.4 0 0 1 10.8,0 q-3,-2 -6,-1.5 q-3,0.5 -4.8,1.5 z" fill={look.hair} />
      <circle cx={2.6} cy={-32.4} r={0.7} fill="#2d241c" />
      {children}
      {nearArm ?? (hand !== undefined
        ? <g transform={`rotate(${-reach} 6 -24)`}><rect x={4.5} y={-25} width={3} height={11} rx={1.5} fill={look.shirt} /><circle cx={6} cy={-13.5} r={1.6} fill={look.skin} />{hand}</g>
        : limb("b", 16, <rect x={4.5} y={-25} width={3} height={11} rx={1.5} fill={look.shirt} />))}
    </g>
  );
}

/** A person sitting on a bench whose seat is at the ground position given, facing right. */
export function Sitting({ look, children }: { look: Look; children?: React.ReactNode }) {
  const legs = look.trousers ?? "#4a3d36";
  return (
    <g>
      <rect x={-2} y={-16} width={11} height={4} rx={2} fill={legs} />
      <rect x={6} y={-15} width={3.6} height={15} rx={1.6} fill={legs} />
      <rect x={-6} y={-30} width={11} height={16} rx={4} fill={look.shirt} />
      <g className="scene-nod">
        <circle cx={0} cy={-35} r={5.2} fill={look.skin} />
        <path d="M-5.4,-36 a5.4,5.4 0 0 1 10.8,0 q-3,-2 -6,-1.5 q-3,0.5 -4.8,1.5 z" fill={look.hair} />
        <circle cx={2.6} cy={-35.4} r={0.7} fill="#2d241c" />
      </g>
      {children}
    </g>
  );
}

export const people = {
  shopper: { shirt: "var(--teal)", skin: "#c98e64", hair: "#2d241c" },
  waiting: { shirt: "var(--plum)", skin: "#f1c7a5", hair: "#7a4b2a", trousers: "#38465c" },
  child: { shirt: "var(--mustard)", skin: "#8d5a3b", hair: "#1f1712", trousers: "#5b8fc7" },
  grandma: { shirt: "var(--rose)", skin: "#e8b58f", hair: "#d9d4cc", trousers: "#6b5a7a" },
  reader: { shirt: "var(--sky)", skin: "#f1c7a5", hair: "#b0683a" },
  postie: { shirt: "#3d5a8a", skin: "#a8714d", hair: "#2d241c", trousers: "#2c3e5c" },
} satisfies Record<string, Look>;

/** At the market: a shopper strolls between the shops, a full bag in hand. */
function Shopper({ x }: { x: number }) {
  return (
    <Walker x={x} distance={150} duration={12000} delay={2000}>
      <Figure
        look={people.shopper}
        walking
        hand={
          <g className="scene-bag">
            <path d="M4,-11 q2,-3.5 4,0" stroke="var(--mustard)" strokeWidth={1.2} fill="none" />
            <rect x={2} y={-11} width={8} height={9} rx={2} fill="var(--mustard)" />
            <circle cx={5} cy={-11.5} r={1.8} fill="var(--sage)" />
          </g>
        }
      />
    </Walker>
  );
}

/** At the town square: someone waits for the bus, tapping a foot and checking the time. */
function Waiting({ x }: { x: number }) {
  return (
    <At x={x}>
      <Shadow width={9} />
      <Figure look={people.waiting} nearArm={<g className="scene-watch"><rect x={4.5} y={-25} width={3} height={11} rx={1.5} fill={people.waiting.shirt} /></g>} />
    </At>
  );
}

/** In the park: a child flies a kite, arm up holding the string, wandering a little to keep it up. */
function KiteFlyer({ x }: { x: number }) {
  return (
    <Walker x={x} distance={40} duration={14000}>
      {/* The arm is raised forward, so the hand is at about (16, -29). */}
      <Figure look={people.child} walking reach={110} hand={null} />
      <g className="scene-kite">
        <path d="M16,-29 Q34,-58 44,-78" stroke="#fffdf8" strokeWidth={0.8} fill="none" opacity={0.9} />
        <path d="M44,-90 L52,-78 L44,-66 L36,-78 Z" fill="var(--primary)" />
        <path d="M44,-90 L44,-66 M36,-78 L52,-78" stroke="#fffdf8" strokeWidth={0.8} />
        <path className="scene-kite-tail" d="M44,-66 q-4,6 0,10 q4,5 0,10" stroke="var(--mustard)" strokeWidth={1.5} fill="none" />
      </g>
    </Walker>
  );
}

/** In the park: Grandma sits on the bench, nodding along. */
function Grandma({ x }: { x: number }) {
  return (
    <At x={x}>
      <Sitting look={people.grandma}>
        <circle cx={-3} cy={-40} r={2.6} fill={people.grandma.hair} />
        <rect x={3} y={-24} width={9} height={3} rx={1.5} fill={people.grandma.shirt} />
      </Sitting>
    </At>
  );
}

/** At the library: someone reads on the bench, turning the pages now and then. */
function Reader({ x }: { x: number }) {
  return (
    <At x={x}>
      <Sitting look={people.reader}>
        <rect x={3} y={-25} width={9} height={3} rx={1.5} fill={people.reader.shirt} />
        <path d="M9,-31 L15,-29 L15,-21 L9,-23 Z" fill="#fffdf8" />
        <path d="M9,-31 L3,-29 L3,-21 L9,-23 Z" fill="var(--primary)" opacity={0.85} />
        <path className="scene-page" d="M9,-31 L14,-29.5 L14,-21.5 L9,-23 Z" fill="#f4ebdf" />
      </Sitting>
    </At>
  );
}

/** At the post office: the postie walks between the door and the post box, satchel on, a letter held ready. */
function Postie({ x }: { x: number }) {
  return (
    <Walker x={x} distance={54} duration={8000} delay={3000}>
      <Figure look={people.postie} walking reach={30} hand={<rect x={4.5} y={-15} width={7} height={4.5} rx={0.6} fill="#fffdf8" stroke="var(--alert)" strokeWidth={0.6} />}>
        <path d="M-6,-37 h11 l2,2.4 h-13 z" fill={people.postie.shirt} />
        <path d="M-4,-26 L5,-14" stroke="#7d5338" strokeWidth={1.5} />
        <rect x={-1} y={-17} width={8} height={7} rx={1.5} fill="#8a6a4f" />
      </Figure>
    </Walker>
  );
}

/** Where each layer is slid to so the place at `x` sits on the focus point. The far hills slide less: they are further away. */
const nearPan = (x: number) => `translateX(${-x}px)`;
const farPan = (x: number) => `translateX(${-x * FAR_FACTOR}px)`;
/** How small each layer gets with the drone up at `altitude` (1 is down at a place, less is higher). The far hills shrink less. */
const nearLift = (altitude: number) => `scale(${altitude})`;
const farLift = (altitude: number) => `scale(${1 - (1 - altitude) * 0.45})`;

/** The picture, at the place for page `index`. Moving to another page flies there like a drone. */
export function HeroScene({ index }: { index: number }) {
  const nearPanRef = useRef<HTMLDivElement>(null);
  const farPanRef = useRef<HTMLDivElement>(null);
  const nearLiftRef = useRef<HTMLDivElement>(null);
  const farLiftRef = useRef<HTMLDivElement>(null);
  const shown = useRef<number | null>(null);

  useLayoutEffect(() => {
    const layers = [
      { pan: nearPanRef.current, lift: nearLiftRef.current, panTo: nearPan, liftTo: nearLift },
      { pan: farPanRef.current, lift: farLiftRef.current, panTo: farPan, liftTo: farLift },
    ];
    if (layers.some((layer) => !layer.pan || !layer.lift)) return;
    const from = shown.current;
    shown.current = index;
    const to = sceneX(index);
    const fly = from !== null && from !== index && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const steps = from === null ? 0 : Math.abs(index - from);
    // Further trips climb higher, so more of the countryside is in view on the way.
    const altitude = Math.max(0.5, 0.8 - 0.07 * steps);
    const duration = Math.min(2600, 1500 + 220 * steps);

    for (const { pan, lift, panTo, liftTo } of layers) {
      // A flight that starts mid-air carries on from wherever the camera is now.
      const panStart = getComputedStyle(pan!).transform;
      const liftStart = getComputedStyle(lift!).transform;
      pan!.getAnimations().forEach((animation) => animation.cancel());
      lift!.getAnimations().forEach((animation) => animation.cancel());
      // Where the camera rests afterwards, even if the flight is interrupted or never plays.
      pan!.style.transform = panTo(to);
      lift!.style.transform = liftTo(1);
      if (!fly) continue;
      // The glide along is one unbroken movement, gentle at each end; the climb and descent happen alongside it,
      // so the camera never stops at the top.
      pan!.animate([{ transform: panStart }, { transform: panTo(to) }], { duration, easing: "cubic-bezier(0.55, 0.05, 0.35, 1)" });
      lift!.animate([
        { transform: liftStart, easing: "cubic-bezier(0.3, 0, 0.6, 1)" },
        { transform: liftTo(altitude), offset: 0.48, easing: "cubic-bezier(0.4, 0, 0.5, 1)" },
        { transform: liftTo(1) },
      ], { duration });
    }
  }, [index]);

  return (
    <div aria-hidden="true" className="scene-root">
      <span className="hero-sun sun" />
      <span className="hero-sun moon" />
      <span className="scene-stars" />
      <span className="scene-shooting-star" />
      {/* Clouds and birds keep to the upper right of the sky, clear of the page's title and words. */}
      <div className="scene-sky">
        <Cloud top="6%" scale={0.9} duration={95} delay={-20} />
        <Cloud top="20%" scale={0.6} duration={130} delay={-75} />
        <Cloud top="1%" scale={0.7} duration={115} delay={-55} />
        <div className="scene-birds">
          <Bird top="11%" duration={26} delay={-4} />
          <Bird top="14%" duration={26} delay={-3.2} scale={0.8} />
          <Bird top="8%" duration={26} delay={-2.5} scale={0.7} />
          <Bird top="22%" duration={34} delay={-21} scale={0.85} />
          <Bird top="25%" duration={34} delay={-20.2} scale={0.7} />
        </div>
      </div>
      {/* Each layer is pinned at the focus point, two thirds across, and framed so the page's place sits on it. */}
      <div className="scene-anchor scene-far">
        <div ref={farLiftRef} className="scene-lift"><div ref={farPanRef} className="scene-camera"><FarStrip /></div></div>
      </div>
      <div className="scene-anchor">
        <div ref={nearLiftRef} className="scene-lift"><div ref={nearPanRef} className="scene-camera"><NearStrip /></div></div>
      </div>
      <span className="scene-fireflies" />
    </div>
  );
}
