// Shared constants: team indices and a small fixed pool of scratch vectors so no
// simulation module ever allocates inside a tick.
export const TEAM = { DEPOT: 0, RAIDERS: 1 };

export const TICK_RATE = 60;
export const TICK_DT = 1 / 60;

export const ROUND_TIME = 100;
export const PLANT_TIME = 3.2;
export const DEFUSE_TIME = 5.0;
export const BOMB_TIME = 40;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;

export const EYE_STAND = 1.62;
export const EYE_CROUCH = 1.0;
export const PLAYER_RADIUS = 0.4;

// Economy
export const MONEY_START = 800;
export const MONEY_KILL = 300;
export const MONEY_WIN = 3250;
export const MONEY_LOSS = 1400;
export const MONEY_PLANT = 300;
