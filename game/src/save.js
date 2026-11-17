// Save and continue: cash, mission progress, the pistol and the stashes live
// in localStorage, so Continue on the title screen picks up where the player
// left off.
const KEY = 'palmera-bay-save-v1';

export function createSave(G) {
  const save = {
    save() {
      try {
        const data = {
          cash: G.cash,
          missionIndex: G.missions.state.index,
          missionStage: G.missions.state.stage,
          hasPistol: G.player.hasPistol,
          stashesTaken: G.missions.stashes.map((s) => s.taken),
          cashEarned: G.stats.cashEarned,
          missionsDone: G.stats.missionsDone,
          carsStolen: G.stats.carsStolen,
        };
        window.localStorage.setItem(KEY, JSON.stringify(data));
      } catch {
        // Storage unavailable (private mode, etc.): play on without saving.
      }
    },
    load() {
      try {
        const raw = window.localStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    hasSave() {
      try {
        return !!window.localStorage.getItem(KEY);
      } catch {
        return false;
      }
    },
    apply(data) {
      G.cash = data.cash || 0;
      G.stats.cashEarned = data.cashEarned || 0;
      G.stats.missionsDone = data.missionsDone || 0;
      G.stats.carsStolen = data.carsStolen || 0;
      G.missions.state.index = data.missionIndex || 0;
      G.missions.state.stage = data.missionStage || 0;
      G.missions.state.active = true;
      G.player.hasPistol = !!data.hasPistol;
      G.missions.stashes.forEach((s, i) => {
        s.taken = !!(data.stashesTaken && data.stashesTaken[i]);
        s.mesh.visible = G.missions.state.index >= 3 && !s.taken;
      });
      G.player.hp = 100;
      G.wanted = 0;
      G.lastCrimeT = G.time;
    },
  };
  G.save = save;
  return save;
}
