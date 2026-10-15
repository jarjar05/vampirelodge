import {
  At,
  Bird,
  Butterflies,
  Cat,
  Cloud,
  DogDrawing,
  Fence,
  Figure,
  GroundContext,
  leaf,
  leafLight,
  people,
  Shadow,
  Sitting,
  Walker,
  Window,
  wood,
  type Look,
} from "@/components/hero-scene";

/**
 * The welcome picture on the sign-in and setting-up screens: the whole family at home together, closer up than the
 * countryside along the top of the app. A child on the tree swing with Dad pushing, Grandpa watering the flowers,
 * Mum waving, Grandma rocking on the porch, and the dog running about. It keeps its proportions at any size or
 * zoom, trimming a little from the sides rather than stretching.
 */

const WIDTH = 900;
const HEIGHT = 440;
// People here are drawn larger than in the countryside.
const SCALE = 1.9;

const ground = (x: number) => 384 + 6 * Math.sin(x / 130) + 3 * Math.sin(x / 47 + 1);
const farHill = (x: number) => 300 + 20 * Math.sin(x / 170 + 0.5) + 8 * Math.sin(x / 61);

function hillPath(y: (x: number) => number) {
  const points: string[] = [];
  for (let x = 0; x <= WIDTH; x += 15) points.push(`${x},${y(x).toFixed(1)}`);
  return `M0,${HEIGHT} L${points.join(" L")} L${WIDTH},${HEIGHT} Z`;
}

const family: Record<"dad" | "mum" | "grandpa", Look> = {
  dad: { shirt: "var(--sky)", skin: "#c98e64", hair: "#2d241c", trousers: "#3f4a5c" },
  mum: { shirt: "var(--primary)", skin: "#e8b58f", hair: "#5a3420", trousers: "#5b4a6b" },
  grandpa: { shirt: "var(--sage)", skin: "#d9a07a", hair: "#e8e2d8", trousers: "#6b5440" },
};

/** Someone standing at `x`, drawn at the scene's larger size, with a shadow at their feet. `flip` faces them left. */
function Person({ x, flip = false, children }: { x: number; flip?: boolean; children: React.ReactNode }) {
  return (
    <At x={x}>
      <Shadow width={15} />
      <g transform={`scale(${flip ? -SCALE : SCALE},${SCALE})`}>{children}</g>
    </At>
  );
}

/** An arm that does something of its own: it turns about the shoulder, with a hand at the end. */
function Arm({ look, className, children }: { look: Look; className: string; children?: React.ReactNode }) {
  return (
    <g className={className}>
      <rect x={4.5} y={-25} width={3} height={11} rx={1.5} fill={look.shirt} />
      <circle cx={6} cy={-13.5} r={1.6} fill={look.skin} />
      {children}
    </g>
  );
}

function SwingTree() {
  const base = ground(150);
  return (
    <g>
      <rect x={138} y={196} width={24} height={base - 192} rx={7} fill={wood} />
      <path d="M156,244 Q206,230 262,236" stroke={wood} strokeWidth={10} fill="none" strokeLinecap="round" />
      <g className="scene-sway">
        <circle cx={150} cy={166} r={58} fill={leaf} />
        <circle cx={96} cy={200} r={40} fill={leaf} />
        <circle cx={208} cy={192} r={46} fill={leaf} />
        <circle cx={178} cy={132} r={38} fill={leaf} />
        <circle cx={116} cy={136} r={34} fill={leaf} />
        <circle cx={134} cy={134} r={16} fill={leafLight} opacity={0.45} />
        <circle cx={196} cy={170} r={12} fill={leafLight} opacity={0.4} />
      </g>
      {/* The swing hangs from the branch and swings towards Dad and back. */}
      <g className="welcome-swing">
        <line x1={228} y1={238} x2={228} y2={330} stroke="#6b5240" strokeWidth={2} />
        <line x1={252} y1={238} x2={252} y2={330} stroke="#6b5240" strokeWidth={2} />
        <rect x={220} y={328} width={40} height={6} rx={2} fill={wood} />
        <g transform="translate(238,348) scale(1.45)"><Sitting look={people.child} /></g>
      </g>
    </g>
  );
}

function House({ x }: { x: number }) {
  return (
    <At x={x}>
      {/* The porch, where Grandma sits. */}
      <rect x={-92} y={-8} width={100} height={10} rx={2} fill="color-mix(in srgb, var(--card) 70%, #8a6a4f)" />
      <rect x={-88} y={-96} width={4} height={90} fill="var(--card)" />
      <rect x={-96} y={-102} width={106} height={9} rx={3} fill="var(--primary)" />
      <g className="scene-smoke">
        <circle cx={172} cy={-226} r={6} /><circle cx={172} cy={-226} r={6} /><circle cx={172} cy={-226} r={6} />
      </g>
      <rect x={160} y={-222} width={24} height={54} fill="var(--accent-foreground)" />
      <rect x={0} y={-150} width={212} height={152} rx={5} fill="var(--card)" />
      <path d="M-16,-146 L106,-238 L228,-146 Z" fill="var(--primary)" />
      <Window x={22} y={-124} size={30} />
      <Window x={160} y={-124} size={30} />
      <Window x={22} y={-62} size={30} />
      <rect x={96} y={-72} width={36} height={74} rx={5} fill="var(--mustard)" />
      <circle cx={124} cy={-34} r={2.5} fill="#7d5338" />
      <Window x={160} y={-62} size={30} />
    </At>
  );
}

