// FailoverLab: SimulationEngine Runtime
// Wraps pure reducer with clock timer, re-entrancy protection, and subscriber notification

import {
  simulationReducer,
  INITIAL_SIMULATION_STATE,
} from './transitions';
import type {
  SimulationState,
  SimulationAction,
  SimulationConfig,
} from './types';

export class SimulationEngine {
  private state: SimulationState;
  private listeners: Set<(state: SimulationState) => void> = new Set();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isRunning: boolean = true;
  private tickSpeed: number = 1; // 1x, 2x, 5x
  private activeTimeouts: Set<ReturnType<typeof setTimeout>> = new Set();

  constructor() {
    this.state = { ...INITIAL_SIMULATION_STATE };
    this.setupTimer();
  }

  public getState(): SimulationState {
    return this.state;
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }

  public getTickSpeed(): number {
    return this.tickSpeed;
  }

  public subscribe(listener: (state: SimulationState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const currentState = { ...this.state };
    this.listeners.forEach((listener) => listener(currentState));
  }

  public dispatch(action: SimulationAction) {
    const currentEpoch = this.state.resetEpoch;
    const nextState = simulationReducer(this.state, action);

    // Stale async discard check: If reset occurred, don't apply older mutations
    if (action.type !== 'RESET_SIMULATION' && nextState.resetEpoch !== currentEpoch) {
      return;
    }

    this.state = nextState;
    this.notify();
  }

  // --- Clock & Timer Management ---

  public start() {
    if (this.isRunning && this.intervalId !== null) return;
    this.isRunning = true;
    this.setupTimer();
    this.notify();
  }

  public pause() {
    this.isRunning = false;
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.notify();
  }

  public togglePlay() {
    if (this.isRunning) {
      this.pause();
    } else {
      this.start();
    }
  }

  public setTickSpeed(speed: number) {
    this.tickSpeed = speed;
    if (this.isRunning) {
      this.setupTimer();
    }
    this.notify();
  }

  private setupTimer() {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
    }
    const intervalMs = Math.max(150, 1000 / this.tickSpeed);
    this.intervalId = setInterval(() => {
      if (this.isRunning) {
        this.dispatch({ type: 'TICK' });
      }
    }, intervalMs);
  }

  public scheduleTimeout(fn: () => void, delayMs: number): ReturnType<typeof setTimeout> {
    const id = setTimeout(() => {
      this.activeTimeouts.delete(id);
      fn();
    }, delayMs);
    this.activeTimeouts.add(id);
    return id;
  }

  public clearAllTimeouts() {
    this.activeTimeouts.forEach((id) => clearTimeout(id));
    this.activeTimeouts.clear();
  }

  public destroy() {
    this.pause();
    this.clearAllTimeouts();
    this.listeners.clear();
  }

  // --- Primary Controls & Explicit Actions ---

  public tick(deltaSec?: number) {
    this.dispatch({ type: 'TICK', deltaSec });
  }

  public reset() {
    this.clearAllTimeouts();
    this.dispatch({ type: 'RESET_SIMULATION' });
  }

  public injectPrimaryOutage() {
    this.dispatch({ type: 'INJECT_PRIMARY_OUTAGE' });
  }

  public recoverPrimary() {
    this.dispatch({ type: 'RECOVER_PRIMARY' });
  }

  public triggerManualFailover() {
    this.dispatch({ type: 'TRIGGER_MANUAL_FAILOVER' });
  }

  public stepFailover() {
    this.dispatch({ type: 'STEP_FAILOVER' });
  }

  public retryRoutingUpdate() {
    this.dispatch({ type: 'RETRY_ROUTING_UPDATE' });
  }

  public controllerInterrupt() {
    this.pause();
    this.dispatch({ type: 'CONTROLLER_INTERRUPT' });
  }

  public resumeControllerReconcile() {
    this.dispatch({ type: 'RESUME_CONTROLLER_RECONCILE' });
    this.start();
  }

  public triggerManualFailback() {
    this.dispatch({ type: 'TRIGGER_MANUAL_FAILBACK' });
  }

  public reconcileReplication() {
    this.dispatch({ type: 'RECONCILE_REPLICATION' });
  }

  public dismissBlockedState() {
    this.dispatch({ type: 'DISMISS_BLOCKED_STATE' });
  }

  public updateConfig(config: Partial<SimulationConfig>) {
    this.dispatch({ type: 'UPDATE_CONFIG', config });
  }

  public restoreConfigDefaults() {
    this.dispatch({ type: 'RESTORE_CONFIG_DEFAULTS' });
  }

  public selectComponent(component: SimulationState['selectedComponent']) {
    this.dispatch({ type: 'SELECT_COMPONENT', component });
  }

  public setVoterVote(voterId: string, vote: 'PRIMARY_OUTAGE' | 'PRIMARY_HEALTHY' | 'ABSTAIN') {
    this.dispatch({ type: 'SET_VOTER_VOTE', voterId, vote });
  }

  // --- Scenario Injections & Compatibility Aliases ---

  public injectNetworkPartition() {
    this.dispatch({ type: 'INJECT_NETWORK_PARTITION' });
  }

  public restoreNetworkPartition() {
    this.dispatch({ type: 'RESTORE_NETWORK_PARTITION' });
  }

  public injectHighReplicationLag() {
    this.dispatch({ type: 'INJECT_HIGH_REPLICATION_LAG' });
  }

  public restoreReplicationLag() {
    this.dispatch({ type: 'RESTORE_REPLICATION_LAG' });
  }

  public injectStandbyUnready() {
    this.dispatch({ type: 'INJECT_STANDBY_UNREADY' });
  }

  public restoreStandbyReadiness() {
    this.dispatch({ type: 'RESTORE_STANDBY_READINESS' });
  }

  public injectRouteFailure() {
    this.dispatch({ type: 'INJECT_ROUTE_FAILURE' });
  }

  public restoreRouteHealth() {
    this.dispatch({ type: 'RESTORE_ROUTE_HEALTH' });
  }

  public triggerPrimaryDbCrash() {
    this.injectPrimaryOutage();
  }

  public triggerFlapping() {
    this.injectPrimaryOutage();
    this.scheduleTimeout(() => {
      this.recoverPrimary();
    }, 1500);
  }

  public triggerGracefulSwitchover() {
    this.triggerManualFailover();
  }

  public restoreBaseline() {
    this.reset();
  }
}

export const simulationEngine = new SimulationEngine();
