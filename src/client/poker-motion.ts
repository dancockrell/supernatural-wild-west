export interface HandMotion {
  name: string;
  sound: number;
  duration: number;
  delay: (index: number) => number;
  frames: (index: number, count: number) => Keyframe[];
}
/** Choreography uses the server's hand classification; it never evaluates awards. */
export function handMotion(rank: string): HandMotion {
  const still = { transform: "translate(0,0) rotate(0) scale(1)" };
  const beat = (transform: string, offset = 0.45): Keyframe => ({
    transform,
    offset,
  });
  const profiles: Record<string, HandMotion> = {
    Pair: {
      name: "pair",
      sound: 0,
      duration: 620,
      delay: () => 0,
      frames: (i) => [
        still,
        beat(`translate(${i ? -3 : 3}px,-13px) rotate(${i ? 5 : -5}deg)`),
        still,
      ],
    },
    "Two pair": {
      name: "two-pair",
      sound: 1,
      duration: 700,
      delay: (i) => Math.floor(i / 2) * 200,
      frames: (i) => [
        still,
        beat(`translateY(-15px) rotate(${i % 2 ? 6 : -6}deg)`),
        still,
      ],
    },
    "Three of a kind": {
      name: "three-kind",
      sound: 2,
      duration: 800,
      delay: (i) => i * 55,
      frames: (i) => [
        still,
        beat(
          `translate(${(i - 1) * 4}px,${i === 1 ? -23 : -13}px) rotate(${(i - 1) * 8}deg)`,
        ),
        still,
      ],
    },
    Straight: {
      name: "straight",
      sound: 3,
      duration: 650,
      delay: (i) => i * 120,
      frames: () => [still, beat("translateY(-20px) scale(1.08)", 0.4), still],
    },
    Flush: {
      name: "flush",
      sound: 4,
      duration: 1000,
      delay: () => 0,
      frames: (i, n) => [
        still,
        beat(
          `translate(${(i - (n - 1) / 2) * 4}px,${-19 + Math.abs(i - (n - 1) / 2) * 4}px) rotate(${(i - (n - 1) / 2) * 8}deg)`,
        ),
        still,
      ],
    },
    "Full house": {
      name: "full-house",
      sound: 5,
      duration: 800,
      delay: (i) => (i < 3 ? 0 : 260),
      frames: (i) => [
        still,
        beat(
          `translate(${i < 3 ? -4 : 6}px,${i < 3 ? -22 : -13}px) rotate(${i < 3 ? -3 : 5}deg)`,
        ),
        still,
      ],
    },
    "Four of a kind": {
      name: "four-kind",
      sound: 6,
      duration: 1000,
      delay: () => 0,
      frames: () => [
        still,
        beat("translateY(-25px) scale(1.08)", 0.32),
        beat("translateY(3px) scale(1)", 0.62),
        beat("translateY(-4px)", 0.76),
        still,
      ],
    },
    "Straight flush": {
      name: "straight-flush",
      sound: 7,
      duration: 1100,
      delay: (i) => i * 100,
      frames: () => [
        still,
        beat("translateY(-24px) rotateY(24deg) scale(1.1)", 0.35),
        beat("translateY(-14px) rotateY(-12deg)", 0.62),
        still,
      ],
    },
    "Royal flush": {
      name: "royal-flush",
      sound: 8,
      duration: 1500,
      delay: (i) => Math.abs(i - 2) * 90,
      frames: (i) => [
        still,
        beat(
          `translate(${(i - 2) * 5}px,${-34 + Math.abs(i - 2) * 7}px) rotate(${(i - 2) * 8}deg) scale(1.12)`,
          0.4,
        ),
        beat(
          `translate(${(i - 2) * 3}px,-18px) rotate(${(i - 2) * 4}deg)`,
          0.75,
        ),
        still,
      ],
    },
  };
  return (
    profiles[rank] || {
      name: "high-card",
      sound: 0,
      duration: 350,
      delay: () => 0,
      frames: () => [still, beat("translateY(3px)"), still],
    }
  );
}

/** Group only the cards participating in the server-named hand for choreography. */
export function handChoreographyIndices(cards: readonly number[], rank: string): number[] {
  const groups = new Map<number, number[]>();
  cards.forEach((card,index)=>{
    const value=card%13;
    groups.set(value,[...(groups.get(value)||[]),index]);
  });
  const size = rank === 'Pair' || rank === 'Two pair' ? 2
    : rank === 'Three of a kind' ? 3 : rank === 'Four of a kind' ? 4 : 0;
  if(size) return [...groups.values()].filter(g=>g.length===size).flat();
  if(rank==='Full house') return [...groups.values()].sort((a,b)=>b.length-a.length).flat();
  return cards.map((_,index)=>index);
}
