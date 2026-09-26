// 저장: World ↔ JSON (SPEC 6). 파생 상태(장소 목록·숲 거리·색인·알림 큐)는 불러온 뒤 다시 계산한다.
import { Affinity } from './affinity';
import { emptyWorld } from './create';
import { recomputeLocations } from './map';
import { computeStats } from './stats';
import type {
  Building,
  Blueprint,
  Conversation,
  Decor,
  FeedEntry,
  Party,
  Rumor,
  Villager,
  World,
} from './types';
import { reindexBuildings } from './world';

export const SAVE_VERSION = 1;

type SavedRumor = Omit<Rumor, 'knowers'> & { knowers: number[] };
type SavedParty = Omit<Party, 'att'> & { att: number[] };

export interface SaveData {
  version: number;
  seed: number;
  rng: number;
  t: number;
  W: number;
  H: number;
  tiles: number[];
  buildings: Building[];
  decor: Decor[];
  blueprints: Blueprint[];
  nextId: number;
  vs: Villager[];
  aff: number[];
  rumors: SavedRumor[];
  rid: number;
  convs: Conversation[];
  cid: number;
  feed: FeedEntry[];
  flags: string[];
  weather: { rain: boolean; until: number };
  party: SavedParty | null;
  lastPartyCame: number | null;
  daily: Record<string, boolean>;
  lumber: number;
  namesUsed: number;
  arrivalsToday: number;
  treesPlanted: number;
}

/** World 를 JSON 으로 옮길 수 있는 객체로 만든다. */
export function toSave(w: World): SaveData {
  return {
    version: SAVE_VERSION,
    seed: w.seed,
    rng: w.rng.state,
    t: w.t,
    W: w.W,
    H: w.H,
    tiles: Array.from(w.tiles),
    buildings: w.buildings,
    decor: w.decor,
    blueprints: w.blueprints,
    nextId: w.nextId,
    vs: w.vs,
    aff: w.aff.toArray(w.vs.length),
    rumors: w.rumors.map((r) => ({ ...r, knowers: [...r.knowers] })),
    rid: w.rid,
    convs: w.convs,
    cid: w.cid,
    feed: w.feed.slice(0, 60),
    flags: [...w.flags],
    weather: w.weather,
    party: w.party ? { ...w.party, att: [...w.party.att] } : null,
    lastPartyCame: w.lastPartyCame,
    daily: w.daily,
    lumber: w.lumber,
    namesUsed: w.namesUsed,
    arrivalsToday: w.arrivalsToday,
    treesPlanted: w.treesPlanted,
  };
}

/** JSON 문자열로 저장한다. */
export function serialize(w: World): string {
  return JSON.stringify(toSave(w));
}

/** 저장에서 World 를 되살린다. 판이 다르거나 모양이 틀리면 null. */
export function fromSave(raw: unknown): World | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Partial<SaveData>;
  if (
    d.version !== SAVE_VERSION ||
    !Array.isArray(d.tiles) ||
    !Array.isArray(d.vs) ||
    typeof d.W !== 'number' ||
    typeof d.H !== 'number'
  )
    return null;
  const w = emptyWorld(d.seed ?? 1, d.W, d.H);
  w.rng.state = d.rng ?? 1;
  w.t = d.t ?? 0;
  w.tiles.set(d.tiles);
  w.buildings = d.buildings ?? [];
  w.decor = d.decor ?? [];
  w.blueprints = d.blueprints ?? [];
  w.nextId = d.nextId ?? 1;
  w.vs = d.vs;
  w.aff = Affinity.fromArray(d.vs.length, d.aff ?? []);
  w.rumors = (d.rumors ?? []).map((r) => ({ ...r, knowers: new Set(r.knowers) }));
  w.rid = d.rid ?? 0;
  w.convs = d.convs ?? [];
  w.cid = d.cid ?? 0;
  w.feed = d.feed ?? [];
  w.flags = new Set(d.flags ?? []);
  w.weather = d.weather ?? { rain: false, until: 0 };
  w.party = d.party ? { ...d.party, att: new Set(d.party.att) } : null;
  w.lastPartyCame = d.lastPartyCame ?? null;
  w.daily = d.daily ?? {};
  w.lumber = d.lumber ?? 0;
  w.namesUsed = d.namesUsed ?? 0;
  w.arrivalsToday = d.arrivalsToday ?? 0;
  w.treesPlanted = d.treesPlanted ?? 0;
  reindexBuildings(w);
  recomputeLocations(w);
  computeStats(w);
  return w;
}

/** JSON 문자열에서 되살린다. 깨졌으면 null. */
export function deserialize(json: string): World | null {
  try {
    return fromSave(JSON.parse(json));
  } catch {
    return null;
  }
}
