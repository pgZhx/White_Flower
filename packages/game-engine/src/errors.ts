export class GameError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'GameError';
    this.code = code;
  }
}

export class InvalidPhaseError extends GameError {
  constructor(expected: string, actual: string) {
    super('INVALID_PHASE', `Invalid phase: expected ${expected}, got ${actual}`);
  }
}

export class InvalidActionError extends GameError {
  constructor(message: string) {
    super('INVALID_ACTION', message);
  }
}

export class InvalidTargetError extends GameError {
  constructor(message: string) {
    super('INVALID_TARGET', message);
  }
}

export class NotYourTurnError extends GameError {
  constructor(message: string) {
    super('NOT_YOUR_TURN', message);
  }
}

export class GameOverError extends GameError {
  constructor(message: string) {
    super('GAME_OVER', message);
  }
}