/** A bed of flowers, swaying a little. */
function FlowerBed({ x }: { x: number }) {
  const blooms = [["var(--rose)", 0, 22], ["var(--mustard)", 16, 30], ["var(--plum)", 32, 20], ["var(--rose)", 48, 28], ["var(--mustard)", 64, 18]] as const;
  return (
    <At x={x}>
      <ellipse cx={34} cy={2} rx={46} ry={6} fill="color-mix(in srgb, #8a6a4f 55%, var(--hill-2))" />
      {blooms.map(([colour, left, height], index) => (
        <g key={index} className="scene-sway" style={{ animationDelay: `${index * 0.4}s`, animationDuration: "3.5s" }}>
          <path d={`M${left},0 L${left},-${height}`} stroke={leaf} strokeWidth={2.5} />
          <path d={`M${left},-${height * 0.5} q6,-4 9,-1`} stroke={leaf} strokeWidth={2} fill="none" />
          <circle cx={left} cy={-height - 4} r={6} fill={colour} />
          <circle cx={left} cy={-height - 4} r={2.2} fill="#fffdf8" opacity={0.85} />
        </g>
      ))}
    </At>
  );
}

function RockingChair() {
  // Drawn at the people's scale, with the seat where a sitting person's hips go.
  return (
    <g>
      <path d="M-10,0.5 Q3,4 18,0.5" stroke={wood} strokeWidth={2} fill="none" strokeLinecap="round" />
      <path d="M-5,-12 L-6,0 M10,-12 L12,0" stroke={wood} strokeWidth={1.6} />
      <rect x={-7} y={-13} width={19} height={2.5} rx={1} fill={wood} />
      <path d="M-6,-12 L-9,-38" stroke={wood} strokeWidth={2.4} strokeLinecap="round" />
    </g>
  );
}

export function FamilyWelcome() {
  return (
    <div aria-hidden="true" className="scene-root">
      <span className="hero-sun sun welcome-orb" />
      <span className="hero-sun moon welcome-orb" />
      <span className="scene-stars" />
      <span className="scene-shooting-star" />
      {/* Clouds and birds keep to the right of the sky, clear of the words. */}
      <div className="scene-sky">
        <Cloud top="10%" scale={1.1} duration={110} delay={-30} />
        <Cloud top="24%" scale={0.75} duration={140} delay={-90} />
        <Cloud top="16%" scale={0.6} duration={125} delay={-60} />
        <div className="scene-birds">
          <Bird top="14%" duration={30} delay={-6} scale={1.2} />
          <Bird top="18%" duration={30} delay={-5.1} />
          <Bird top="12%" duration={30} delay={-4.4} scale={0.85} />
          <Bird top="30%" duration={38} delay={-24} />
        </div>
      </div>
      <svg className="welcome-art" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="xMidYMax slice">
        <GroundContext.Provider value={ground}>
          <path d={hillPath(farHill)} fill="var(--hill-1)" />
          {[40, 330, 520, 870].map((x) => (
            <g key={x} transform={`translate(${x},${farHill(x).toFixed(1)})`} opacity={0.6}>
              <rect x={-2} y={-14} width={4} height={14} fill={wood} />
              <circle cx={0} cy={-22} r={12} fill={leaf} />
            </g>
          ))}
          <path d={hillPath(ground)} fill="var(--hill-2)" />

          <SwingTree />
          <House x={640} />
          <Fence x={856} length={60} />
          <Cat x={886} />

          {/* Dad pushes the swing, in time with it. */}
          <Person x={318} flip>
            <Figure look={family.dad} nearArm={<Arm look={family.dad} className="welcome-push" />} />
          </Person>

          {/* Grandpa waters the flowers; the water falls from the spout onto them. */}
          <FlowerBed x={448} />
          <Butterflies x={470} />
          <Person x={418}>
            <Figure look={family.grandpa} reach={35} hand={
              <g>
                <rect x={3} y={-17} width={11} height={8} rx={2} fill="var(--sky)" />
                <path d="M13,-15 L21,-20" stroke="var(--sky)" strokeWidth={1.8} strokeLinecap="round" />
                <path d="M4,-17 q4,-5 8,0" stroke="var(--sky)" strokeWidth={1.2} fill="none" />
              </g>
            }>
              {[0, 1, 2].map((drop) => (
                <circle key={drop} className="welcome-drop" cx={20.5 + drop * 0.8} cy={-27.5} r={0.9} fill="var(--sky)" style={{ animationDelay: `${drop * 0.35}s` }} />
              ))}
            </Figure>
          </Person>

          {/* Mum waves hello. */}
          <Person x={520}>
            <Figure look={family.mum} nearArm={<Arm look={family.mum} className="welcome-wave" />} />
          </Person>

          {/* Grandma rocks gently on the porch. */}
          <At x={588}>
            <g transform={`scale(${SCALE})`}>
              <g className="welcome-rock">
                <RockingChair />
                <Sitting look={people.grandma}>
                  <circle cx={-3} cy={-40} r={2.6} fill={people.grandma.hair} />
                  <rect x={3} y={-24} width={9} height={3} rx={1.5} fill={people.grandma.shirt} />
                  <circle cx={12} cy={-20} r={2.2} fill="var(--mustard)" />
                </Sitting>
              </g>
            </g>
          </At>

          {/* The dog runs about on the grass in front of everyone. */}
          <GroundContext.Provider value={(x) => ground(x) + 30}>
            <Walker x={270} distance={200} duration={9000} step={200} shadow={26}>
              <g transform="scale(1.6)"><DogDrawing /></g>
            </Walker>
          </GroundContext.Provider>
        </GroundContext.Provider>
      </svg>
      <span className="scene-fireflies" />
    </div>
  );
}
